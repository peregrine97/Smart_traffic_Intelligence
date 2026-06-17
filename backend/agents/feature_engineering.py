"""
feature_engineering.py
----------------------
ML Engineer 1 deliverable — Data Pipeline & Feature Engineering
Used by prediction_agent.py at inference time.
"""

import numpy as np
import pandas as pd
import joblib


def load_artifacts(encoders_path: str, junction_lookup_path: str):
    encoders = joblib.load(encoders_path)
    junction_lookup = joblib.load(junction_lookup_path)
    return encoders, junction_lookup


def build_feature_vector(raw_record: dict, encoders: dict, junction_lookup: dict) -> pd.DataFrame:
    """
    Transform a single raw incident record into a model-ready feature vector.
    Handles unseen labels and missing fields gracefully.
    """
    rec = raw_record.copy()

    start_dt = pd.to_datetime(rec.get("start_datetime"), utc=True, errors="coerce")
    end_dt   = pd.to_datetime(rec.get("end_datetime"),   utc=True, errors="coerce")

    closed_dt = pd.to_datetime(rec.get("closed_datetime"), utc=True, errors="coerce")
    resolved_dt = pd.to_datetime(rec.get("resolved_datetime"), utc=True, errors="coerce")

    resolution_minutes = np.nan
    if pd.notna(start_dt):
        if pd.notna(closed_dt):
            resolution_minutes = (closed_dt - start_dt).total_seconds() / 60.0
        elif pd.notna(resolved_dt):
            resolution_minutes = (resolved_dt - start_dt).total_seconds() / 60.0
    
    if not (0 < resolution_minutes <= 1440):
        resolution_minutes = np.nan

    event_type = rec.get("event_type", "unplanned")
    planned_duration_minutes = np.nan
    if event_type == "planned" and pd.notna(start_dt) and pd.notna(end_dt):
        planned_duration_minutes = max((end_dt - start_dt).total_seconds() / 60.0, 0)

    hour_of_day = start_dt.hour      if pd.notna(start_dt) else -1
    day_of_week = start_dt.dayofweek if pd.notna(start_dt) else -1
    is_peak_hour = 1 if (7 <= hour_of_day <= 10) or (17 <= hour_of_day <= 20) else 0
    is_weekend   = 1 if day_of_week >= 5 else 0

    junction            = rec.get("junction", "unknown")
    junction_recurrence = junction_lookup.get(junction, 1)
    corridor_rank       = rec.get("corridor_rank", 1)

    encoded = {}
    for col in ["event_cause", "veh_type", "zone"]:
        val = str(rec.get(col, "unknown"))
        le  = encoders.get(col)
        encoded[f"{col}_enc"] = le.transform([val])[0] if (le and val in le.classes_) else -1

    return pd.DataFrame([{
        "event_type"               : event_type,
        "latitude"                 : float(rec.get("latitude", 12.97)),
        "longitude"                : float(rec.get("longitude", 77.59)),
        "requires_road_closure"    : int(rec.get("requires_road_closure", 0)),
        "priority"                 : rec.get("priority", "Low"),
        "status"                   : rec.get("status", "unknown"),
        "corridor"                 : rec.get("corridor", "unknown"),
        "zone"                     : rec.get("zone", "unknown"),
        "junction"                 : junction,
        "resolution_minutes"       : resolution_minutes,
        "planned_duration_minutes" : planned_duration_minutes,
        "hour_of_day"              : hour_of_day,
        "day_of_week"              : day_of_week,
        "is_peak_hour"             : is_peak_hour,
        "is_weekend"               : is_weekend,
        "corridor_rank"            : corridor_rank,
        "junction_recurrence"      : junction_recurrence,
        **encoded,
    }])
