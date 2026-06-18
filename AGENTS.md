# AGENTS.md — Smart Traffic Intelligence System
## Technical Specification: Agents, Dashboard, Data Flow, and Implementation Logic

---

## 1. What This System Does

Traffic authorities in Bengaluru currently respond to congestion after it has already formed. This system gives them two things they do not have today: a prediction of how bad an ongoing or upcoming incident is likely to get, and a ready-to-act deployment plan generated automatically from that prediction.

A user logs in, sees a map of the city showing historical congestion density, gets automatic alerts when any zone is behaving unusually, and can submit any incident — structured or described in raw Kannada text — to receive a priority classification, an estimated resolution time, and a plain-language response plan telling them exactly how many officers to deploy, where to put barricades, and when to escalate.

The system is built on a real Bengaluru traffic incident dataset. The ML models train on that data. The action plans are generated fresh for every prediction. Nothing is hardcoded or simulated.

---

## 2. Dataset: What It Contains and What It Cannot Do

The dataset contains **8,173 traffic incidents from Bengaluru** across both planned and unplanned event types:

- `unplanned`: 7,706 records — vehicle breakdowns, tree falls, accidents, waterlogging, potholes, and similar reactive incidents
- `planned`: 467 records — construction work, public events (cricket matches, festivals), processions, VIP movements, and protests

This matters for the project directly: the hackathon theme asks about planned event impact, and training data for planned events exists in the dataset. The `event_type` field (planned / unplanned) is available as a binary ML feature and should be included in the feature vector.

For planned events, `end_datetime` is populated and represents the scheduled end time of the event. This is the only column where the planned/unplanned distinction produces a different data shape. For unplanned events, `end_datetime` is null.

The following columns from the dataset are actually used:

| Column | How it is used |
|---|---|
| latitude, longitude | Map rendering, incident markers, heatmap weight |
| event_type | ML input feature (binary: planned=1, unplanned=0) |
| event_cause | ML input feature (label encoded) |
| requires_road_closure | ML input feature (binary) |
| start_datetime | Feature extraction: hour of day, day of week, time bucket |
| end_datetime | For planned events only: compute planned event duration in minutes as an additional input feature |
| closed_datetime | Primary source for computing resolution_minutes (regression target). Present in ~3,141 records. |
| resolved_datetime | Fallback source for resolution_minutes when closed_datetime is null. Present in ~74 records. |
| authenticated | Quality filter — only authenticated=yes records are used for training |
| description | Input to NLP parser |
| veh_type | ML input feature (label encoded, returns -1 when unknown) |
| corridor | ML input feature (ordinal encoded: named corridor=2, ORR variants=1, Non-corridor=0) |
| priority | ML classification target (High / Low) |
| police_station | Passed to action planner as context; used as grouping fallback for zone-null records in anomaly detection |
| zone | ML input feature (label encoded); used for anomaly detection grouping. Null in 57% of records — see data quality note below. |
| junction | Used to compute junction recurrence; passed to action planner as context. Null in 69% of records. |
| address | Displayed in the incident panel |
| status | Filter: only closed/resolved records with valid timestamps are used for duration regression training |

**Data quality note — zone and junction nulls:** `zone` is null or empty for approximately 4,729 of 8,173 records (57%). `junction` is null for approximately 5,663 records (69%). For anomaly detection, records with a null zone are grouped by `police_station` instead. For junction recurrence, a null junction at inference time returns the default value of 1. Models must handle these nulls explicitly — do not drop null-zone records from training, as that removes more than half the dataset.

The following columns are in the dataset but not used in any model or display: `end_address`, `map_file`, `direction`, `veh_no`, `cargo_material`, `reason_breakdown`, `age_of_truck`, `route_path`, `client_id`, `created_by_id`, `citizen_accident_id`, `comment`, `meta_data`, `kgid`, `gba_identifier`, `modified_datetime`, `created_date`, `last_modified_by_id`, `assigned_to_police_id`, `resolved_at_address`, `resolved_at_latitude`, `resolved_at_longitude`, `closed_by_id`, `resolved_by_id`.

The `endlatitude` and `endlongitude` columns are 0 for most records. They are ignored. Only `latitude` and `longitude` are used.

---

## 3. Derived Features Computed Before Training

These features do not exist in the raw dataset and must be computed from what does:

- `resolution_minutes`: computed as `closed_datetime - start_datetime`, converted to minutes. If `closed_datetime` is null, fall back to `resolved_datetime - start_datetime`. Records where this is negative, zero, null, or greater than 1,440 minutes (24 hours) are dropped from regression training. The raw mean duration (~6,200 minutes) is heavily skewed by records left open for days; dropping >24h outliers brings the distribution to a median of ~64 minutes which is the trainable signal. Approximately 3,205 records survive this filter.
- `planned_duration_minutes`: for planned events only, `end_datetime - start_datetime` in minutes. Set to null for unplanned events. Used as an optional feature in the regressor.
- `hour_of_day`: integer 0–23, extracted from `start_datetime`.
- `day_of_week`: integer 0–6, extracted from `start_datetime`.
- `is_peak_hour`: 1 if `hour_of_day` is in [7, 8, 9, 10, 17, 18, 19, 20], else 0.
- `is_weekend`: 1 if `day_of_week` is 5 or 6, else 0.
- `corridor_rank`: integer representing incident frequency count per corridor. Higher values indicate more historically incident-prone corridors. Null corridor values map to a default rank.
- `junction_recurrence`: for each junction string in the dataset, count how many times it appears. This is a proxy for how congestion-prone that junction is historically. Computed once at training time. At inference time, a lookup table is used to find the value for the submitted junction, or 1 if the junction is new or null.
- `time_bucket`: a categorical derived from `hour_of_day` with four values — morning_peak (6–10), afternoon (10–16), evening_peak (16–21), night (21–6). Used for anomaly detection grouping.
- `day_type`: weekday or weekend, derived from `day_of_week`. Used for anomaly detection grouping.

---

## 4. Dashboard: Three Views and One Shared Panel

The dashboard has three views and one component that is shared across all of them. The user is never overwhelmed with features because every action they take ends in the same output surface — the Incident Panel.

### View 1 — Map (the default screen)

This is what the user sees when they log in. It is a full-screen Leaflet.js map of Bengaluru with three layers:

The first layer is a heatmap. Every incident in the dataset is plotted at its latitude/longitude, with weight determined by priority (High incidents contribute more heat than Low) and duration (longer incidents contribute more heat). It defaults to a static historical view showing overall city clustering. However, it also includes a "City Replay" mode, which streams chronological incident data into the heatmap dynamically, accumulating points over time to show how traffic builds up. The map dynamically adjusts its radius and blur based on the zoom level to maintain accurate representations of congested corridors and junctions.

The second layer is individual incident markers — one pin per incident, red for High priority, amber for Low. Hovering on a pin shows the junction name. Clicking a pin opens the Incident Panel on the right side of the screen.

The third layer is zone polygons. Each zone boundary is drawn as a polygon over the map. The fill color of each polygon reflects the current anomaly status of that zone — green for Normal, amber for Watch, red for Critical. This connects the Anomaly Monitor directly to the spatial view, so the user can see at a glance which parts of the city are behaving unusually without reading a list.

The Anomaly Monitor feed sits as a collapsible sidebar on this same screen. It shows a card per zone with its alert level and the three numbers that drove the alert. Clicking "Generate Plan" on a zone card opens the Incident Panel for that zone.

### View 2 — Submit Incident (the form)

This is a single form that serves two purposes which used to be described as separate features ("Event Planner" and "Incident Simulator"). They are the same form with two input modes.

The user can either fill in structured fields — event type (planned / unplanned), event cause, location (typed address or pin drop on map), corridor, time, vehicle type — and submit directly. Or they can paste a raw text description in the description field in any language, and the NLP parser runs first to extract those structured fields automatically, showing the extraction result before proceeding.

Both paths end in the same prediction and the same action plan. The only difference is whether the NLP step is visible.

Submitting the form opens the Incident Panel.

### View 3 — Analytics (a separate page, not the default)

This page shows four charts derived from the historical dataset. They require no ML — they are aggregated statistics computed once from the dataset and served as static JSON by the backend.

Chart 1: Incident volume by hour of day and day of week. This is a 7-row by 24-column grid (a heatmap table) where each cell is colored by the number of incidents that occurred at that hour on that day type, across the full dataset. It shows the traffic authority when incidents are most likely to happen.

Chart 2: Top 15 junctions by total incident count. A horizontal bar chart. Clicking any bar highlights that junction on the Map view by panning to it and briefly animating its marker. This is the one direct link between the Analytics view and the Map view.

Chart 3: Median resolution time by corridor type. A bar chart showing the three corridor categories (High-priority named roads, ORR variants, Non-corridor) and their median resolution times in minutes. This justifies to the user why corridor matters and also validates the prediction model.

Chart 4: Planned vs unplanned incident volume over time (monthly). A line chart or stacked bar showing how many planned and unplanned incidents occurred per month. Since the hackathon theme specifically calls out planned event impact as the core problem, this chart directly shows the evaluator that both event types are present in the data and that the system distinguishes between them.

### The Incident Panel (shared output surface)

The Incident Panel is a right-side drawer that opens from three different triggers: clicking a map marker, submitting the form in View 2, or clicking "Generate Plan" on an anomaly zone card. It always shows the same sections:

- Incident details: address, junction, corridor, event cause, event type (planned/unplanned), time (either historical or just-submitted)
- Prediction result: priority badge (High / Low), confidence score as a percentage, estimated resolution time in minutes and as a clock time (e.g., "estimated clearance by 19:30")
- Action plan: the LLM's deployment plan, streamed word-by-word in a typewriter style so the user sees it being written. The plan is structured into labeled sections: Officers, Barricades, Diversion, Clearance Time, Escalation Trigger, Public Advisory.
- Feedback row: after the action plan finishes streaming, a thumbs-up / thumbs-down button row appears at the bottom of the panel. Clicking either sends the full incident context plus the action plan text and rating to `POST /feedback`. The button state updates to show the selection was recorded. This is visible to the user and to evaluators watching the demo.

For historical incidents (clicked from the map), the prediction is run fresh against the stored incident's features, not cached. For new submissions, the prediction runs on the user's input. For anomaly zone alerts, the prediction is run on the zone's current aggregate state and the action plan is framed as a zone-level pre-emptive response.

---

## 5. How the Views Interlink

- The Map view and the Anomaly Monitor are permanently connected: zone polygon colors on the map exactly reflect the anomaly badge levels in the sidebar. They update together.
- The Analytics view and the Map view are connected through junction filtering: clicking a junction bar in Chart 2 pans the map to that junction and highlights its markers.
- The Incident Panel is the single output surface for all three views. Whether the user clicked a map pin, submitted a form, or responded to an anomaly alert, they see the same panel.
- The Anomaly Monitor feeds the Incident Panel: clicking "Generate Plan" on a zone card triggers the same NLP-parse-skipped, prediction-then-action-plan pipeline that View 2 uses, but with zone-level context instead of individual incident context.
- The form in View 2 adds a new marker to the Map when submitted, so the user's just-created incident immediately appears on the map as a new pin. This closes the loop between submission and spatial display.

---

## 6. The Four Agents

These are not separate services. They are four functions that run in sequence inside the FastAPI backend, called by different endpoints. Each one has a defined input and a defined output.

### Agent 1 — NLP Description Parser

This agent runs only when the user has provided a free-text description. If the user fills in structured fields without a description, this agent is skipped entirely.

Input: a raw string. This may be in Kannada script, broken English, mixed language, or any combination. Example: `"ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್"` or `"pipe vehicle off aagide saro"`.

What it does internally: the backend makes a single call to the gemini flash API. The prompt contains a system instruction telling the model to act as a structured extraction agent for traffic incident descriptions, a few-shot example block showing one Kannada input and its expected JSON output, and the raw user description. The model is instructed to return only a JSON object with no explanation or prose.

Output: a JSON object with five fields:
- `root_cause`: one of the NLP parser's predefined values — `vehicle_breakdown`, `accident`, `road_maintenance`, `water_logging`, `tree_fall`, `protest`, `traffic_congestion`, `vip_movement`, `unplanned_utility_work`, or `general_delay`
- `vehicle_type`: one of the NLP parser's predefined values (`bmtc_bus`, `car`, `two_wheeler`, `auto_rickshaw`, `hgv`, `lcv`, `ambulance`), or null if not mentioned
- `severity`: integer 1, 2, or 3 (low, medium, high) based on the description's urgency
- `action_needed`: boolean
- `normalized_summary`: a one-sentence English description of the incident for display

If the API call fails or the response cannot be parsed as JSON, the agent returns null and the frontend skips the NLP display section, falling through to the structured fields the user already provided.

The agent's output is shown to the user in the Incident Panel as a "Parsed from description" section before the prediction result. This makes the NLP step visible and verifiable.

### Agent 2 — Prediction Agent (two XGBoost models)

This agent always runs, for every incident submission and every map marker click.

Input: a feature vector constructed from either the user's form submission or a stored incident's fields. The features are:
- `latitude` (float)
- `longitude` (float)
- `requires_road_closure` (0 or 1)
- `hour_of_day` (0–23)
- `day_of_week` (0–6)
- `is_peak_hour` (0 or 1)
- `is_weekend` (0 or 1)
- `corridor_rank` (integer: frequency count)
- `junction_recurrence` (integer, from the lookup table; default 1 for unknown junctions)
- `event_cause_enc` (label encoded against the dataset's cause vocabulary)
- `veh_type_enc` (label encoded, returns -1 when vehicle type is unknown)
- `zone_enc` (label encoded; a dedicated "unknown" label is reserved for null zones)

There are two separate XGBoost models, both sharing this same feature vector.

The first model is a binary classifier. It was trained on all authenticated incidents where `priority` is not null. The training target is `priority` encoded as 0 (Low) or 1 (High). Class imbalance (High: 5,030, Low: 3,141) is handled with `scale_pos_weight` or `class_weight='balanced'`. It returns a predicted class and a probability score (the probability assigned to the predicted class, displayed as a confidence percentage in the UI).

The second model is a regressor. It was trained on all authenticated incidents where `resolution_minutes` is computable and positive (approximately 3,205 records after dropping outliers above 24 hours). The training target is `resolution_minutes`. It returns a float which is rounded to the nearest minute for display.

Both models are trained once, serialized with joblib, and loaded into memory when the FastAPI server starts. Inference takes under 100 milliseconds.

Output: a JSON object with four fields:
- `priority`: "High" or "Low"
- `confidence`: float between 0 and 1 (the classifier's probability score)
- `estimated_duration_minutes`: integer
- `estimated_resolution_time`: an ISO datetime string, computed as `current_time + estimated_duration_minutes`

### Agent 3 — Anomaly Detection Agent (Isolation Forest)

This agent runs on a schedule, not in response to user actions. It runs every 5 seconds and produces a score for each zone. It does not run per-incident — it runs per-zone.

**Grouping strategy for null zones:** Records where zone is null are grouped by `police_station` for the purposes of this agent. This ensures that all 8,173 records contribute to the baseline, not just the 43% with a non-null zone.

How the training data is built: for every unique combination of (zone_or_station, day_type, time_bucket) in the dataset, we compute three aggregate statistics across all incidents in that bucket:
- `mean_incident_count`: average number of incidents per day that fell in this zone + day_type + time_bucket combination
- `high_priority_ratio`: fraction of those incidents that were High priority
- `mean_duration_minutes`: average resolution time in minutes for those incidents

This produces one row per (zone_or_station, day_type, time_bucket) combination. Each row is a feature vector of three numbers. The Isolation Forest is trained on all of these rows. It learns the distribution of normal traffic patterns across the city.

Worked example of anomaly detection:

Suppose the historical baseline for HSR Layout on a weekday evening peak is: 1.5 incidents per day, 50% High priority, 40-minute average duration. These three numbers form a point in 3D space that sits near the centre of the cluster of all other normal zone-time snapshots.

Now during the demo, we replay the dataset chronologically. At some point in the replay, there is a simulated "current moment" where HSR Layout has 5 active incidents in the evening peak, 90% are High priority, and average duration so far is 85 minutes. The feature vector for this moment is (5, 0.9, 85). We feed this to the Isolation Forest.

Isolation Forest internally tries to isolate this point by making random splits of the feature space. A point that sits far from the cluster — like (5, 0.9, 85) versus the normal (1.5, 0.5, 40) — can be isolated in very few splits because it is alone. A normal point requires many splits because it is surrounded by similar points. The model returns a score close to -1 for very anomalous points and close to +1 for normal points.

We convert this to a human-readable alert level: scores above 0 = Normal, 0 to -0.1 = Watch, below -0.1 = Critical. These thresholds are tuned by inspecting the score distribution across the dataset.

The agent runs every 0.066 seconds during the demo by streaming new incidents sequentially from the dataset into a pure per-zone accumulator (incidents are never removed; they only accumulate over time), computing the three statistics from the current accumulated state, feeding them to the trained model, and returning the scores. Once the dataset is exhausted, the replay loop stops and freezes at the final state. The frontend polls `/anomaly` every 5 seconds and updates the zone cards and map polygon colors.

Output per zone: `{ zone, alert_level, incident_count, high_priority_ratio, mean_duration, anomaly_score }`.

### Agent 4 — Action Planner Agent (LLM)

This agent runs after Agent 2 completes and produces the deployment-ready response plan. It uses the same gemini flash API as Agent 1.

Input: a context block assembled by the backend from Agent 2's output plus the original incident fields:
- event type (planned or unplanned) and event cause
- whether this is a current incident, a future planned event, or a zone-level pre-emptive alert
- address and junction
- corridor type (human-readable, not encoded)
- police station responsible for this area
- zone name
- predicted priority and confidence
- estimated duration in minutes
- whether road closure is required
- the NLP-parsed cause and normalized summary, if Agent 1 ran

What it does internally: the backend constructs a structured prompt. The system message establishes the model as a traffic authority operations assistant with knowledge of Bengaluru's road network. The user message injects all the context fields above in labeled plaintext. The instruction tells the model to produce exactly six labeled sections: Officers, Barricades, Diversion, Estimated Clearance, Escalation Trigger, and Public Advisory. It is explicitly told not to add preamble or explanation.

For planned events (public_event, construction, procession, vip_movement, protest), the prompt specifies that this is a pre-announced event requiring pre-emptive deployment — officers and barricades should be positioned before the event start time, not dispatched reactively.

The response is streamed token-by-token from the API using Server-Sent Events. FastAPI streams each token as it arrives to the frontend, and the frontend renders it in a typewriter-style component.

Output: a plain-language action plan in six labeled sections, streamed as SSE.

---

## 7. API Endpoints

All endpoints are FastAPI. The dataset CSV is loaded into a pandas DataFrame at server startup and held in memory. The two XGBoost models and the Isolation Forest are also loaded from disk at startup. No database is required — all reads are from the in-memory DataFrame and all writes are discarded after the session.

| Endpoint | Method | What it does |
|---|---|---|
| GET /heatmap | GET | Returns a list of `{lat, lng, weight}` objects for every incident in the dataset. Weight = 2 if priority is High, 1 if Low, multiplied by a normalized duration factor. |
| GET /incidents | GET | Returns paginated incident records with lat, lng, address, junction, corridor, event_type, priority, and status for map marker rendering. Accepts optional `zone`, `priority`, and `event_type` query params for filtering. |
| POST /nlp-parse | POST | Accepts `{description: string}`. Calls Agent 1. Returns the structured extraction JSON or null on failure. |
| POST /predict | POST | Accepts the feature fields from the form or a stored incident. Runs Agent 2. Returns `{priority, confidence, estimated_duration_minutes, estimated_resolution_time}`. |
| GET /action-plan | GET (SSE) | Accepts query params matching the full incident + prediction context. Calls Agent 4 and streams the response as Server-Sent Events. |
| GET /anomaly | GET | Returns the current anomaly scores for all zones, updated every 0.066 seconds by the background replay loop. |
| POST /anomaly/replay | POST | Resets the anomaly replay loop to the beginning of the dataset, clearing accumulators and starting the stream from index 0. |
| GET /analytics | GET | Returns all four analytics datasets in a single response: the 7x24 incident volume grid, the top 15 junctions by count, the corridor-grouped median durations, and the planned vs unplanned monthly volume series. Computed once at startup from the in-memory DataFrame. |
| POST /feedback | POST | Accepts `{incident_context: object, action_plan: string, rating: "up" or "down"}`. Appends the entry as a JSON line to a local `feedback.jsonl` file. Returns `{status: "ok"}`. |
| GET /feedback | GET | Returns all entries from `feedback.jsonl` as a JSON array for post-demo review. |

That is seven endpoints. There is no `/simulate` endpoint — it does not need to exist as a separate concept. The frontend calls `/nlp-parse`, then `/predict`, then `/action-plan` in sequence. The orchestration is in the frontend, not a separate backend endpoint.

---

## 8. End-to-End Data Flow for the Two Primary User Journeys

### Journey 1 — User submits a structured incident

1. User opens the form in View 2. They select event type (planned/unplanned), event cause, drop a pin on the map, choose corridor, pick a time, select vehicle type. They do not enter a description.
2. User clicks Submit.
3. Frontend skips the NLP step and calls POST /predict directly with the form fields.
4. Backend engineers the feature vector (event_type binary, corridor_rank, event_cause one-hot, veh_type one-hot, closure flag, time features, zone encoding, junction_recurrence lookup).
5. XGBoost classifier returns priority=High, confidence=0.84.
6. XGBoost regressor returns estimated_duration_minutes=130.
7. Backend computes estimated_resolution_time as current_time + 130 minutes.
8. Response arrives at the frontend. The Incident Panel opens. Priority badge and estimated clearance time are displayed immediately.
9. Frontend calls GET /action-plan with the full context as query parameters.
10. Backend constructs the prompt, calls gemini API with streaming enabled.
11. FastAPI streams SSE tokens to the frontend.
12. The action plan types out in the Incident Panel over approximately 5–8 seconds.
13. A new map marker is added at the user's dropped pin location, colored red (High).
14. The anomaly score for the relevant zone is recomputed immediately (not waiting for the 30-second cycle) and the zone card and polygon color update.

### Journey 2 — User pastes a Kannada description

1. User opens the form in View 2. They type a location address and paste the description: `"ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್"`. They leave event type and vehicle type blank.
2. User clicks Submit.
3. Frontend detects a non-empty description and calls POST /nlp-parse first.
4. NLP Agent calls gemini API, receives the structured extraction.
5. Frontend shows the "Parsed from description" section in the Incident Panel: root_cause=vehicle_breakdown, vehicle_type=bmtc_bus, severity=2, normalized_summary="BMTC bus has broken down at the reported location."
6. Frontend merges the NLP output with the user's typed location and calls POST /predict.
7. Steps 4–14 from Journey 1 apply from here.

---

## 9. What Was Removed and Why

The following items from the original plan are not in this specification. Each removal is due to a specific technical constraint or redundancy, not scope-cutting for convenience.

"Planned event impact prediction as a separate ML model" — this was originally removed because the dataset was believed to contain no planned events. With 467 planned records now confirmed, the distinction is handled as a feature (`event_type` binary) in the existing model rather than a second model. A second model would require enough planned-event records to train in isolation; 467 records is not enough for that. One model with `event_type` as a feature is the correct approach.

"Diversion route recommendations as a computed feature" — removed. The dataset contains no road network topology and no training points for rerouting or diversion behavior. There is no way to compute actual alternate routes without a dedicated routing API (OSRM, Google Directions, etc.) and a separate dataset with historical diversion patterns — neither of which is available. Adding this feature would require sourcing and integrating an entirely different dataset, which is outside the scope of this project. The action planner LLM (Agent 4) mentions diversions in its plan text using its built-in knowledge of Bengaluru's road network, which is sufficient and accurate without a separate routing computation or ML model.

"Resource planning view as a separate dashboard module" — removed. This was identical in content to the action plan output. Officers, barricades, and deployment logistics are generated by Agent 4. Displaying them again in a separate table adds no information.

"Incident Simulator as a separate module from Event Planner" — merged into one form. They were the same user task with different input modes. A single form with an optional description field handles both.

"Corridor risk breakdown chart and event cause distribution chart" — removed. These add charts to the analytics page without telling the user anything they cannot already see from the map heatmap and from the ML model's behavior. The four charts that remain are each distinctly informative.

"Incident density within 1km radius as a training feature" — replaced with junction_recurrence. Computing a 1km radius count at inference time requires a spatial index and adds latency. Junction recurrence achieves the same goal — flagging historically congestion-prone locations — with a simple dictionary lookup.

"IndicBERT for multilingual NLP" — replaced with gemini API. IndicBERT requires a hosted model, an inference API wrapper, and tokenizer setup. The gemini API achieves better zero-shot extraction quality on mixed-script text with a single function call and returns structured JSON without a separate parsing layer.

"LangChain" — not used. The agent pipeline here is four sequential function calls. An orchestration framework is not needed and would add dependency overhead.

"Post-event learning" — a minimal feedback signal is now in scope. After an action plan is delivered, the Incident Panel shows a thumbs-up / thumbs-down feedback button beneath the plan. The user's response (and the full incident context: zone, event_cause, priority, estimated_duration_minutes, actual outcome if known) is written to a lightweight local feedback log (a JSON-lines file appended at runtime). This log is not used to retrain any model during the session — the XGBoost models and Isolation Forest are static. The log exists solely so that after the demo, the team has a structured record of which action plans were rated positively or negatively. A `GET /feedback` endpoint returns the log contents for inspection. This is the lightest possible feedback loop that gives evaluators a concrete answer to "how does the system learn from outcomes?" without requiring a live retraining pipeline.

---

## 10. Build Sequence

The order below reflects hard dependencies. Each stage produces artifacts that the next stage consumes. No implementation detail here is optional.

**Stage 1 — Data pipeline and models (do this first; everything else depends on it)**

Load the CSV. Filter to `authenticated=yes`. Inspect and handle nulls: `zone` is null in 57% of records, `junction` in 69%, `veh_type` in ~40% — all three need null-safe encoding, not row-dropping. Compute all derived features. Build the junction_recurrence lookup table. Build the zone label encoder with an explicit "unknown" class. One-hot encode `event_cause` and `veh_type` (null becomes all-zeros). Compute `resolution_minutes` using `closed_datetime` as primary, `resolved_datetime` as fallback. Drop records where resolution_minutes is negative, zero, null, or above 1,440. Train the XGBoost classifier (with `scale_pos_weight` for class imbalance). Train the XGBoost regressor. Compute the anomaly baseline aggregate table (grouped by zone_or_station + day_type + time_bucket). Train the Isolation Forest. Write a single `build_feature_vector(input_dict) → numpy_array` function that is used identically at training time and inference time — this prevents train/serve skew.

**Stage 2 — Backend endpoints**

Write the NLP parser prompt and `POST /nlp-parse`. Test it against five real description strings from the dataset (Kannada, broken English, mixed). Write `POST /predict`. Write the action plan prompt template and `GET /action-plan` with SSE — test SSE streaming with curl before connecting the frontend. Implement the anomaly replay loop as a FastAPI background task using `asyncio.create_task`. Write `GET /anomaly`, `GET /heatmap`, `GET /incidents`, `GET /analytics`. Write `POST /feedback` and `GET /feedback` — these are two-line endpoints, implement them last in this stage.

**Stage 3 — Frontend core**

Set up the Leaflet map. Integrate the heatmap plugin. Build zone polygons as convex hulls of the lat/lng points grouped by zone (computed from the dataset). Build the Anomaly Monitor sidebar polling `GET /anomaly` every 5 seconds. Build the Incident Panel drawer with three states: loading prediction, prediction loaded and action plan streaming, complete. Wire up map marker click.

**Stage 4 — Frontend form, analytics, polish**

Build the Submit Incident form with both input modes. Wire the three-step API sequence: `/nlp-parse` (if description), then `/predict`, then `/action-plan` as SSE. Build the Analytics page with all four Recharts charts. Wire the junction bar click to pan the map. Wire the feedback thumbs-up / thumbs-down buttons in the Incident Panel to `POST /feedback` — the buttons should only appear after the action plan finishes streaming, not during. Add loading skeletons and error handling throughout.

Now once this is understood go to @architecture.md to understand how everything is handled, whats the type, the requirement everything.
Also go through @MODELS.md to understand the main prediction models and how they expect input and output