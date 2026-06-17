import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from typing import List, Dict, Union, Any
from sklearn.ensemble import IsolationForest

class TrafficAnomalyDetector:
    """
    Agent 3: Traffic Anomaly Detection Agent using Isolation Forest.
    
    This agent computes baseline traffic metrics (incident counts, priority ratios,
    and resolution durations) for each zone and station across different day types 
    (weekday/weekend) and time buckets. It uses an Isolation Forest model to flag 
    anomalies in current active incidents.
    """
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path
        self.model = None
        self.baseline_stats = None
        self.overall_mean_duration = 60.0  # Fallback duration in minutes
        
    def _compute_resolution_minutes(self, df: pd.DataFrame) -> pd.Series:
        """
        Computes the incident resolution duration in minutes from start and end times.
        Uses closed_datetime as primary and falls back to resolved_datetime if closed is null.
        """
        start = pd.to_datetime(df['start_datetime'], errors='coerce')
        
        # Initialize Series of NaNs matching the length of the dataframe
        res_min = pd.Series(np.nan, index=df.index)
        
        # Calculate from closed_datetime if available
        if 'closed_datetime' in df.columns:
            closed = pd.to_datetime(df['closed_datetime'], errors='coerce')
            res_min = (closed - start).dt.total_seconds() / 60.0
            
        # Calculate fallback from resolved_datetime if available
        if 'resolved_datetime' in df.columns:
            resolved = pd.to_datetime(df['resolved_datetime'], errors='coerce')
            res_min_fallback = (resolved - start).dt.total_seconds() / 60.0
            res_min = res_min.fillna(res_min_fallback)
            
        return res_min

    def _get_time_bucket(self, hour: int) -> str:
        """
        Categorizes hours into traffic-relevant time buckets.
        - Morning Peak: 6 AM to 10 AM (exclusive)
        - Afternoon: 10 AM to 4 PM (exclusive)
        - Evening Peak: 4 PM to 9 PM (exclusive)
        - Night: 9 PM to 6 AM (exclusive)
        """
        if 6 <= hour < 10:
            return 'morning_peak'
        elif 10 <= hour < 16:
            return 'afternoon'
        elif 16 <= hour < 21:
            return 'evening_peak'
        else:
            return 'night'

    def _get_day_type(self, day_of_week: int) -> str:
        """
        Classifies the day of the week as 'weekday' or 'weekend'.
        """
        return 'weekend' if day_of_week in [5, 6] else 'weekday'

    def prepare_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Extracts features and normalizes fields required for baseline calculation.
        """
        df = df.copy()
        
        # Ensure we have start_datetime as a datetime object
        df['start_datetime_parsed'] = pd.to_datetime(df['start_datetime'], errors='coerce')
        
        # Grouping fallback: Records where zone is null are grouped by police_station instead
        zone_series = df['zone'] if 'zone' in df.columns else pd.Series(np.nan, index=df.index)
        ps_series = df['police_station'] if 'police_station' in df.columns else pd.Series(np.nan, index=df.index)
        df['zone_or_station'] = zone_series.fillna(ps_series).fillna('Unknown')
        
        # Extract date, day_of_week, and hour_of_day
        df['hour_of_day'] = df['start_datetime_parsed'].dt.hour
        df['day_of_week'] = df['start_datetime_parsed'].dt.dayofweek
        
        # Map time_bucket and day_type
        df['time_bucket'] = df['hour_of_day'].apply(
            lambda h: self._get_time_bucket(int(h)) if pd.notnull(h) else 'night'
        )
        df['day_type'] = df['day_of_week'].apply(
            lambda d: self._get_day_type(int(d)) if pd.notnull(d) else 'weekday'
        )
        
        # Compute resolution minutes
        df['resolution_minutes'] = self._compute_resolution_minutes(df)
        
        return df

    def fit(self, df: pd.DataFrame) -> None:
        """
        Builds the baseline stats aggregate table and trains the Isolation Forest.
        
        Three features are computed per unique (zone_or_station, day_type, time_bucket):
        1. mean_incident_count: Average incidents per day in this bucket
        2. high_priority_ratio: Fraction of High-priority incidents
        3. mean_duration_minutes: Average resolution time in minutes (excluding outliers)
        """
        df_clean = self.prepare_data(df)
        
        # Calculate overall mean duration for fallback (excluding invalid/unrealistic values)
        valid_durations = df_clean['resolution_minutes'].dropna()
        valid_durations = valid_durations[(valid_durations > 0) & (valid_durations <= 1440)]
        self.overall_mean_duration = valid_durations.mean() if len(valid_durations) > 0 else 60.0
        
        # Create a date column to calculate average incidents per day
        df_clean['date'] = df_clean['start_datetime_parsed'].dt.date
        
        # 1. Calculate average incident count per day for each group
        # Count total incidents per active day/group first
        daily_counts = df_clean.groupby(
            ['date', 'zone_or_station', 'day_type', 'time_bucket']
        ).size().reset_index(name='daily_count')
        
        # Then calculate the mean across the days
        mean_daily_counts = daily_counts.groupby(
            ['zone_or_station', 'day_type', 'time_bucket']
        )['daily_count'].mean().reset_index(name='mean_incident_count')
        
        # 2. Calculate the fraction of High-priority incidents
        df_clean['is_high_priority'] = df_clean['priority'].apply(
            lambda p: 1 if str(p).strip().lower() == 'high' else 0
        )
        priority_stats = df_clean.groupby(
            ['zone_or_station', 'day_type', 'time_bucket']
        )['is_high_priority'].mean().reset_index(name='high_priority_ratio')
        
        # 3. Calculate mean resolution minutes (filtering out negative/nulls and extreme outliers)
        df_valid_dur = df_clean[
            (df_clean['resolution_minutes'] > 0) & 
            (df_clean['resolution_minutes'] <= 1440)
        ]
        duration_stats = df_valid_dur.groupby(
            ['zone_or_station', 'day_type', 'time_bucket']
        )['resolution_minutes'].mean().reset_index(name='mean_duration_minutes')
        
        # Merge stats into single baseline dataframe
        baseline = pd.merge(
            mean_daily_counts, 
            priority_stats, 
            on=['zone_or_station', 'day_type', 'time_bucket'], 
            how='outer'
        )
        baseline = pd.merge(
            baseline, 
            duration_stats, 
            on=['zone_or_station', 'day_type', 'time_bucket'], 
            how='outer'
        )
        
        # Fill missing values with logical defaults
        baseline['mean_incident_count'] = baseline['mean_incident_count'].fillna(0.0)
        baseline['high_priority_ratio'] = baseline['high_priority_ratio'].fillna(0.0)
        baseline['mean_duration_minutes'] = baseline['mean_duration_minutes'].fillna(self.overall_mean_duration)
        
        self.baseline_stats = baseline
        
        # Train Isolation Forest on the 3D feature space
        X = baseline[['mean_incident_count', 'high_priority_ratio', 'mean_duration_minutes']].values
        
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42
        )
        self.model.fit(X)
        
        # Save model if path was provided
        if self.model_path:
            self.save(self.model_path)
            
    def score_live_zones(self, live_df: pd.DataFrame, current_time: Union[str, datetime] = None) -> List[Dict[str, Any]]:
        """
        Scores current active incidents in each zone using the trained Isolation Forest model.

        NOTE: This method is kept for backward compatibility and direct use.
        The primary call path now goes through routes/anomaly.py which pre-computes
        a time-bucket matched window and calls _score_zone_from_slice() directly,
        feeding per-day average counts to match the training feature scale.

        When called directly (e.g., after a new incident submission), this method
        uses resolution_minutes from the live_df rows (not elapsed time) to avoid
        the variance that caused oscillating anomaly scores.

        Returns a list of reports per zone:
        [
          {
            "zone": "HSR Layout",
            "alert_level": "Critical" | "Watch" | "Normal",
            "incident_count": 5,
            "high_priority_ratio": 0.9,
            "mean_duration": 85.0,
            "anomaly_score": -0.4321
          },
          ...
        ]
        """
        if self.model is None or self.baseline_stats is None:
            raise ValueError("The anomaly detection model must be fitted or loaded before scoring live zones.")

        if current_time is None:
            current_time = datetime.now()
        elif isinstance(current_time, str):
            current_time = pd.to_datetime(current_time)

        # Determine all zones present in baseline (excluding 'Unknown' fallback)
        all_zones = [z for z in self.baseline_stats['zone_or_station'].unique() if z != 'Unknown']

        # Determine day_type and time_bucket of the current time
        current_hour = current_time.hour
        current_day_of_week = current_time.weekday()
        day_type = self._get_day_type(current_day_of_week)
        time_bucket = self._get_time_bucket(current_hour)

        # If there are no live incidents at all, score everything as Normal
        if live_df is None or len(live_df) == 0:
            return [
                {
                    "zone": zone,
                    "alert_level": "Normal",
                    "incident_count": 0,
                    "high_priority_ratio": 0.0,
                    "mean_duration": 0.0,
                    "anomaly_score": 0.1
                }
                for zone in all_zones
            ]

        # Prepare live dataframe: add zone_or_station grouping column
        live_df = live_df.copy()
        zone_series = live_df['zone'] if 'zone' in live_df.columns else pd.Series(np.nan, index=live_df.index)
        ps_series   = live_df['police_station'] if 'police_station' in live_df.columns else pd.Series(np.nan, index=live_df.index)
        live_df['zone_or_station'] = zone_series.fillna(ps_series).fillna('Unknown')

        # Pre-compute resolution_minutes if not already present.
        # IMPORTANT: Only use historical closed/resolved durations — never use
        # elapsed time since start, which introduces high variance and causes
        # erratic anomaly scores.
        if 'resolution_minutes' not in live_df.columns:
            live_df['resolution_minutes'] = self._compute_resolution_minutes(live_df)

        results = []
        for zone in all_zones:
            zone_incidents = live_df[live_df['zone_or_station'] == zone]
            count = len(zone_incidents)

            if count == 0:
                results.append({
                    "zone": zone,
                    "alert_level": "Normal",
                    "incident_count": 0,
                    "high_priority_ratio": 0.0,
                    "mean_duration": 0.0,
                    "anomaly_score": 0.1
                })
                continue

            # --- 1. High priority ratio ---
            high_priority_count = zone_incidents['priority'].apply(
                lambda p: 1 if str(p).strip().lower() == 'high' else 0
            ).sum()
            high_priority_ratio = high_priority_count / count

            # --- 2. Mean duration ---
            # Priority order:
            #   a) resolution_minutes column (historical, pre-computed)
            #   b) estimated_duration_minutes (from prediction agent, for live submissions)
            #   c) Baseline stats lookup for this (zone, day_type, time_bucket)
            #
            # We deliberately do NOT fall back to elapsed time since start.
            # That calculation produces high-variance inputs that cause erratic scores.
            mean_duration = self.overall_mean_duration  # safe default

            # Try resolution_minutes first (historical)
            if 'resolution_minutes' in zone_incidents.columns:
                dur = zone_incidents['resolution_minutes'].dropna()
                dur = dur[(dur > 0) & (dur <= 1440)]
                if len(dur) > 0:
                    mean_duration = float(dur.mean())

            # Then estimated_duration_minutes (live submissions from prediction agent)
            elif 'estimated_duration_minutes' in zone_incidents.columns:
                dur = zone_incidents['estimated_duration_minutes'].dropna()
                dur = dur[dur > 0]
                if len(dur) > 0:
                    mean_duration = float(dur.mean())

            # Final fallback: look up baseline stats for this bucket
            else:
                bl = self.baseline_stats
                mask = (
                    (bl['zone_or_station'] == zone)
                    & (bl['day_type'] == day_type)
                    & (bl['time_bucket'] == time_bucket)
                )
                rows = bl[mask]
                if len(rows) > 0:
                    mean_duration = float(rows['mean_duration_minutes'].iloc[0])

            # --- 3. Score with Isolation Forest ---
            X_live = np.array([[float(count), float(high_priority_ratio), float(mean_duration)]])
            anomaly_score = float(self.model.decision_function(X_live)[0])

            # Map to alert level (thresholds per AGENTS.md / architecture.md)
            if anomaly_score > 0.0:
                alert_level = "Normal"
            elif anomaly_score >= -0.1:
                alert_level = "Watch"
            else:
                alert_level = "Critical"

            results.append({
                "zone": zone,
                "alert_level": alert_level,
                "incident_count": int(count),
                "high_priority_ratio": float(high_priority_ratio),
                "mean_duration": round(float(mean_duration), 1),
                "anomaly_score": round(anomaly_score, 4)
            })

        return results

    def save(self, filepath: str) -> None:
        """
        Serializes and saves model state to joblib.
        """
        state = {
            'model': self.model,
            'baseline_stats': self.baseline_stats,
            'overall_mean_duration': self.overall_mean_duration
        }
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump(state, filepath)
        
    def load(self, filepath: str) -> None:
        """
        Deserializes and loads model state from joblib.
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Anomaly detector model state not found at {filepath}")
        state = joblib.load(filepath)
        self.model = state['model']
        self.baseline_stats = state['baseline_stats']
        self.overall_mean_duration = state.get('overall_mean_duration', 60.0)
