"""
Route: GET  /heatmap/replay
       POST /heatmap/replay  (reset)

Drives a live, time-anchored heatmap replay for the city map.

--- HOW IT WORKS ---

A background asyncio task (heatmap_replay_loop) streams the dataset
chronologically at the same cadence as the anomaly detector:
  - INCIDENTS_PER_TICK (3) new incidents are added every REPLAY_INTERVAL_SECONDS (0.066 s).
  - Points accumulate — they are never removed — so the heatmap density
    grows over time exactly as the real dataset builds up.
  - The loop is time-anchored: it computes the number of ticks that SHOULD
    have fired by now and processes any missed ticks in a single batch,
    preventing drift from event-loop jitter.
  - When the dataset is exhausted, the loop goes static (no more updates).

The frontend polls GET /heatmap/replay every 5 seconds and replaces the
heatmap layer with the returned points — creating a smooth, periodically
updated visual without hammering the server.

POST /heatmap/replay resets the accumulator and re-anchors the time
reference via an asyncio.Event, identical to the anomaly reset pattern.
No race condition is possible because only the loop modifies local state.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Replay constants — match the anomaly detector cadence exactly
# ---------------------------------------------------------------------------
_INCIDENTS_PER_TICK: int = 3
_REPLAY_INTERVAL_SECONDS: float = 0.066

# ---------------------------------------------------------------------------
# Shared state — written by background task, read by the endpoint.
# The cache holds [lat, lng, weight] triples ready for the frontend.
# ---------------------------------------------------------------------------
_heatmap_replay_cache: List[Dict[str, float]] = []
_replay_finished: bool = False

# asyncio.Event used as a race-free reset signal (see anomaly.py for rationale)
_reset_event: asyncio.Event = asyncio.Event()

# ---------------------------------------------------------------------------
# Weight helpers — identical to loader._build_heatmap_cache
# ---------------------------------------------------------------------------
_MAX_RESOLUTION_MINUTES: float = 1440.0  # 24 h cap used for normalisation


def _compute_weight(priority: Any, resolution_minutes: Any) -> float:
    """
    base_weight  = 2 if High priority, else 1
    duration_factor = clipped resolution_minutes / MAX, capped to [0, 1]; 0.5 for nulls
    weight = base_weight * duration_factor
    """
    base = 2.0 if str(priority).strip().lower() == "high" else 1.0
    if pd.isnull(resolution_minutes) or resolution_minutes <= 0:
        factor = 0.5
    else:
        factor = min(float(resolution_minutes), _MAX_RESOLUTION_MINUTES) / _MAX_RESOLUTION_MINUTES
    return round(base * factor, 4)


# ---------------------------------------------------------------------------
# Background replay task — started by main.py at startup
# ---------------------------------------------------------------------------

async def heatmap_replay_loop(df: pd.DataFrame) -> None:
    """
    Background asyncio task that streams dataset rows into the heatmap cache.

    Structure mirrors anomaly_replay_loop exactly:
      - Local time anchor + tick counter, never touched by the endpoint.
      - Reset is signalled via asyncio.Event; loop re-anchors itself.
      - Catch-up batching ensures deterministic tick count regardless of jitter.
    """
    global _heatmap_replay_cache, _replay_finished

    # ------------------------------------------------------------------
    # Pre-process the dataframe once, sorting chronologically.
    # ------------------------------------------------------------------
    df_work = df.copy()
    df_work["_start_dt"] = pd.to_datetime(df_work["start_datetime"], errors="coerce")

    # Pre-compute resolution_minutes for weight calculation
    start_col = pd.to_datetime(df_work["start_datetime"], errors="coerce")
    res = pd.Series(np.nan, index=df_work.index)
    if "closed_datetime" in df_work.columns:
        closed = pd.to_datetime(df_work["closed_datetime"], errors="coerce")
        res = (closed - start_col).dt.total_seconds() / 60.0
    if "resolved_datetime" in df_work.columns:
        resolved = pd.to_datetime(df_work["resolved_datetime"], errors="coerce")
        res = res.fillna((resolved - start_col).dt.total_seconds() / 60.0)
    df_work["_resolution_minutes"] = res

    # Drop rows with no parseable start time or invalid coordinates
    df_work = df_work.dropna(subset=["_start_dt", "latitude", "longitude"])
    df_work = df_work[
        (df_work["latitude"] != 0) & (df_work["longitude"] != 0)
    ]
    df_work = df_work.sort_values("_start_dt", kind="mergesort").reset_index(drop=True)

    total_rows = len(df_work)

    # ------------------------------------------------------------------
    # Local helper: initialise or reinitialise replay state.
    # ------------------------------------------------------------------
    def _init_state() -> tuple:
        """Zero the cache and return a fresh (anchor_time, processed_ticks)."""
        global _heatmap_replay_cache, _replay_finished
        _heatmap_replay_cache = []
        _replay_finished = False
        anchor = asyncio.get_event_loop().time()
        return anchor, 0

    # First-time init
    replay_start_time, processed_ticks = _init_state()
    _reset_event.clear()

    logger.info(
        "Heatmap replay loop started — %d usable rows, %d incidents/tick every %.3f s",
        total_rows, _INCIDENTS_PER_TICK, _REPLAY_INTERVAL_SECONDS,
    )

    while True:
        # ------------------------------------------------------------------
        # Check reset signal at the top of every iteration (same as anomaly).
        # The endpoint only sets the event; this loop re-anchors its own state.
        # ------------------------------------------------------------------
        if _reset_event.is_set():
            _reset_event.clear()
            replay_start_time, processed_ticks = _init_state()
            logger.info("Heatmap replay loop reset — re-anchored at t=0, cache cleared.")
            await asyncio.sleep(_REPLAY_INTERVAL_SECONDS)
            continue

        try:
            if not _replay_finished:
                now = asyncio.get_event_loop().time()
                expected_ticks = int((now - replay_start_time) / _REPLAY_INTERVAL_SECONDS)
                ticks_to_run = expected_ticks - processed_ticks

                if ticks_to_run > 0:
                    new_points: List[Dict[str, float]] = []

                    # Catch up all ticks that should have fired by now
                    for _ in range(ticks_to_run):
                        start_idx = processed_ticks * _INCIDENTS_PER_TICK
                        end_idx = min(start_idx + _INCIDENTS_PER_TICK, total_rows)
                        batch = df_work.iloc[start_idx:end_idx]

                        for _, row in batch.iterrows():
                            weight = _compute_weight(
                                row.get("priority"),
                                row["_resolution_minutes"],
                            )
                            new_points.append({
                                "lat": float(row["latitude"]),
                                "lng": float(row["longitude"]),
                                "weight": weight,
                            })

                        processed_ticks += 1

                        if end_idx >= total_rows:
                            _replay_finished = True
                            logger.info(
                                "Heatmap replay reached end of dataset (%d points total) — going static.",
                                len(_heatmap_replay_cache) + len(new_points),
                            )
                            break

                    # Extend the global cache ONCE after the batch (avoids repeated
                    # reference copies inside the tight inner loop).
                    if new_points:
                        _heatmap_replay_cache = _heatmap_replay_cache + new_points

        except Exception:
            logger.exception("Unhandled error in heatmap_replay_loop — continuing.")

        # Sleep precisely until the next theoretical tick
        now = asyncio.get_event_loop().time()
        next_tick_time = replay_start_time + ((processed_ticks + 1) * _REPLAY_INTERVAL_SECONDS)
        await asyncio.sleep(max(0.0, next_tick_time - now))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/heatmap/replay",
    summary="Current live heatmap replay points (accumulated from dataset)",
    tags=["Map Data"],
)
async def get_heatmap_replay() -> List[Dict[str, Any]]:
    """
    Returns all heatmap weight points accumulated so far by the replay loop.

    The background task adds ~3 incidents every 0.066 s in dataset
    chronological order.  The frontend polls this endpoint every 5 s and
    replaces the heatmap layer — producing a smooth, city-wide animation
    showing incidents building up over time.

    When the dataset is exhausted the response freezes at the final state.
    """
    return _heatmap_replay_cache


@router.post(
    "/heatmap/replay",
    summary="Reset the heatmap replay to the beginning",
    tags=["Map Data"],
)
async def reset_heatmap_replay() -> Dict[str, Any]:
    """
    Signals the background loop to clear its accumulator and restart from
    the first dataset row.

    Uses the same event-signal pattern as POST /anomaly/replay:
      - Only sets _reset_event; no shared time variables are written here.
      - The loop re-anchors its local state on its next iteration.

    Returns a confirmation payload immediately.
    """
    global _heatmap_replay_cache
    _heatmap_replay_cache = []
    _reset_event.set()
    logger.info("Heatmap replay reset requested via POST /heatmap/replay — event signalled.")
    return {"status": "reset", "message": "Heatmap replay restarted from the beginning."}
