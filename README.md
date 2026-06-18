# 🚦 Smart Traffic Intelligence System

> An AI-powered traffic forecasting and decision-support platform that helps authorities **predict congestion** caused by planned and unplanned events, **detect anomalies** before they escalate, and **auto-generate response plans** using Generative AI.

---

## 🧩 Problem Statement

Traffic authorities today react to congestion *after* it happens — relying on experience-based decisions, manual patrols, and no post-event learning. This system flips that model:

- **Planned events** (rallies, cricket matches, festivals) → predict impact in advance
- **Unplanned events** (breakdowns, accidents, waterlogging) → detect anomalies early
- **Every event** → auto-generate a ready-to-act response plan via GenAI

---

## ✨ Core Features

| Feature | Description |
|---|---|
| Event-based congestion prediction | Forecast traffic volume and risk score for any upcoming event |
| Multilingual incident understanding | Auto-classify Kannada/mixed-language incident reports using NLP |
| GenAI action planner | LLM-generated response plans — officers, barricades, diversions |
| Congestion heatmap | Dynamic City Replay map of historical and streaming congestion zones |
| Anomaly detection | Detect unexpected traffic surges before they become jams |
| Interactive dashboard | Real-time monitoring, alerts, and incident submission |

---

## 🧠 Machine Learning

### Traffic Prediction
- **Models:** XGBoost (Classifier & Regressor)
- **Predicts:** Priority (High/Low) and estimated resolution time (minutes)
- **Inputs:** Location, corridor frequency, time-of-day, zone, historical junction patterns, incident cause

### Anomaly Detection
- **Models:** Isolation Forest
- **Detects:** Unexpected congestion surges and unplanned disruptions in real time (per zone)
- **Output:** Alert severity score (Normal, Watch, Critical)

---

## 🤖 GenAI Features

### 1. Multilingual NLP — Incident Understanding
Real-world incident descriptions in this dataset are written in Kannada, broken English, and mixed scripts (e.g. *"pipe vehicle off aagide saro"*). A standard rule-based system would discard this as noise.

**What it does:**
- Uses **Google Gemini 2.5 Flash** to read free-text descriptions in any language
- Extracts: root cause, vehicle type, severity, and generates an English summary
- Auto-classifies the event so it feeds cleanly into the ML pipeline

### 2. GenAI Action Planner — Automated Response Generation
Once the ML model predicts priority and expected duration, a Large Language Model takes that output and generates a **complete, human-readable response plan**.

**What it does:**
- Receives: predicted priority, event type, corridor, duration estimate, junction name
- Generates: officers to deploy, barricades, diversion routes, estimated clearance, escalation triggers, and public advisories
- Output is in plain language, streamed in real-time, ready to be acted on immediately

---

## 🏗 System Architecture

```
Raw Incident Data (CSV)
        │
        ▼
┌─────────────────────────┐
│  FastAPI Backend        │
│  (Data & Feature Eng.)  │
└────────────┬────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────┐  ┌──────────────┐
│ XGBoost  │  │ Isolation    │
│ Models   │  │ Forest       │
│(Priority,│  │(Anomaly      │
│ Duration)│  │ Detection)   │
└────┬─────┘  └──────┬───────┘
     │               │
     └──────┬────────┘
            ▼
┌─────────────────────────┐
│ Google Gemini 2.5 Flash │  ← NLP Parsing & Action Plans
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ Next.js Interactive GUI │  ← React + Leaflet + Tailwind
└─────────────────────────┘
```

---

## 🛠 Tech Stack

### Frontend
- **Next.js (React)** — component-based UI
- **TypeScript** — static typing
- **Tailwind CSS** — styling
- **Leaflet.js** — interactive map, heatmap, markers

### Backend
- **FastAPI** — REST API, SSE streaming, prediction endpoints

### Machine Learning
- **Scikit-learn** — preprocessing, Isolation Forest
- **XGBoost** — classification and regression models
- **Pandas / NumPy** — data processing and feature engineering

### GenAI / NLP
- **Google Gemini API (2.5 Flash)** — NLP extraction and action plan generation

---

## 📊 Dashboard Views

| View | What it shows |
|---|---|
| **Map View** | Full-screen Leaflet map with historical/streaming heatmap, anomaly zone polygons, and real-time alert sidebar |
| **Submit Incident** | Form with structured inputs and free-text NLP processing to simulate/report incidents |
| **Analytics** | Historical charts: volume grid, top junctions, corridor duration, planned vs unplanned counts |

*All interactions funnel into a shared **Incident Panel** drawer that displays the prediction, streams the LLM action plan, and collects user feedback.*

---

## 🚀 MVP Scope

- [x] Event input form (structured + NLP description)
- [x] Traffic prediction engine (priority + duration)
- [x] Google Gemini integration for incident parsing
- [x] GenAI action plan generator (streaming SSE)
- [x] Dynamic Congestion heatmap with City Replay
- [x] Real-time anomaly alert feed via Isolation Forest
- [x] Post-plan user feedback collection

---

## 📂 Dataset

Built on real Bengaluru traffic incident data containing:
- Planned and unplanned events, event causes, corridor rankings, resolution times, multilingual descriptions, zone and junction metadata (8,173 records total).

---

## 🎯 Goal

Enable traffic authorities to shift from **reactive** to **proactive** congestion management — using ML to forecast impact, NLP to understand incidents in any language, and GenAI to instantly generate deployment-ready response plans.

---

## 👥 Team

Built for **Smart City Hackathon** — Theme 2: Event-Driven + Anomaly-Based Traffic Congestion Prediction System
