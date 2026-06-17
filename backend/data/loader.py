"""
backend/data/loader.py

Central data loading and pre-computation module.

Loads the Bengaluru traffic incidents CSV once at server startup into a
shared in-memory DataFrame, then pre-computes:
  - Heatmap weight points  (cached as list of dicts)
  - Analytics payloads     (cached as a single dict)
  - Junction lookup table  (junction → count, used by PredictionAgent fallback)

All other route modules import the get_dataframe() / get_*_cache() helpers
from here — they never read the CSV themselves.
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dataset path — relative to project root; resolved at import time
# ---------------------------------------------------------------------------
_CSV_PATH = Path(__file__).parent / "bengaluru_traffic_incidents.csv"

# ---------------------------------------------------------------------------
# In-memory state (populated by load_dataset() at startup)
# ---------------------------------------------------------------------------
_df: Optional[pd.DataFrame] = None
_heatmap_cache: Optional[List[Dict[str, float]]] = None
_analytics_cache: Optional[Dict[str, Any]] = None
_junction_lookup: Dict[str, int] = {}
_corridor_counts: Dict[str, int] = {}

# Corridor rank mappings (mirrors PredictionAgent constants)
_ORR_VARIANTS = {"ORR East 1", "ORR East 2", "ORR North 1", "ORR North 2", "ORR West 1"}
_NON_CORRIDOR = {"Non-corridor"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _corridor_rank(corridor: Any) -> int:
    """Return ordinal corridor rank: named=2, ORR variant=1, non/null=0."""
    if pd.isna(corridor) or corridor is None:
        return 0
    c = str(corridor).strip()
    if c in _ORR_VARIANTS:
        return 1
    if c in _NON_CORRIDOR or c == "":
        return 0
    return 2  # any named corridor that is not ORR or Non-corridor


def _compute_resolution_minutes(df: pd.DataFrame) -> pd.Series:
    """
    Compute resolution_minutes from closed_datetime (primary) or
    resolved_datetime (fallback).  Returns a float Series; NaN where
    neither timestamp is available.
    """
    start = pd.to_datetime(df["start_datetime"], errors="coerce")
    res = pd.Series(np.nan, index=df.index)

    if "closed_datetime" in df.columns:
        closed = pd.to_datetime(df["closed_datetime"], errors="coerce")
        res = (closed - start).dt.total_seconds() / 60.0

    if "resolved_datetime" in df.columns:
        resolved = pd.to_datetime(df["resolved_datetime"], errors="coerce")
        fallback = (resolved - start).dt.total_seconds() / 60.0
        res = res.fillna(fallback)

    return res


def _build_heatmap_cache(df: pd.DataFrame) -> List[Dict[str, float]]:
    """
    Build heatmap weight list.

    Weight formula (AGENTS.md §7):
      base_weight  = 2 if priority == "High", else 1
      duration_factor = normalised resolution_minutes (0–1); 0.5 for nulls
      weight = base_weight * duration_factor
    """
    working = df.copy()

    # Base weight
    working["base_weight"] = working["priority"].apply(
        lambda p: 2.0 if str(p).strip().lower() == "high" else 1.0
    )

    # Resolution minutes (capped at 1440 for normalisation)
    res_min = _compute_resolution_minutes(working)
    valid = res_min[(res_min > 0) & (res_min <= 1440)]
    max_res = valid.max() if len(valid) > 0 else 1440.0

    duration_factor = res_min.copy()
    duration_factor = duration_factor.clip(lower=0, upper=1440)
    duration_factor = (duration_factor / max_res).fillna(0.5)

    working["weight"] = working["base_weight"] * duration_factor

    # Drop rows without valid coordinates
    working = working.dropna(subset=["latitude", "longitude"])
    working = working[
        (working["latitude"] != 0) & (working["longitude"] != 0)
    ]

    points = [
        {"lat": float(row["latitude"]), "lng": float(row["longitude"]), "weight": round(float(row["weight"]), 4)}
        for _, row in working[["latitude", "longitude", "weight"]].iterrows()
    ]
    logger.info("Heatmap cache built: %d points", len(points))
    return points


def _build_analytics_cache(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Pre-compute all four analytics payloads from the full dataset.

    1. volume_grid     — 7×24 matrix (day_of_week × hour_of_day)
    2. top_junctions   — top 15 junctions by incident count
    3. corridor_durations — median resolution time by corridor rank
    4. planned_vs_unplanned — monthly volumes
    """
    working = df.copy()
    working["start_dt"] = pd.to_datetime(working["start_datetime"], errors="coerce")
    working["hour_of_day"] = working["start_dt"].dt.hour
    working["day_of_week"] = working["start_dt"].dt.dayofweek
    working["resolution_minutes"] = _compute_resolution_minutes(working)
    working["corridor_rank"] = working["corridor"].apply(_corridor_rank)

    # ── Chart 1: volume_grid (7 × 24) ────────────────────────────────────────
    grid_counts = (
        working.dropna(subset=["day_of_week", "hour_of_day"])
        .groupby(["day_of_week", "hour_of_day"])
        .size()
        .unstack(fill_value=0)
    )
    # Ensure all 7 days and 24 hours are present
    grid_counts = grid_counts.reindex(range(7), fill_value=0)
    grid_counts = grid_counts.reindex(columns=range(24), fill_value=0)
    volume_grid = grid_counts.values.tolist()  # list of 7 lists, each len 24

    # ── Chart 2: top_junctions ────────────────────────────────────────────────
    junc_df = working.dropna(subset=["junction"])
    junc_df = junc_df[junc_df["junction"].str.strip() != ""]
    junc_counts = junc_df.groupby("junction").size().sort_values(ascending=False).head(15)

    # Compute representative lat/lng for each junction (median of all incidents)
    junc_coords = (
        junc_df.groupby("junction")[["latitude", "longitude"]].median().reset_index()
    )

    top_junctions = []
    for junc, count in junc_counts.items():
        coords = junc_coords[junc_coords["junction"] == junc]
        lat = float(coords["latitude"].values[0]) if len(coords) > 0 else 12.9716
        lng = float(coords["longitude"].values[0]) if len(coords) > 0 else 77.5946
        top_junctions.append({"junction": junc, "count": int(count), "lat": lat, "lng": lng})

    # ── Chart 3: corridor_durations ───────────────────────────────────────────
    valid_dur = working[
        (working["resolution_minutes"] > 0) & (working["resolution_minutes"] <= 1440)
    ].copy()

    corridor_labels = {0: "Non-Corridor", 1: "ORR Variant", 2: "Named Corridor"}
    corridor_durations = []
    for rank in [0, 1, 2]:
        subset = valid_dur[valid_dur["corridor_rank"] == rank]["resolution_minutes"]
        median_min = int(subset.median()) if len(subset) > 0 else 0
        corridor_durations.append({
            "corridor_rank": rank,
            "label": corridor_labels[rank],
            "median_minutes": median_min,
        })

    # ── Chart 4: planned_vs_unplanned (monthly) ───────────────────────────────
    # Filter out rows with unparseable start_datetime before period conversion.
    # Use tz_convert(None) (not tz_localize) because the series is timezone-aware (UTC).
    valid_dt = working[working["start_dt"].notna()].copy()
    valid_dt["month"] = valid_dt["start_dt"].dt.tz_convert(None).dt.to_period("M").astype(str)
    monthly = (
        valid_dt
        .groupby(["month", "event_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    # Ensure both columns exist
    if "planned" not in monthly.columns:
        monthly["planned"] = 0
    if "unplanned" not in monthly.columns:
        monthly["unplanned"] = 0

    planned_vs_unplanned = [
        {
            "month": row["month"],
            "planned": int(row.get("planned", 0)),
            "unplanned": int(row.get("unplanned", 0)),
        }
        for _, row in monthly.sort_values("month").iterrows()
    ]

    logger.info(
        "Analytics cache built — grid: 7×24, top junctions: %d, corridor: 3, monthly: %d",
        len(top_junctions),
        len(planned_vs_unplanned),
    )

    return {
        "volume_grid": volume_grid,
        "top_junctions": top_junctions,
        "corridor_durations": corridor_durations,
        "planned_vs_unplanned": planned_vs_unplanned,
    }


def _build_junction_lookup(df: pd.DataFrame) -> Dict[str, int]:
    """Return junction → occurrence count mapping for PredictionAgent fallback."""
    junc_df = df.dropna(subset=["junction"])
    junc_df = junc_df[junc_df["junction"].str.strip() != ""]
    lookup = junc_df.groupby("junction").size().to_dict()
    return {k: int(v) for k, v in lookup.items()}

def _build_corridor_counts(df: pd.DataFrame) -> Dict[str, int]:
    """Return corridor → occurrence count mapping for PredictionAgent."""
    counts = df["corridor"].value_counts().to_dict()
    return {str(k): int(v) for k, v in counts.items()}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_dataset() -> None:
    """
    Load the CSV into memory and pre-compute all caches.

    Called once from ``main.py`` during the FastAPI startup event.
    Idempotent — safe to call multiple times.
    """
    global _df, _heatmap_cache, _analytics_cache, _junction_lookup, _corridor_counts

    if _df is not None:
        logger.debug("Dataset already loaded — skipping reload.")
        return

    csv_path = _CSV_PATH
    if not csv_path.exists():
        # Try alternate path relative to CWD (uvicorn launched from project root)
        alt = Path("backend/data/bengaluru_traffic_incidents.csv")
        if alt.exists():
            csv_path = alt
        else:
            raise FileNotFoundError(
                f"Traffic incidents CSV not found at {_CSV_PATH} or {alt}."
            )

    logger.info("Loading dataset from %s …", csv_path)
    _df = pd.read_csv(csv_path, low_memory=False)
    logger.info("Dataset loaded: %d rows, %d columns", len(_df), len(_df.columns))

    # Pre-compute all caches
    logger.info("Pre-computing heatmap cache …")
    _heatmap_cache = _build_heatmap_cache(_df)

    logger.info("Pre-computing analytics cache …")
    _analytics_cache = _build_analytics_cache(_df)

    logger.info("Building junction lookup table …")
    _junction_lookup = _build_junction_lookup(_df)

    logger.info("Building corridor counts table …")
    _corridor_counts = _build_corridor_counts(_df)

    logger.info("Data loader initialisation complete.")


def get_dataframe() -> pd.DataFrame:
    """Return the loaded DataFrame. Raises RuntimeError if not yet loaded."""
    if _df is None:
        raise RuntimeError("Dataset not loaded. Call load_dataset() at startup.")
    return _df


def get_heatmap_cache() -> List[Dict[str, float]]:
    """Return pre-computed heatmap weight list."""
    if _heatmap_cache is None:
        raise RuntimeError("Heatmap cache not built. Call load_dataset() at startup.")
    return _heatmap_cache


def get_analytics_cache() -> Dict[str, Any]:
    """Return pre-computed analytics payload."""
    if _analytics_cache is None:
        raise RuntimeError("Analytics cache not built. Call load_dataset() at startup.")
    return _analytics_cache


def get_junction_lookup() -> Dict[str, int]:
    """Return junction → recurrence count dict."""
    return _junction_lookup

def get_corridor_counts() -> Dict[str, int]:
    """Return corridor → occurrence count dict."""
    return _corridor_counts

def add_live_incident(incident_data: Dict[str, Any], prediction_result: Dict[str, Any]) -> None:
    """
    Append a newly submitted incident to the in-memory global dataset.
    This ensures that the anomaly replay loop and heatmap endpoints
    immediately reflect the new incident.
    """
    global _df

    if _df is None:
        logger.warning("Dataset not loaded. Cannot add live incident.")
        return

    # Prepare the new row
    import datetime
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Resolve coordinates: PredictRequest sends lat/lng (short form);
    # historical marker replays send latitude/longitude (long form from the
    # raw CSV column names). Check both; fall back to city centre only as a
    # last resort so live submissions always pin to the correct map location.
    _CITY_CENTRE_LAT = 12.9716
    _CITY_CENTRE_LNG = 77.5946
    resolved_lat = (
        incident_data.get("lat")
        or incident_data.get("latitude")
        or _CITY_CENTRE_LAT
    )
    resolved_lng = (
        incident_data.get("lng")
        or incident_data.get("longitude")
        or _CITY_CENTRE_LNG
    )

    new_row = {
        "start_datetime": incident_data.get("start_datetime") or now_iso,
        "latitude": float(resolved_lat),
        "longitude": float(resolved_lng),
        "event_type": incident_data.get("event_type", "unplanned"),
        "event_cause": incident_data.get("event_cause", "unknown"),
        "veh_type": incident_data.get("veh_type"),
        "requires_road_closure": incident_data.get("requires_road_closure", False),
        "zone": incident_data.get("zone"),
        "junction": incident_data.get("junction"),
        "corridor": incident_data.get("corridor"),
        "police_station": incident_data.get("police_station"),
        "address": incident_data.get("address"),
        "priority": prediction_result.get("priority", "Low"),
        "estimated_duration_minutes": prediction_result.get("estimated_duration_minutes"),
        # resolution_minutes set from prediction so heatmap weight is computed correctly
        "resolution_minutes": prediction_result.get("estimated_duration_minutes"),
        "is_live_submission": True,  # Flag to distinguish from historical data
    }
    
    new_df = pd.DataFrame([new_row])
    
    # Concatenate and update the global dataframe
    _df = pd.concat([_df, new_df], ignore_index=True)
    logger.info(f"Added 1 live incident to dataset. Total records now: {len(_df)}")
    
    # We could rebuild caches here, but for the hackathon, we only need
    # to rebuild the heatmap cache so the map updates instantly.
    # Anomaly detector reads directly from _df every 5s, so it doesn't need a cache rebuild.
    global _heatmap_cache
    if _heatmap_cache is not None:
        try:
            _heatmap_cache = _build_heatmap_cache(_df)
            logger.info("Rebuilt heatmap cache with new live incident.")
        except Exception as e:
            logger.error(f"Error rebuilding heatmap cache: {e}")
