# Cell 1: Imports
import pandas as pd
import numpy as np
import pickle
import warnings
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")
pd.set_option("display.max_columns", None)
pd.set_option("display.max_colwidth", 60)

print("✅ Libraries loaded.")
# Cell 2: Load Raw CSV
RAW_DATA_PATH = "../data/bengaluru_traffic_incidents.csv"

df_raw = pd.read_csv(RAW_DATA_PATH, low_memory=False)

print(f"Shape: {df_raw.shape}")
print(f"\nColumns:\n{df_raw.columns.tolist()}")
# Cell 3: Initial Data Audit
print("=== Dtypes ===")
print(df_raw.dtypes)

print("\n=== Null Counts ===")
null_pct = (df_raw.isnull().sum() / len(df_raw) * 100).sort_values(ascending=False)
print(null_pct[null_pct > 0].round(2).to_string())

print("\n=== Sample ===")
df_raw.head(3)
# Cell 4: Filter authenticated=yes & drop irrelevant/leaky columns
df = df_raw.copy()

# Keep only authenticated records
df = df[df["authenticated"] == "yes"].reset_index(drop=True)
print(f"After authenticated=yes filter: {df.shape}")

# Columns with no predictive value or >80% null / identifier-only
COLS_TO_DROP = [
    "id", "authenticated", "map_file", "route_path",
    "client_id", "created_by_id", "last_modified_by_id",
    "assigned_to_police_id", "citizen_accident_id",
    "closed_by_id", "resolved_by_id",
    "resolved_at_address", "resolved_at_latitude", "resolved_at_longitude",
    "gba_identifier", "kgid", "veh_no",
    "cargo_material", "reason_breakdown", "age_of_truck",
    "comment", "description", "meta_data",
    "endlatitude", "endlongitude", "end_address",
    "modified_datetime", "created_date", "closed_datetime",
    "resolved_datetime", "police_station"
]

# Only drop columns that actually exist in the dataframe
COLS_TO_DROP = [c for c in COLS_TO_DROP if c in df.columns]
df.drop(columns=COLS_TO_DROP, inplace=True)

print(f"After dropping irrelevant columns: {df.shape}")
print(f"Remaining columns: {df.columns.tolist()}")
# Cell 5: Parse datetime columns
DATETIME_COLS = ["start_datetime", "end_datetime"]

for col in DATETIME_COLS:
    df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")

print("start_datetime sample:")
print(df["start_datetime"].head(3))
print("\nend_datetime nulls:", df["end_datetime"].isnull().sum())
# Cell 6: Handle null values
# --- Categorical fills ---
CAT_FILL_UNKNOWN = ["event_cause", "veh_type", "zone", "junction", "corridor", "direction"]
for col in CAT_FILL_UNKNOWN:
    if col in df.columns:
        df[col] = df[col].fillna("unknown")

# --- Numeric/coordinate fills ---
for col in ["latitude", "longitude"]:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col].fillna(df[col].median(), inplace=True)

# --- Status fill ---
if "status" in df.columns:
    df["status"] = df["status"].fillna("unknown")

# --- requires_road_closure: coerce to bool ---
if "requires_road_closure" in df.columns:
    df["requires_road_closure"] = df["requires_road_closure"].map(
        {"TRUE": 1, "FALSE": 0, True: 1, False: 0}
    ).fillna(0).astype(int)

print("Remaining nulls after fill:")
print(df.isnull().sum()[df.isnull().sum() > 0])
print(f"\nShape: {df.shape}")
# Cell 7: Derived temporal & event features

# --- resolution_minutes: how long incident lasted ---
df["resolution_minutes"] = (
    df["end_datetime"] - df["start_datetime"]
).dt.total_seconds() / 60

# Cap negative (data errors) and extreme outliers at 99th percentile
df.loc[df["resolution_minutes"] < 0, "resolution_minutes"] = np.nan
upper_cap = df["resolution_minutes"].quantile(0.99)
df["resolution_minutes"] = df["resolution_minutes"].clip(upper=upper_cap)
df["resolution_minutes"].fillna(df["resolution_minutes"].median(), inplace=True)

# --- planned_duration_minutes: only valid for planned events ---
df["planned_duration_minutes"] = np.where(
    df["event_type"] == "planned",
    df["resolution_minutes"],
    np.nan
)

# --- Temporal features from start_datetime ---
df["hour_of_day"]  = df["start_datetime"].dt.hour
df["day_of_week"]  = df["start_datetime"].dt.dayofweek   # 0=Mon … 6=Sun

# --- Peak hour flag: 7–10 AM and 5–8 PM ---
df["is_peak_hour"] = df["hour_of_day"].apply(
    lambda h: 1 if (7 <= h <= 10) or (17 <= h <= 20) else 0
)

# --- Weekend flag ---
df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)

print("New features:")
print(df[["resolution_minutes", "planned_duration_minutes",
          "hour_of_day", "day_of_week",
          "is_peak_hour", "is_weekend"]].describe().round(2))
# Cell 8: corridor_rank & junction_recurrence

# corridor_rank: incident frequency per corridor (higher = more incident-prone)
corridor_counts = df["corridor"].value_counts()
df["corridor_rank"] = df["corridor"].map(corridor_counts)

# junction_recurrence: how many times each junction appears
junction_counts = df["junction"].value_counts()
df["junction_recurrence"] = df["junction"].map(junction_counts)

# Save junction lookup for inference time
junction_lookup = junction_counts.to_dict()
with open("../models/junction_lookup.pkl", "wb") as f:
    pickle.dump(junction_lookup, f)

print("corridor_rank sample:\n", df["corridor_rank"].describe().round(2))
print("\njunction_recurrence sample:\n", df["junction_recurrence"].describe().round(2))
print("\n✅ junction_lookup.pkl saved.")
# Cell 9: Encode categorical columns

ENCODE_COLS = ["event_cause", "veh_type", "zone"]
encoders = {}

for col in ENCODE_COLS:
    le = LabelEncoder()
    df[f"{col}_enc"] = le.fit_transform(df[col].astype(str))
    encoders[col] = le
    print(f"{col}: {len(le.classes_)} classes → e.g. {list(le.classes_[:5])}")

# Persist encoders
with open("../models/encoders.pkl", "wb") as f:
    pickle.dump(encoders, f)

print("\n✅ encoders.pkl saved.")
# Cell 10: Assemble final feature matrix and save processed dataset

FEATURE_COLS = [
    # Raw kept features
    "event_type", "latitude", "longitude",
    "requires_road_closure", "priority", "status",
    "corridor", "zone", "junction",

    # Derived features
    "resolution_minutes", "planned_duration_minutes",
    "hour_of_day", "day_of_week", "is_peak_hour", "is_weekend",
    "corridor_rank", "junction_recurrence",

    # Encoded categoricals
    "event_cause_enc", "veh_type_enc", "zone_enc",
]

# Keep only cols that exist
FEATURE_COLS = [c for c in FEATURE_COLS if c in df.columns]

df_processed = df[FEATURE_COLS].copy()

OUTPUT_PATH = "../data/processed_dataset.csv"
df_processed.to_csv(OUTPUT_PATH, index=False)

print(f"✅ Processed dataset saved → {OUTPUT_PATH}")
print(f"Shape: {df_processed.shape}")
print(f"\nFeature columns ({len(FEATURE_COLS)}):\n{FEATURE_COLS}")
# Cell 11: Core function — build_feature_vector()
# Used at inference time by the prediction agent

def build_feature_vector(raw_record: dict, encoders: dict, junction_lookup: dict) -> pd.DataFrame:
    """
    Transform a single raw incident record dict into a model-ready feature vector.

    Parameters
    ----------
    raw_record      : dict  — keys matching raw CSV columns
    encoders        : dict  — {col: LabelEncoder} from encoders.pkl
    junction_lookup : dict  — {junction_name: recurrence_count} from junction_lookup.pkl

    Returns
    -------
    pd.DataFrame with one row, same feature schema as processed_dataset.csv
    """
    rec = raw_record.copy()

    # --- Datetime parsing ---
    start_dt = pd.to_datetime(rec.get("start_datetime"), utc=True, errors="coerce")
    end_dt   = pd.to_datetime(rec.get("end_datetime"),   utc=True, errors="coerce")

    # --- Resolution minutes ---
    if pd.notna(start_dt) and pd.notna(end_dt):
        resolution_minutes = max((end_dt - start_dt).total_seconds() / 60, 0)
    else:
        resolution_minutes = np.nan  # imputed downstream by model default

    event_type = rec.get("event_type", "unplanned")
    planned_duration_minutes = resolution_minutes if event_type == "planned" else np.nan

    # --- Temporal ---
    hour_of_day = start_dt.hour if pd.notna(start_dt) else -1
    day_of_week = start_dt.dayofweek if pd.notna(start_dt) else -1
    is_peak_hour = 1 if (7 <= hour_of_day <= 10) or (17 <= hour_of_day <= 20) else 0
    is_weekend   = 1 if day_of_week >= 5 else 0

    # --- Corridor / junction recurrence ---
    corridor_rank      = rec.get("corridor_rank", 1)   # caller should pass pre-computed
    junction           = rec.get("junction", "unknown")
    junction_recurrence = junction_lookup.get(junction, 1)

    # --- Encode categoricals (handle unseen labels gracefully) ---
    encoded = {}
    for col in ["event_cause", "veh_type", "zone"]:
        val = str(rec.get(col, "unknown"))
        le  = encoders.get(col)
        if le is not None and val in le.classes_:
            encoded[f"{col}_enc"] = le.transform([val])[0]
        else:
            encoded[f"{col}_enc"] = -1   # unseen label sentinel

    feature_dict = {
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
    }

    return pd.DataFrame([feature_dict])


# --- Quick smoke test ---
with open("../models/encoders.pkl", "rb") as f:
    _enc = pickle.load(f)
with open("../models/junction_lookup.pkl", "rb") as f:
    _jl  = pickle.load(f)

sample = {
    "start_datetime"       : "2024-03-07 17:01:48+00:00",
    "end_datetime"         : "2024-03-07 19:35:47+00:00",
    "event_type"           : "unplanned",
    "latitude"             : 13.040,
    "longitude"            : 77.518,
    "requires_road_closure": 0,
    "priority"             : "High",
    "status"               : "closed",
    "corridor"             : "Tumkur Road",
    "zone"                 : "unknown",
    "junction"             : "JalahalliCross(SM Circle)",
    "event_cause"          : "vehicle_breakdown",
    "veh_type"             : "lcv",
    "corridor_rank"        : 120,
}

fv = build_feature_vector(sample, _enc, _jl)
print("✅ build_feature_vector() smoke test passed.")
print(fv.T)
# Cell 12: Export feature_engineering.py for use by backend agents

FE_CODE = '''"""
feature_engineering.py
----------------------
ML Engineer 1 deliverable — Data Pipeline & Feature Engineering
Used by prediction_agent.py at inference time.
"""

import numpy as np
import pandas as pd
import pickle


def load_artifacts(encoders_path: str, junction_lookup_path: str):
    with open(encoders_path, "rb") as f:
        encoders = pickle.load(f)
    with open(junction_lookup_path, "rb") as f:
        junction_lookup = pickle.load(f)
    return encoders, junction_lookup


def build_feature_vector(raw_record: dict, encoders: dict, junction_lookup: dict) -> pd.DataFrame:
    """
    Transform a single raw incident record into a model-ready feature vector.
    Handles unseen labels and missing fields gracefully.
    """
    rec = raw_record.copy()

    start_dt = pd.to_datetime(rec.get("start_datetime"), utc=True, errors="coerce")
    end_dt   = pd.to_datetime(rec.get("end_datetime"),   utc=True, errors="coerce")

    if pd.notna(start_dt) and pd.notna(end_dt):
        resolution_minutes = max((end_dt - start_dt).total_seconds() / 60, 0)
    else:
        resolution_minutes = np.nan

    event_type = rec.get("event_type", "unplanned")
    planned_duration_minutes = resolution_minutes if event_type == "planned" else np.nan

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
'''

with open("../backend/agents/feature_engineering.py", "w") as f:
    f.write(FE_CODE)

print("✅ feature_engineering.py written to backend/agents/")
# Cell 13: ML Eng 2 — Data Audit for Model Training
import pandas as pd

df = pd.read_csv("../data/processed_dataset.csv")

print(f"Shape: {df.shape}")
print(f"\nColumns:\n{df.columns.tolist()}")
print(f"\nDtypes:\n{df.dtypes}")
print(f"\nTarget — priority value counts:\n{df['priority'].value_counts()}")
print(f"\nTarget — resolution_minutes stats:\n{df['resolution_minutes'].describe().round(2)}")
print(f"\nNull counts:\n{df.isnull().sum()[df.isnull().sum() > 0]}")
# Cell 14: ML Eng 2 — Preprocessing for Model Training
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder

df = pd.read_csv("../data/processed_dataset.csv")

# --- Drop 2 null priority rows (target can't be null) ---
df = df.dropna(subset=["priority"]).reset_index(drop=True)

# --- Fix hour_of_day & day_of_week nulls ---
df["hour_of_day"] = df["hour_of_day"].fillna(df["hour_of_day"].median())
df["day_of_week"] = df["day_of_week"].fillna(df["day_of_week"].median())

# --- planned_duration_minutes: 94% null — drop this column ---
df.drop(columns=["planned_duration_minutes"], inplace=True)

# --- Log transform resolution_minutes (highly skewed) ---
df["resolution_minutes_log"] = np.log1p(df["resolution_minutes"])

# --- Encode priority: High=1, Low=0 ---
df["priority_enc"] = (df["priority"] == "High").astype(int)

# --- Drop raw string columns not needed for model ---
DROP_COLS = ["event_type", "status", "corridor", "zone", "junction", "priority"]
df.drop(columns=[c for c in DROP_COLS if c in df.columns], inplace=True)

print(f"Final shape: {df.shape}")
print(f"\nColumns: {df.columns.tolist()}")
print(f"\nNull check: {df.isnull().sum().sum()} total nulls")
print(f"\nClass balance — priority_enc:\n{df['priority_enc'].value_counts()}")

# Cell 15: Train/Test Split
from sklearn.model_selection import train_test_split

FEATURE_COLS = [
    "latitude", "longitude", "requires_road_closure",
    "hour_of_day", "day_of_week", "is_peak_hour", "is_weekend",
    "corridor_rank", "junction_recurrence",
    "event_cause_enc", "veh_type_enc", "zone_enc"
]

# --- Priority Classifier data ---
X_clf = df[FEATURE_COLS]
y_clf = df["priority_enc"]

X_train_clf, X_test_clf, y_train_clf, y_test_clf = train_test_split(
    X_clf, y_clf, test_size=0.2, random_state=42, stratify=y_clf
)

# --- Duration Regressor data ---
X_reg = df[FEATURE_COLS]
y_reg = df["resolution_minutes_log"]

X_train_reg, X_test_reg, y_train_reg, y_test_reg = train_test_split(
    X_reg, y_reg, test_size=0.2, random_state=42
)

print(f"Classifier — Train: {X_train_clf.shape}, Test: {X_test_clf.shape}")
print(f"Regressor  — Train: {X_train_reg.shape}, Test: {X_test_reg.shape}")
# Cell 16: Train Priority Classifier (XGBClassifier)
from xgboost import XGBClassifier

# scale_pos_weight handles class imbalance (Low=2771, High=4393)
scale = y_train_clf.value_counts()[0] / y_train_clf.value_counts()[1]

clf = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    scale_pos_weight=scale,
    use_label_encoder=False,
    eval_metric="logloss",
    random_state=42,
    n_jobs=-1
)

clf.fit(
    X_train_clf, y_train_clf,
    eval_set=[(X_test_clf, y_test_clf)],
    verbose=50
)

print("✅ Priority Classifier trained!")
# Cell 17: Train Duration Regressor (XGBRegressor)
from xgboost import XGBRegressor

reg = XGBRegressor(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    random_state=42,
    n_jobs=-1
)

reg.fit(
    X_train_reg, y_train_reg,
    eval_set=[(X_test_reg, y_test_reg)],
    verbose=50
)

print("✅ Duration Regressor trained!")
# Cell 18: Evaluation — Classifier + Regressor
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_absolute_error, mean_squared_error
)
import numpy as np

# --- Classifier Metrics ---
y_pred_clf = clf.predict(X_test_clf)

acc  = accuracy_score(y_test_clf, y_pred_clf)
prec = precision_score(y_test_clf, y_pred_clf)
rec  = recall_score(y_test_clf, y_pred_clf)
f1   = f1_score(y_test_clf, y_pred_clf)

print("=== Priority Classifier ===")
print(f"Accuracy  : {acc:.4f}")
print(f"Precision : {prec:.4f}")
print(f"Recall    : {rec:.4f}")
print(f"F1 Score  : {f1:.4f}")

# --- Regressor Metrics (inverse log transform) ---
y_pred_reg_log = reg.predict(X_test_reg)
y_pred_reg     = np.expm1(y_pred_reg_log)
y_true_reg     = np.expm1(y_test_reg)

mae  = mean_absolute_error(y_true_reg, y_pred_reg)
rmse = mean_squared_error(y_true_reg, y_pred_reg) ** 0.5

print("\n=== Duration Regressor ===")
print(f"MAE  : {mae:.2f} minutes")
print(f"RMSE : {rmse:.2f} minutes")
# Cell 19: Save Models & Write Evaluation Report
import joblib
import os

os.makedirs("../models", exist_ok=True)

# Save models
joblib.dump(clf, "../models/priority_model.joblib")
joblib.dump(reg, "../models/duration_model.joblib")

print("✅ priority_model.joblib saved.")
print("✅ duration_model.joblib saved.")

# Write evaluation report
report = f"""# ML Engineer 2 — Evaluation Report

## Priority Classifier (XGBClassifier)
| Metric    | Score  |
|-----------|--------|
| Accuracy  | {acc:.4f} |
| Precision | {prec:.4f} |
| Recall    | {rec:.4f} |
| F1 Score  | {f1:.4f} |

## Duration Regressor (XGBRegressor)
| Metric | Value |
|--------|-------|
| MAE    | {mae:.2f} minutes |
| RMSE   | {rmse:.2f} minutes |

## Notes
- Priority Classifier achieves near-perfect performance.
- Duration Regressor RMSE is high due to extreme outliers in resolution_minutes (max: 44613 min).
- Log transform applied to resolution_minutes before training; predictions inverse-transformed via expm1.
- Models saved as .joblib for optimized sklearn/XGBoost serialization.
"""

with open("../models/evaluation_report.md", "w") as f:
    f.write(report)

print("✅ evaluation_report.md saved.")
# Cell 20: Export train_classifier.py and train_regressor.py

TRAIN_CLF_CODE = '''"""
train_classifier.py — ML Engineer 2 deliverable
XGBClassifier for incident priority prediction.
"""
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

def train(data_path="../data/processed_dataset.csv"):
    df = pd.read_csv(data_path)
    df = df.dropna(subset=["priority"])
    df["hour_of_day"] = df["hour_of_day"].fillna(df["hour_of_day"].median())
    df["day_of_week"] = df["day_of_week"].fillna(df["day_of_week"].median())
    df.drop(columns=["planned_duration_minutes"], inplace=True, errors="ignore")
    df["priority_enc"] = (df["priority"] == "High").astype(int)

    FEATURES = ["latitude","longitude","requires_road_closure","hour_of_day",
                "day_of_week","is_peak_hour","is_weekend","corridor_rank",
                "junction_recurrence","event_cause_enc","veh_type_enc","zone_enc"]

    X = df[FEATURES]
    y = df["priority_enc"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    scale = y_train.value_counts()[0] / y_train.value_counts()[1]
    clf = XGBClassifier(n_estimators=300, max_depth=6, learning_rate=0.05,
                        scale_pos_weight=scale, eval_metric="logloss",
                        random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=50)
    joblib.dump(clf, "../models/priority_model.joblib")
    print("✅ priority_model.joblib saved.")

if __name__ == "__main__":
    train()
'''

TRAIN_REG_CODE = '''"""
train_regressor.py — ML Engineer 2 deliverable
XGBRegressor for incident duration prediction.
"""
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

def train(data_path="../data/processed_dataset.csv"):
    df = pd.read_csv(data_path)
    df = df.dropna(subset=["priority"])
    df["hour_of_day"] = df["hour_of_day"].fillna(df["hour_of_day"].median())
    df["day_of_week"] = df["day_of_week"].fillna(df["day_of_week"].median())
    df.drop(columns=["planned_duration_minutes"], inplace=True, errors="ignore")
    df["resolution_minutes_log"] = np.log1p(df["resolution_minutes"])

    FEATURES = ["latitude","longitude","requires_road_closure","hour_of_day",
                "day_of_week","is_peak_hour","is_weekend","corridor_rank",
                "junction_recurrence","event_cause_enc","veh_type_enc","zone_enc"]

    X = df[FEATURES]
    y = df["resolution_minutes_log"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    reg = XGBRegressor(n_estimators=300, max_depth=6, learning_rate=0.05,
                       random_state=42, n_jobs=-1)
    reg.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=50)
    joblib.dump(reg, "../models/duration_model.joblib")
    print("✅ duration_model.joblib saved.")

if __name__ == "__main__":
    train()
'''

import os

os.makedirs(".", exist_ok=True)

with open("train_classifier.py", "w") as f:
    f.write(TRAIN_CLF_CODE)

with open("train_regressor.py", "w") as f:
    f.write(TRAIN_REG_CODE)

print("✅ train_classifier.py saved.")
print("✅ train_regressor.py saved.")