# Smart Traffic Intelligence — ML Models I/O Cheat Sheet

This document is specifically for the ML engineers (like Sagar) working on the training notebooks. It outlines exactly what features the FastAPI backend expects in order, and what output it requires.

## Notebooks
The ML training should be done in Jupyter Notebooks. 
We already have an existing notebook for this:
👉 **[backend/training/traffic_analysis.ipynb](backend/training/traffic_analysis.ipynb)** 

You can use Scikit-Learn, Pandas, and XGBoost inside this notebook. Once your models are trained, export them using `joblib` and save them into the `backend/models/` directory.

---

## 1. Agent 2: Prediction Agent (XGBoost)
This agent runs **two** models using the exact same input feature vector. 

### Input Features (Must be in this EXACT ORDER)
When building your `X` matrix for XGBoost, the columns must align exactly with this 12-feature vector:

1. `event_type` *(Integer: 1 for planned, 0 for unplanned)*
2. `corridor_rank` *(Integer ordinal: 2=Named road, 1=ORR variant, 0=Non-corridor)*
3. `event_cause` *(Integer / Categorical Encodings for causes like vehicle_breakdown, tree_fall, etc.)*
4. `veh_type` *(Integer / Categorical Encodings)*
5. `requires_road_closure` *(Integer: 1 for Yes, 0 for No)*
6. `hour_of_day` *(Integer: 0 to 23)*
7. `day_of_week` *(Integer: 0 to 6)*
8. `is_peak_hour` *(Integer: 1 if hour is 7,8,9 or 17,18,19, else 0)*
9. `is_weekend` *(Integer: 1 if day_of_week is 5 or 6, else 0)*
10. `zone` *(Integer Label Encoded. Null zones must be explicitly grouped/handled, do not drop!)*
11. `junction_recurrence` *(Integer: How many times this junction appeared historically, default 1)*
12. `planned_duration_minutes` *(Float: null/0 for unplanned events, else end - start minutes)*

### Expected Output
**Model 1: `priority_model.joblib` (Binary Classifier)**
- Target: `priority` (High vs Low)
- Expected Output: Returns `1` (High) or `0` (Low), and `predict_proba` for confidence %.

**Model 2: `duration_model.joblib` (Regressor)**
- Target: `resolution_minutes`
- Expected Output: A float representing the estimated clearance time in minutes.

---

## 2. Agent 3: Anomaly Detector (Isolation Forest)
This agent runs per-zone, not per-incident. It detects if a zone is behaving unusually.

### Input Features (Must be in this EXACT ORDER)
For every unique combination of `(zone/station, day_type, time_bucket)`, compute these aggregates over the active window. The feature vector is 3 numbers:

1. `mean_incident_count` *(Float: average number of incidents in this zone-time)*
2. `high_priority_ratio` *(Float: fraction of those incidents that were High priority, 0.0 to 1.0)*
3. `mean_duration_minutes` *(Float: average resolution time in minutes for those incidents)*

### Expected Output
**Model: `anomaly_detector.joblib` (Isolation Forest)**
- Expected Output: Anomaly score array ranging roughly from `-1.0` to `+1.0`. 
- *(Scores > 0 = Normal, 0 to -0.1 = Watch, < -0.1 = Critical)*
