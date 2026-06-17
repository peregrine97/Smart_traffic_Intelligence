# architecture.md — Smart Traffic Intelligence System
## Complete Architecture Reference: Endpoints, Models, Agents, Data Flow, and Frontend-Backend Integration

> **Living Document:** As the project evolves, all structural changes — new endpoints, modified feature vectors, agent prompt updates, UI changes — must be reflected here before merging. Keep this file in sync with the repo.

---

## 1. System Overview

A real-time traffic intelligence dashboard for Bengaluru traffic authorities. The system ingests 8,173 historical traffic incidents, trains ML models on them, and exposes a FastAPI backend that serves a React frontend. Users can monitor live anomalies zone-by-zone, submit new incidents (via structured form or free-text description in any language), and receive an ML-predicted priority classification, resolution time estimate, and an LLM-generated deployment action plan — all from a single interface.

**Tech stack at a glance:**

| Layer | Technology |
|---|---|
| Frontend | React, Leaflet.js, Recharts, Server-Sent Events (SSE) |
| Backend | FastAPI (Python) |
| ML Models | XGBoost (classifier + regressor), Isolation Forest |
| LLM | Claude Sonnet API (Agents 1 and 4) |
| Data | Bengaluru traffic incident CSV (8,173 records), held in-memory at runtime |
| Persistence | None during session; `feedback.jsonl` for post-demo review |

---

## 2. Repository Structure

```
/
├── backend/
│   ├── main.py                  # FastAPI app, all endpoints, background tasks
│   ├── agents/
│   │   ├── nlp_parser.py        # Agent 1: NLP description extractor
│   │   ├── predictor.py         # Agent 2: XGBoost classifier + regressor
│   │   ├── anomaly.py           # Agent 3: Isolation Forest anomaly detection
│   │   └── action_planner.py    # Agent 4: LLM action plan generator (SSE)
│   ├── data/
│   │   ├── pipeline.py          # Data loading, feature engineering, encoders
│   │   └── traffic_incidents.csv
│   ├── models/
│   │   ├── classifier.joblib
│   │   ├── regressor.joblib
│   │   └── isolation_forest.joblib
│   └── feedback.jsonl           # Appended at runtime; not committed
├── frontend/
│   ├── src/
│   │   ├── views/
│   │   │   ├── MapView.jsx       # View 1: Leaflet map + Anomaly Monitor sidebar
│   │   │   ├── SubmitView.jsx    # View 2: Incident submission form
│   │   │   └── AnalyticsView.jsx # View 3: Historical charts
│   │   ├── components/
│   │   │   └── IncidentPanel.jsx # Shared right-side drawer (all three views)
│   │   └── api.js               # All fetch/SSE calls to the backend
│   └── public/
├── architecture.md              # This file
└── agents.md                    # Agent specification (source of truth for agents)
```

---

## 3. API Endpoints

All endpoints are served by FastAPI. The dataset DataFrame and all trained models are loaded into memory at server startup. No database is used.

### `GET /heatmap`

**Purpose:** Provide weighted lat/lng data for the Leaflet heatmap layer.

**Input:** None.

**Output:**
```json
[
  { "lat": 12.9716, "lng": 77.5946, "weight": 2.4 },
  ...
]
```

Weight formula: `base_weight * duration_factor`
- `base_weight`: 2 if `priority == "High"`, 1 if `priority == "Low"`
- `duration_factor`: normalized `resolution_minutes` (0–1 scale, computed at startup)

Computed once at startup from the full 8,173-record dataset and cached. Frontend calls this once on load.

---

### `GET /incidents`

**Purpose:** Serve incident markers for the Leaflet map.

**Input (query params):**

| Param | Type | Description |
|---|---|---|
| `zone` | string (optional) | Filter by zone name |
| `priority` | "High" \| "Low" (optional) | Filter by priority |
| `event_type` | "planned" \| "unplanned" (optional) | Filter by event type |
| `page` | int (default: 1) | Pagination |
| `page_size` | int (default: 200) | Records per page |

**Output:**
```json
{
  "total": 8173,
  "page": 1,
  "incidents": [
    {
      "id": "...",
      "lat": 12.9716,
      "lng": 77.5946,
      "address": "...",
      "junction": "...",
      "corridor": "...",
      "event_type": "unplanned",
      "priority": "High",
      "status": "closed"
    }
  ]
}
```

Frontend uses `priority` to color-code markers (red = High, amber = Low).

---

### `POST /nlp-parse`

**Purpose:** Run Agent 1 on a free-text incident description.

**Input (JSON body):**
```json
{ "description": "ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್" }
```

**Output (success):**
```json
{
  "root_cause": "vehicle_breakdown",
  "vehicle_type": "bmtc_bus",
  "severity": 2,
  "action_needed": true,
  "normalized_summary": "BMTC bus has broken down at the reported location."
}
```

**Output (failure / parse error):**
```json
null
```

Frontend shows the parsed fields in the Incident Panel as a "Parsed from description" section. On null, the frontend falls through to the user's typed structured fields.

---

### `POST /predict`

**Purpose:** Run Agent 2 — classify priority and estimate resolution time.

**Input (JSON body):**

| Field | Type | Source |
|---|---|---|
| `event_type` | "planned" \| "unplanned" | Form or NLP parse |
| `event_cause` | string (dataset vocabulary) | Form or NLP parse |
| `corridor` | string | Form |
| `requires_road_closure` | boolean | Form |
| `veh_type` | string \| null | Form or NLP parse |
| `zone` | string \| null | Derived from location |
| `junction` | string \| null | Typed or pin-derived |
| `start_datetime` | ISO string | Form or current time |
| `planned_end_datetime` | ISO string \| null | Planned events only |

**Output:**
```json
{
  "priority": "High",
  "confidence": 0.84,
  "estimated_duration_minutes": 130,
  "estimated_resolution_time": "2025-06-16T19:30:00Z"
}
```

This endpoint always runs — for new form submissions and for historical marker clicks (replaying stored incident features through the live model).

---

### `GET /action-plan` *(Server-Sent Events)*

**Purpose:** Run Agent 4 and stream the LLM action plan token-by-token.

**Input (query params):** Full incident context assembled from the original fields plus `/predict` output:

| Param | Description |
|---|---|
| `event_type` | planned / unplanned |
| `event_cause` | e.g. vehicle_breakdown |
| `address` | Display address |
| `junction` | Junction name |
| `corridor` | Human-readable corridor label |
| `police_station` | Responsible station |
| `zone` | Zone name |
| `priority` | High / Low |
| `confidence` | Float (0–1) |
| `estimated_duration_minutes` | Integer |
| `requires_road_closure` | true / false |
| `nlp_cause` | From Agent 1 (if ran) |
| `nlp_summary` | From Agent 1 (if ran) |
| `is_zone_alert` | true if triggered from Anomaly Monitor |

**Output:** SSE stream. Each event is a plain text token chunk. The frontend accumulates tokens and renders them in a typewriter-style component.

The plan always contains exactly six labeled sections: **Officers, Barricades, Diversion, Estimated Clearance, Escalation Trigger, Public Advisory.**

For planned events (`event_type == "planned"`), the prompt instructs pre-emptive deployment — resources are positioned before event start, not dispatched reactively.

---

### `GET /anomaly`

**Purpose:** Return current anomaly scores for all zones, updated every 0.066 seconds by the background replay loop.

**Input:** None.

**Output:**
```json
[
  {
    "zone": "HSR Layout",
    "alert_level": "Critical",
    "incident_count": 5,
    "high_priority_ratio": 0.9,
    "mean_duration": 85,
    "anomaly_score": -0.43
  },
  ...
]
```

Alert level thresholds: `anomaly_score > 0` = Normal, `-0.1 to 0` = Watch, `< -0.1` = Critical.

Frontend polls this endpoint every 5 seconds and simultaneously updates zone polygon fill colors on the map and badge colors on the Anomaly Monitor sidebar cards.

---

### `POST /anomaly/replay`

**Purpose:** Resets the anomaly replay loop to the beginning of the dataset, clearing accumulators and starting the stream from index 0.

---

### `GET /analytics`

**Purpose:** Serve all four analytics charts in a single response. Computed once at startup from the in-memory DataFrame.

**Input:** None.

**Output:**
```json
{
  "volume_grid": { "7x24 matrix of incident counts by day_of_week × hour_of_day" },
  "top_junctions": [
    { "junction": "Silk Board", "count": 142, "lat": 12.9175, "lng": 77.6228 }
  ],
  "corridor_durations": [
    { "corridor_rank": 2, "label": "Named Corridor", "median_minutes": 55 },
    { "corridor_rank": 1, "label": "ORR Variant", "median_minutes": 72 },
    { "corridor_rank": 0, "label": "Non-Corridor", "median_minutes": 38 }
  ],
  "planned_vs_unplanned": [
    { "month": "2023-01", "planned": 12, "unplanned": 98 }
  ]
}
```

---

### `POST /feedback`

**Purpose:** Record a user thumbs-up or thumbs-down on an action plan.

**Input (JSON body):**
```json
{
  "incident_context": { "zone": "...", "event_cause": "...", "priority": "High", ... },
  "action_plan": "Officers: Deploy 4 officers to...",
  "rating": "up"
}
```

**Output:**
```json
{ "status": "ok" }
```

Appends one JSON line to `feedback.jsonl`. Not used for live retraining — exists for post-demo review.

---

### `GET /feedback`

**Purpose:** Return all feedback entries for post-demo inspection.

**Input:** None.

**Output:**
```json
[
  { "timestamp": "...", "incident_context": {...}, "action_plan": "...", "rating": "up" }
]
```

---

## 4. The Four Agents

All agents are Python functions inside the FastAPI backend — not separate services.

### Agent 1 — NLP Description Parser

**Triggered by:** `POST /nlp-parse` when the user has entered a free-text description.

**Skipped when:** User submits structured fields only, with no description.

**Input:** Raw string in any language (Kannada, English, mixed, transliterated).

**Internal process:**
1. Backend constructs a Claude Sonnet API call.
2. System prompt: structured extraction agent for Bengaluru traffic incidents.
3. User message: few-shot example (one Kannada input → expected JSON output) + raw user string.
4. Model is instructed to return only a JSON object — no preamble, no explanation.

**Output (success):**
```json
{
  "root_cause": "vehicle_breakdown",   // one of the dataset's event_cause values
  "vehicle_type": "bmtc_bus",          // one of the dataset's veh_type values, or null
  "severity": 2,                       // 1 (low) | 2 (medium) | 3 (high)
  "action_needed": true,
  "normalized_summary": "BMTC bus has broken down at the reported location."
}
```

**Output (failure):** `null`

**Frontend behavior:** Displays parsed fields in the Incident Panel as "Parsed from description" before the prediction loads. On null, silently falls through.

---

### Agent 2 — Prediction Agent (XGBoost)

**Triggered by:** Every call to `POST /predict`.

**Input:** Feature vector constructed identically at training time and inference time via `build_feature_vector(input_dict) → numpy_array`.

| Feature | Encoding |
|---|---|
| `event_type` | Binary: planned=1, unplanned=0 |
| `corridor_rank` | Ordinal: named=2, ORR=1, non-corridor=0 |
| `event_cause` | Label encoded |
| `veh_type` | Label encoded (returns -1 when unknown) |
| `requires_road_closure` | Binary: 0 or 1 |
| `hour_of_day` | Integer 0–23 |
| `day_of_week` | Integer 0–6 |
| `is_peak_hour` | Binary (1 if hour in [7,8,9,17,18,19]) |
| `is_weekend` | Binary (1 if day_of_week in [5,6]) |
| `zone` | Label encoded; "unknown" class reserved for nulls |
| `junction_recurrence` | Integer from lookup table; default=1 for unknown |
| `planned_duration_minutes` | Float; 0 for unplanned events |

**Two models, same feature vector:**

**Classifier (XGBoost):** Trained on authenticated incidents where `priority` is not null. Target: `priority` (0=Low, 1=High). Class imbalance handled with `scale_pos_weight`. Returns predicted class + probability.

**Regressor (XGBoost):** Trained on ~3,205 records where `resolution_minutes` is computable, positive, and ≤ 1,440 min. Target: `resolution_minutes`. Returns a float rounded to nearest minute.

**Output:**
```json
{
  "priority": "High",
  "confidence": 0.84,
  "estimated_duration_minutes": 130,
  "estimated_resolution_time": "2025-06-16T19:30:00Z"
}
```

Models are serialized with joblib and loaded at server startup. Inference: < 100ms.

---

### Agent 3 — Anomaly Detection Agent (Isolation Forest)

**Triggered by:** Background `asyncio` task running every 5 seconds during the demo. Not triggered by user actions directly.

**Grouping:** Records where `zone` is null are grouped by `police_station` instead, ensuring all 8,173 records contribute to the baseline.

**Baseline training:** For each unique `(zone_or_station, day_type, time_bucket)` combination, three statistics are computed:
- `mean_incident_count` — average incidents per day in this bucket
- `high_priority_ratio` — fraction of High-priority incidents
- `mean_duration_minutes` — average resolution time in minutes

Each combination becomes one row (a 3D feature vector). The Isolation Forest is trained on all rows.

**Replay mechanism:** During the demo, the backend streams a small batch of chronological incidents every 0.066 seconds into a pure per-zone accumulator (incidents are never removed; they only accumulate over time). The three statistics are computed from this ever-growing accumulated state per zone and fed to the Isolation Forest. When the dataset is exhausted, the replay loop stops and freezes at the final state.

**Output per zone:**
```json
{
  "zone": "HSR Layout",
  "alert_level": "Critical",
  "incident_count": 5,
  "high_priority_ratio": 0.9,
  "mean_duration": 85,
  "anomaly_score": -0.43
}
```

Alert level mapping: `> 0` = Normal, `-0.1 to 0` = Watch, `< -0.1` = Critical.

---

### Agent 4 — Action Planner Agent (LLM, SSE)

**Triggered by:** `GET /action-plan` after `POST /predict` completes.

**Input:** Full context block assembled from the original incident fields + Agent 2 output (see endpoint section above).

**Internal process:**
1. Backend constructs a Claude Sonnet API call with `stream=True`.
2. System message: traffic authority operations assistant with Bengaluru road network knowledge.
3. User message: all context fields in labeled plaintext.
4. Instruction: produce exactly six labeled sections; no preamble.
5. For planned events: prompt specifies pre-emptive deployment framing.
6. Backend streams each token chunk as an SSE event to the frontend as it arrives.

**Output:** Plain-language action plan, streamed as SSE, always in six sections:
1. **Officers** — count and deployment positions
2. **Barricades** — placement instructions
3. **Diversion** — suggested alternate routes (uses model's built-in Bengaluru knowledge)
4. **Estimated Clearance** — projected time to resolution
5. **Escalation Trigger** — conditions under which to escalate
6. **Public Advisory** — message for motorists/public

**Frontend behavior:** Typewriter-style rendering as tokens arrive. Thumbs-up/down feedback buttons appear only after streaming completes.

---

## 5. Data Flow

### Flow A — Structured Form Submission

```
User fills form (View 2)
    │
    ▼
Frontend: POST /predict  ──────────────────────────────────────────────────────────────────────────►
                                                                                                    Backend:
                                                                                                    build_feature_vector()
                                                                                                    → XGBoost classifier
                                                                                                    → XGBoost regressor
◄──────────────────────────────────────────────────────────────────────────────────────────────────
    {priority, confidence, estimated_duration_minutes, estimated_resolution_time}
    │
    ▼
Incident Panel opens (loading state)
    │
    ▼
Frontend: GET /action-plan (SSE)  ────────────────────────────────────────────────────────────────►
                                                                                                    Backend:
                                                                                                    Claude Sonnet API (stream)
◄──────────────────────────────────────────────────────────────────────────────────────────────────
    token... token... token...
    │
    ▼
Incident Panel: typewriter rendering
    │
    ▼
Streaming complete → feedback buttons appear
    │
    ▼ (on map)
New red/amber pin added at submitted location
Zone anomaly score recomputed immediately (not waiting for 5s cycle)
```

### Flow B — Free-Text Description Submission

```
User pastes description in form (View 2)
    │
    ▼
Frontend detects non-empty description
    │
    ▼
Frontend: POST /nlp-parse  ───────────────────────────────────────────────────────────────────────►
                                                                                                    Agent 1:
                                                                                                    Claude Sonnet API (non-streaming)
◄──────────────────────────────────────────────────────────────────────────────────────────────────
    {root_cause, vehicle_type, severity, action_needed, normalized_summary}
    │
    ▼
Incident Panel: "Parsed from description" section visible
    │
    ▼
Frontend merges NLP output with user's typed location
    │
    ▼  (same as Flow A from here)
POST /predict → GET /action-plan SSE → streaming → feedback buttons
```

### Flow C — Anomaly Monitor → Generate Plan

```
Background task (every 0.066s):
    incidents stream into pure per-zone accumulator (never removed)
    → compute (incident_count, high_priority_ratio, mean_duration) from accumulated state
    → Isolation Forest scores all zones
    → GET /anomaly cache updated

Frontend polls GET /anomaly every 5s:
    → Zone polygon fill colors updated on map
    → Anomaly Monitor sidebar cards updated

User clicks "Generate Plan" on a zone card:
    → NLP parse skipped
    → POST /predict (zone-level context)
    → GET /action-plan SSE (framed as pre-emptive zone alert)
    → Incident Panel opens (same as Flow A)
```

### Flow D — Historical Marker Click

```
User clicks a map pin
    │
    ▼
Frontend: POST /predict (stored incident's features re-run through live model)
    │
    ▼
GET /action-plan SSE
    │
    ▼
Incident Panel opens with historical incident's address/junction + fresh prediction
```

---

## 6. Frontend Views and Component Wiring

### View 1 — Map (default on login)

**Components:**
- `LeafletMap` — full-screen, three layers:
  1. Heatmap layer (Leaflet.heat plugin, data from `GET /heatmap`)
  2. Incident markers (data from `GET /incidents`, paginated; red=High, amber=Low)
  3. Zone polygons (convex hulls computed from dataset lat/lng grouped by zone; fill color driven by `GET /anomaly`)
- `AnoalyMonitorSidebar` — collapsible, left or right side:
  - One card per zone: name, alert badge, three numbers (count / ratio / duration)
  - "Generate Plan" button triggers Flow C

**API calls on load:**
1. `GET /heatmap` (once)
2. `GET /incidents` (paginated, initial load)
3. `GET /anomaly` (then every 5s)

**Interactions:**
- Marker click → `POST /predict` → `GET /action-plan` SSE → `IncidentPanel` opens
- "Generate Plan" click → `POST /predict` → `GET /action-plan` SSE → `IncidentPanel` opens
- Junction bar click in Analytics → map pans to that junction and briefly animates its marker

---

### View 2 — Submit Incident

**Components:**
- Single form with two input modes:
  - **Structured:** dropdowns for event type, event cause, corridor; pin drop on mini-map; datetime picker; vehicle type
  - **Description:** textarea (any language); NLP parse runs on submit if non-empty
- Both modes: typed address field

**On submit:**
1. If description non-empty → `POST /nlp-parse`
2. `POST /predict`
3. `GET /action-plan` SSE
4. `IncidentPanel` opens
5. New map marker added at submitted lat/lng

---

### View 3 — Analytics

**Components (all data from `GET /analytics`, loaded once):**
- **Chart 1:** 7×24 heatmap table — incidents by day of week × hour of day
- **Chart 2:** Horizontal bar chart — top 15 junctions by incident count. Clicking a bar pans Map view to that junction.
- **Chart 3:** Bar chart — median resolution time by corridor category (3 bars)
- **Chart 4:** Line/stacked-bar chart — planned vs unplanned monthly volume

**API calls on load:**
1. `GET /analytics` (once)

---

### IncidentPanel (shared across all views)

A right-side drawer that opens from three triggers: map marker click, form submit, anomaly zone "Generate Plan."

**Sections:**

| Section | Content | When visible |
|---|---|---|
| Incident details | address, junction, corridor, event cause, event type, time | Always |
| NLP parse result | root_cause, vehicle_type, severity, normalized_summary | Only if Agent 1 ran |
| Prediction result | Priority badge (High/Low), confidence %, estimated clearance clock time | After `/predict` resolves |
| Action plan | LLM output, streamed typewriter-style, 6 labeled sections | After `/action-plan` SSE begins |
| Feedback row | Thumbs-up / thumbs-down buttons | After streaming fully completes |

**Panel states:**
1. Loading (spinner) — prediction in flight
2. Prediction loaded, plan streaming — badge visible, plan typing out
3. Complete — full plan visible, feedback buttons active

---

## 7. Feature Engineering Reference

These are computed from raw dataset columns before training. The same logic runs at inference via `build_feature_vector()`.

| Derived Feature | Computation | Notes |
|---|---|---|
| `resolution_minutes` | `closed_datetime - start_datetime` (minutes); fallback: `resolved_datetime - start_datetime` | Drop if negative, zero, null, or > 1,440 min. ~3,205 records survive. |
| `planned_duration_minutes` | `end_datetime - start_datetime` (minutes), planned events only | Null for unplanned. |
| `hour_of_day` | `start_datetime.hour` | Integer 0–23 |
| `day_of_week` | `start_datetime.dayofweek` | Integer 0–6 |
| `is_peak_hour` | 1 if hour in [7,8,9,17,18,19] | Binary |
| `is_weekend` | 1 if day_of_week in [5,6] | Binary |
| `corridor_rank` | Named corridor=2, ORR variant=1, Non-corridor=0, null=0 | 23 raw values → 3 ordinal levels |
| `junction_recurrence` | Count of appearances of each junction string in dataset | Lookup table at inference; default=1 for unknown/null |
| `time_bucket` | hour 6–10: morning_peak, 10–16: afternoon, 16–21: evening_peak, else: night | Used for anomaly grouping |
| `day_type` | weekday / weekend from day_of_week | Used for anomaly grouping |

**Null handling:**
- `zone`: null in 57% of records. Do not drop — use "unknown" label class. For anomaly detection, null-zone records group by `police_station`.
- `junction`: null in 69% of records. `junction_recurrence` defaults to 1 for null.
- `veh_type`: null in ~40% of records. Label encoding returns -1 for null.

---

## 8. Build Sequence

Strict dependency order. Each stage produces artifacts the next stage consumes.

**Stage 1 — Data pipeline and models**
Load CSV → filter `authenticated=yes` → handle nulls (null-safe encoding, not row-dropping) → compute all derived features → build `junction_recurrence` lookup table → build zone label encoder with "unknown" class → label encode `event_cause` and `veh_type` → compute `resolution_minutes` with primary/fallback logic → drop outliers → train XGBoost classifier (with `scale_pos_weight`) → train XGBoost regressor → compute anomaly baseline aggregate table → train Isolation Forest → serialize all models with joblib → write `build_feature_vector()` function used identically at train and inference time.

**Stage 2 — Backend endpoints**
Write Agent 1 prompt and `POST /nlp-parse` → test against 5 real Kannada/mixed descriptions from dataset → write `POST /predict` → write Agent 4 prompt and `GET /action-plan` with SSE (test SSE with curl before connecting frontend) → implement anomaly replay loop as FastAPI `asyncio` background task → write `GET /anomaly`, `GET /heatmap`, `GET /incidents`, `GET /analytics` → write `POST /feedback` and `GET /feedback`.

**Stage 3 — Frontend core**
Set up Leaflet map → integrate heatmap plugin → build zone polygons as convex hulls → build Anomaly Monitor sidebar polling `/anomaly` every 5s → build IncidentPanel drawer with three states → wire map marker click.

**Stage 4 — Frontend form, analytics, polish**
Build Submit Incident form (both input modes) → wire three-step API sequence (`/nlp-parse` if description, then `/predict`, then `/action-plan` SSE) → build Analytics page (all four Recharts charts) → wire junction bar click to map pan → wire feedback buttons to `POST /feedback` (buttons appear only after streaming completes) → add loading skeletons and error handling.

---

## 9. Change Log

| Date | Change | Author |
|---|---|---|
| 2025-06-16 | Initial architecture.md created from agents.md | — |

> All subsequent structural changes must be added as rows here before merging. This includes: new or removed endpoints, changes to feature vectors, agent prompt updates, UI view changes, new libraries or dependencies.
