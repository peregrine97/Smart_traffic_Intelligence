"""
Route: GET /anomaly
       POST /anomaly/replay

Returns the current anomaly scores for all zones/stations.
The background replay task (started in main.py) updates the cache every 0.066 seconds.
Frontend polls this endpoint every 5 seconds to update zone polygon colours
and the Anomaly Monitor sidebar cards.

Response shape:
{
  "zones": [{ zone, alert_level, incident_count, high_priority_ratio, mean_duration, anomaly_score }, ...],
  "progress": { "done": int, "total": int, "finished": bool }
}

--- HOW THE REPLAY WORKS (sliding-window mode) ---

Every 0.066s, INCIDENTS_PER_TICK (3) new incidents are pulled from the dataset
in chronological order and appended to a per-zone sliding-window deque together
with the incident's own start_datetime as its simulated timestamp.

After each batch, entries older than WINDOW_HOURS (24h) of SIMULATED time are
evicted from the front of each deque. "Simulated time" is defined as the
start_datetime of the most-recently-processed incident.

The incident count fed to the Isolation Forest is therefore the number of
incidents that occurred in the trailing 24h of the dataset's own timeline.
Because the model was trained on mean-incidents-per-day, and the window is
exactly one day, the feature scale matches training — fixing the all-Critical bug.

When the dataset is exhausted the loop sets _replay_finished=True and stops
updating — the scores freeze at the final state until the user manually resets
via POST /anomaly/replay.

POST /anomaly/replay resets the window deques and signals the background loop
via an asyncio.Event so the loop re-anchors its time reference atomically on
the very next iteration — no race between the reset writer and the loop reader.
"""

import asyncio
import logging
from collections import deque
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter

from backend.agents.anomaly_detector import TrafficAnomalyDetector
from backend.data.loader import get_dataframe

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Shared state — written by background task, read by endpoint
# ---------------------------------------------------------------------------
# Cache shape: {"zones": [...], "progress": {"done": int, "total": int, "finished": bool}}
_anomaly_cache: Dict[str, Any] = {"zones": [], "progress": {"done": 0, "total": 0, "finished": False}}
_detector: Optional[TrafficAnomalyDetector] = None

# How many incidents to stream in per tick
_INCIDENTS_PER_TICK = 3
_REPLAY_INTERVAL_SECONDS = 0.066

# Sliding-window size in hours of SIMULATED time.
# 6h matches the average duration of the model's training 'time_buckets'
# (Morning Peak=4h, Afternoon=6h, Evening Peak=5h, Night=9h).
_WINDOW_HOURS = 6

# Per-zone sliding-window deques.
# Each entry in a deque: (simulated_timestamp: pd.Timestamp, is_high: int, resolution_minutes: float|None)
_zone_windows: Dict[str, deque] = {}

# ---------------------------------------------------------------------------
# Reset signal — set by the endpoint, cleared by the background loop.
# ---------------------------------------------------------------------------
_reset_event: asyncio.Event = asyncio.Event()

# Read-only flags
_replay_finished: bool = False


# ---------------------------------------------------------------------------
# Initialisation (called by main.py)
# ---------------------------------------------------------------------------

def init_anomaly_detector(detector: TrafficAnomalyDetector) -> None:
    """
    Inject the fitted/loaded TrafficAnomalyDetector from main.py.
    Must be called before the background task starts.
    """
    global _detector
    _detector = detector
    logger.info("Anomaly route initialised with TrafficAnomalyDetector instance.")


def get_anomaly_cache() -> Dict[str, Any]:
    """Return the current anomaly cache (zones + progress)."""
    return _anomaly_cache


# ---------------------------------------------------------------------------
# Background replay task
# ---------------------------------------------------------------------------

async def anomaly_replay_loop(df: pd.DataFrame) -> None:
    """
    Background asyncio task. Uses a strictly time-anchored deterministic loop.

    The loop is structured around a LOCAL time anchor and tick counter that
    are only updated inside the loop itself. When the reset endpoint fires,
    it sets _reset_event, which the loop checks at the top of each iteration.
    On seeing the event the loop immediately re-anchors its own local state —
    no global time variables are written by the endpoint, so there is no race.

    At exactly T seconds after any restart, exactly round(T / INTERVAL) ticks
    have been processed, deterministically, regardless of event-loop jitter.
    """
    global _anomaly_cache, _zone_accumulators, _replay_finished

    # ------------------------------------------------------------------
    # Pre-process the full dataframe once.
    # ------------------------------------------------------------------
    df_work = df.copy()
    df_work["_start_dt"] = pd.to_datetime(df_work["start_datetime"], errors="coerce")

    # zone_or_station: null zone → group by police_station
    zone_series = df_work["zone"] if "zone" in df_work.columns else pd.Series(np.nan, index=df_work.index)
    ps_series   = df_work["police_station"] if "police_station" in df_work.columns else pd.Series(np.nan, index=df_work.index)
    df_work["_zone_or_station"] = zone_series.fillna(ps_series).fillna("Unknown")

    # is_high_priority flag
    df_work["_is_high"] = df_work["priority"].apply(
        lambda p: 1 if str(p).strip().lower() == "high" else 0
    )

    # Pre-compute resolution_minutes from raw timestamps
    start_col = pd.to_datetime(df_work["start_datetime"], errors="coerce")
    res = pd.Series(np.nan, index=df_work.index)
    if "closed_datetime" in df_work.columns:
        closed = pd.to_datetime(df_work["closed_datetime"], errors="coerce")
        res = (closed - start_col).dt.total_seconds() / 60.0
    if "resolved_datetime" in df_work.columns:
        resolved = pd.to_datetime(df_work["resolved_datetime"], errors="coerce")
        fallback = (resolved - start_col).dt.total_seconds() / 60.0
        res = res.fillna(fallback)
    df_work["_resolution_minutes"] = res

    # Drop rows with no parseable start_datetime
    df_work = df_work.dropna(subset=["_start_dt"]).reset_index(drop=True)

    # Sort chronologically — this sort is deterministic (stable, same input every time)
    df_work = df_work.sort_values("_start_dt", kind="mergesort").reset_index(drop=True)

    # All unique zones in baseline (excluding the Unknown catch-all)
    if _detector is not None and _detector.baseline_stats is not None:
        all_zones = [
            z for z in _detector.baseline_stats["zone_or_station"].unique()
            if z != "Unknown"
        ]
    else:
        all_zones = sorted([
            z for z in df_work["_zone_or_station"].unique()
            if z != "Unknown"
        ])

    total_rows = len(df_work)

    # Window size as a pandas Timedelta (simulated time, not wall-clock)
    window_td = pd.Timedelta(hours=_WINDOW_HOURS)

    # ------------------------------------------------------------------
    # Local helper: initialise / reinitialise replay state.
    # Returns the new (replay_start_time, processed_ticks) tuple.
    # ------------------------------------------------------------------
    def _init_replay_state() -> tuple:
        """Zero out sliding-window deques and return a fresh time anchor."""
        global _zone_windows, _replay_finished, _anomaly_cache

        _zone_windows = {zone: deque() for zone in all_zones}
        _replay_finished = False

        # Zero the cache immediately so the frontend sees cleared state
        _anomaly_cache = {
            "zones": [
                {
                    "zone": zone,
                    "alert_level": "Normal",
                    "incident_count": 0,
                    "high_priority_ratio": 0.0,
                    "mean_duration": 0.0,
                    "anomaly_score": 0.1,
                }
                for zone in all_zones
            ],
            "progress": {"done": 0, "total": total_rows, "finished": False},
        }

        anchor = asyncio.get_event_loop().time()
        return anchor, 0

    # First-time initialisation
    replay_start_time, processed_ticks = _init_replay_state()
    _reset_event.clear()

    logger.info(
        "Anomaly replay loop started — %d zones, %d total incidents, "
        "%d incidents/tick every %.3fs",
        len(all_zones), total_rows, _INCIDENTS_PER_TICK, _REPLAY_INTERVAL_SECONDS,
    )

    while True:
        # ------------------------------------------------------------------
        # Check for a reset signal FIRST, before doing any work.
        # This is the key fix: the endpoint only sets the event; the loop
        # re-anchors its OWN local state here, with no global time variable
        # written by the endpoint. No race is possible.
        # ------------------------------------------------------------------
        if _reset_event.is_set():
            _reset_event.clear()
            replay_start_time, processed_ticks = _init_replay_state()
            logger.info(
                "Anomaly replay loop acknowledged reset — re-anchored at t=0. "
                "All accumulators cleared."
            )
            # Sleep for exactly one tick interval before starting to accumulate,
            # so the first real update comes at t=INTERVAL (consistent with startup).
            await asyncio.sleep(_REPLAY_INTERVAL_SECONDS)
            continue

        try:
            if _detector is not None and _detector.model is not None:
                if not _replay_finished:
                    now = asyncio.get_event_loop().time()
                    expected_ticks = int((now - replay_start_time) / _REPLAY_INTERVAL_SECONDS)
                    ticks_to_run = expected_ticks - processed_ticks

                    if ticks_to_run > 0:
                        overall_mean = _detector.overall_mean_duration

                        # --- Track the latest simulated timestamp seen so we can evict old entries ---
                        last_sim_time: Optional[pd.Timestamp] = None

                        # Catch up all expected ticks that should have passed by this exact millisecond
                        for _ in range(ticks_to_run):
                            start_index = processed_ticks * _INCIDENTS_PER_TICK
                            end_index = min(start_index + _INCIDENTS_PER_TICK, total_rows)
                            batch = df_work.iloc[start_index:end_index]

                            for _, row in batch.iterrows():
                                zone = row["_zone_or_station"]
                                sim_ts = row["_start_dt"]

                                # Advance simulated clock
                                if last_sim_time is None or sim_ts > last_sim_time:
                                    last_sim_time = sim_ts

                                if zone == "Unknown" or zone not in _zone_windows:
                                    continue

                                res_min = row["_resolution_minutes"]
                                valid_res = float(res_min) if (pd.notnull(res_min) and 0 < res_min <= 1440) else None

                                # Append (simulated_ts, is_high, resolution_minutes|None)
                                _zone_windows[zone].append((sim_ts, int(row["_is_high"]), valid_res))

                            processed_ticks += 1
                            if end_index >= total_rows:
                                _replay_finished = True
                                logger.info("Anomaly stream reached end of dataset — going static.")
                                break

                        # ----------------------------------------------------------
                        # Evict entries older than the 24h sliding window, then score
                        # ----------------------------------------------------------
                        cutoff = (last_sim_time - window_td) if last_sim_time is not None else None

                        scores = []
                        for zone in all_zones:
                            dq = _zone_windows[zone]

                            # Evict entries that have aged out of the 24h window
                            if cutoff is not None:
                                while dq and dq[0][0] < cutoff:
                                    dq.popleft()

                            count = len(dq)

                            if count == 0:
                                scores.append({
                                    "zone": zone,
                                    "alert_level": "Normal",
                                    "incident_count": 0,
                                    "high_priority_ratio": 0.0,
                                    "mean_duration": 0.0,
                                    "anomaly_score": 0.1,
                                })
                                continue

                            high_count = sum(entry[1] for entry in dq)
                            high_priority_ratio = high_count / count

                            # Mean duration from valid entries in window; fall back to overall mean
                            dur_vals = [entry[2] for entry in dq if entry[2] is not None]
                            mean_duration = (sum(dur_vals) / len(dur_vals)) if dur_vals else overall_mean

                            # count is per-day-equivalent because window == 24h == 1 day
                            X_live = np.array([[float(count), float(high_priority_ratio), float(mean_duration)]])
                            anomaly_score = float(_detector.model.decision_function(X_live)[0])

                            if anomaly_score > 0.0:
                                alert_level = "Normal"
                            elif anomaly_score >= -0.1:
                                alert_level = "Watch"
                            else:
                                alert_level = "Critical"

                            scores.append({
                                "zone": zone,
                                "alert_level": alert_level,
                                "incident_count": count,
                                "high_priority_ratio": round(high_priority_ratio, 4),
                                "mean_duration": round(mean_duration, 1),
                                "anomaly_score": round(anomaly_score, 4),
                            })

                        _anomaly_cache = {
                            "zones": scores,
                            "progress": {
                                "done": min(processed_ticks * _INCIDENTS_PER_TICK, total_rows),
                                "total": total_rows,
                                "finished": _replay_finished,
                            },
                        }

            else:
                placeholder = _build_placeholder_cache(df_work)
                _anomaly_cache = {
                    "zones": placeholder,
                    "progress": {"done": 0, "total": total_rows, "finished": False},
                }

        except Exception as exc:
            logger.exception("Unhandled error in anomaly_replay_loop: %s", exc)

        # Sleep precisely until the NEXT theoretical tick should happen,
        # computed from the LOCAL replay_start_time (not the global).
        now = asyncio.get_event_loop().time()
        next_tick_time = replay_start_time + ((processed_ticks + 1) * _REPLAY_INTERVAL_SECONDS)
        sleep_duration = max(0.0, next_tick_time - now)
        await asyncio.sleep(sleep_duration)


def _build_placeholder_cache(df_work: pd.DataFrame) -> List[Dict[str, Any]]:
    """Return all zones as Normal when the detector is not available."""
    zones: set = set()
    if "_zone_or_station" in df_work.columns:
        zones.update(
            z for z in df_work["_zone_or_station"].dropna().unique()
            if z != "Unknown"
        )
    elif "zone" in df_work.columns:
        zones.update(df_work["zone"].dropna().unique().tolist())
    if "police_station" in df_work.columns:
        null_zone_mask = (
            df_work["zone"].isna() if "zone" in df_work.columns
            else pd.Series(True, index=df_work.index)
        )
        zones.update(df_work.loc[null_zone_mask, "police_station"].dropna().unique().tolist())

    return [
        {
            "zone": z,
            "alert_level": "Normal",
            "incident_count": 0,
            "high_priority_ratio": 0.0,
            "mean_duration": 0.0,
            "anomaly_score": 0.1,
        }
        for z in sorted(zones)
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/anomaly",
    summary="Current anomaly scores for all zones + replay progress",
    tags=["Anomaly"],
)
async def get_anomaly() -> Dict[str, Any]:
    """
    Returns the most recently computed anomaly scores for every zone/station,
    plus replay progress metadata.

    Shape:
    {
      "zones": [{ zone, alert_level, incident_count, high_priority_ratio,
                  mean_duration, anomaly_score }, ...],
      "progress": { "done": int, "total": int, "finished": bool }
    }
    """
    if not _anomaly_cache.get("zones"):
        try:
            df = get_dataframe()
            df_work = df.copy()
            zone_series = df_work["zone"] if "zone" in df_work.columns else pd.Series(np.nan, index=df_work.index)
            ps_series   = df_work["police_station"] if "police_station" in df_work.columns else pd.Series(np.nan, index=df_work.index)
            df_work["_zone_or_station"] = zone_series.fillna(ps_series).fillna("Unknown")
            total = len(df_work)
            placeholder = _build_placeholder_cache(df_work)
            return {"zones": placeholder, "progress": {"done": 0, "total": total, "finished": False}}
        except Exception:
            return {"zones": [], "progress": {"done": 0, "total": 0, "finished": False}}

    return _anomaly_cache


@router.post(
    "/anomaly/replay",
    summary="Reset the anomaly replay to the beginning",
    tags=["Anomaly"],
)
async def reset_anomaly_replay() -> Dict[str, Any]:
    """
    Signals the background loop to restart from tick 0.

    Rather than writing to shared time variables (which races with the loop
    reader), this endpoint only sets _reset_event. The background loop checks
    this event at the top of each iteration and performs the re-anchor itself
    inside the event-loop thread — atomically and without any race condition.

    Returns the zeroed-out cache immediately for frontend responsiveness.
    """
    global _anomaly_cache

    # Zero out the cache immediately so the frontend sees cleared values
    # before the background loop processes the event.
    current_total = _anomaly_cache.get("progress", {}).get("total", 0)
    zeroed_zones = [
        {**entry, "incident_count": 0, "high_priority_ratio": 0.0,
         "mean_duration": 0.0, "alert_level": "Normal", "anomaly_score": 0.1}
        for entry in _anomaly_cache.get("zones", [])
    ]
    _anomaly_cache = {
        "zones": zeroed_zones,
        "progress": {"done": 0, "total": current_total, "finished": False},
    }

    # Signal the loop — it will re-anchor on its next iteration.
    _reset_event.set()

    logger.info("Anomaly replay reset requested via POST /anomaly/replay — event signalled.")
    return _anomaly_cache
