# Smart Traffic Intelligence System

![Status](https://img.shields.io/badge/Status-Deployed-success?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Frontend-Next.js_16-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Groq](https://img.shields.io/badge/GenAI-Groq-f55036?style=for-the-badge)
![XGBoost](https://img.shields.io/badge/ML-XGBoost-1D86E8?style=for-the-badge)
![scikit-learn](https://img.shields.io/badge/scikit--learn-%23F7931E.svg?style=for-the-badge&logo=scikit-learn&logoColor=white)
![Pandas](https://img.shields.io/badge/pandas-%23150458.svg?style=for-the-badge&logo=pandas&logoColor=white)
![NumPy](https://img.shields.io/badge/numpy-%23013243.svg?style=for-the-badge&logo=numpy&logoColor=white)

An AI-powered traffic forecasting and decision-support platform built on a dataset of **8,173 real Bengaluru traffic incidents**. It helps authorities predict congestion caused by planned and unplanned events, detect anomalies before they escalate, and auto-generate response plans using Generative AI. By learning the actual congestion behaviors of Bengaluru's unique corridors, the system transitions city operations from reactive to proactive.


## Problem Statement

Traffic authorities today react to congestion after it happens, relying on experience-based decisions, manual patrols, and no post-event learning. This system solves that by utilizing historical city data to anticipate choke points before they form:

*   **Planned events** (public gatherings, construction) are analyzed to predict impact in advance.
*   **Unplanned events** (breakdowns, accidents) trigger early anomaly detection.
*   **Every incident** is processed through GenAI to auto-generate a ready-to-act response plan.


## System Architecture

The architecture relies on a Next.js interactive frontend and a FastAPI backend that handles ML model inference, data processing, and integrations with Large Language Models.

```mermaid
graph TD
    A[Raw Incident Data] -->|In-Memory Data Loader| B[FastAPI Backend]
    
    subgraph Machine Learning
    C[XGBoost Classifier] 
    D[XGBoost Regressor]
    E[Isolation Forest]
    end
    
    B -->|Feature Vector| C
    B -->|Feature Vector| D
    B -->|Time-Series Metrics| E
    
    C -->|Priority Prediction| B
    D -->|Duration Estimate| B
    E -->|Anomaly Scores| B
    
    subgraph Generative AI
    F[Groq API]
    end
    
    B <-->|NLP Parsing, Geocoding, Action Plans| F
    
    G[Next.js Interactive Dashboard] <-->|REST API & SSE Streams| B
```

## Data Flow & Operations

### 1. Incident Submission & Prediction Pipeline

When an incident is reported, the system parses the input, resolves the exact geographic location, predicts the severity, and streams a live response plan back to the dashboard.

```mermaid
sequenceDiagram
    participant UI as Next.js Dashboard
    participant API as FastAPI Backend
    participant LLM as Groq API
    participant ML as XGBoost Models
    
    alt Structured Input Mode
        UI->>UI: Gather Form Fields (Type, Cause, Corridor)
    else Free-Text Mode
        UI->>API: POST /nlp-parse (Description)
        API->>LLM: Extract structured features
        LLM-->>API: JSON properties
        API-->>UI: Parsed features
    end
    
    UI->>API: POST /geocode-zone (Zone string)
    API->>LLM: Resolve geographic location
    LLM-->>API: Coordinates {lat, lng}
    API-->>UI: High-confidence coordinates
    
    UI->>API: POST /predict (Feature Vector)
    API->>ML: Run classifier & regressor
    ML-->>API: Inference results
    API-->>UI: Priority & Duration estimate
    
    UI->>API: GET /action-plan (Full Context)
    API->>LLM: Request 6-section response plan
    LLM-->>API: SSE token chunks
    API-->>UI: Stream text to Incident Panel
```

### 2. Live Anomaly Detection

The system continuously evaluates traffic conditions across city zones to identify anomalous congestion patterns before they escalate.

```mermaid
sequenceDiagram
    participant UI as Next.js Dashboard
    participant API as FastAPI Backend
    participant Task as Background Loop
    participant IF as Isolation Forest
    
    loop Every 0.07s (Dataset Replay)
        Task->>Task: Update sliding window (24h eviction)
        Task->>IF: Compute metrics (count, ratio, duration)
        IF-->>Task: Return Anomaly Scores
        Task->>API: Update in-memory cache
    end
    
    loop Every 10s
        UI->>API: GET /anomaly
        API-->>UI: Alert Levels (Normal/Watch/Critical)
        UI->>UI: Update Map Polygons & Sidebar
    end
```

### 3. Dynamic City Heatmap

The system renders a visual representation of congestion severity. It defaults to a static layer of accumulated historical data, but features a "City Replay" mode that streams dynamic clusters in real-time.

```mermaid
flowchart TD
    subgraph Backend Processing
        A[Raw Dataset] -->|Load at Startup| B[Weight Calculation]
        B -->|Priority: High=2, Low=1| C[Multiply by Normalized Duration]
        C --> D[(Heatmap Memory Cache)]
        E[New Live Incident Submitted] -->|Incremental Update| D
    end

    subgraph City Replay Mode
        F[Background Stream Loop] -->|3 incidents / 0.06s| G[(Replay Accumulator)]
    end

    subgraph Frontend Map
        D -->|GET /heatmap on load| H[Static Heatmap Layer]
        G -->|GET /heatmap/replay polled every 5s| I[Dynamic Replay Layer]
        E -->|Drops Persistent Red Pin| J[Incident Pin Layer]
    end
```


## Core Features

*   **Event-Based Congestion Prediction:** Forecast traffic volume and priority risk scores for any upcoming or ongoing event.
*   **Multilingual Incident Understanding:** Automatically classify Kannada or mixed-language incident reports using NLP to extract actionable structured data.
*   **GenAI Action Planner:** LLM-generated deployment plans specifying required officers, barricades, diversions, escalation triggers, and public advisories.
*   **Dynamic Congestion Heatmap:** Real-time city replay map visualization of historical and streaming congestion zones.
*   **Pre-emptive Anomaly Detection:** Detect unexpected traffic surges on a zone-by-zone basis.
*   **AI Geocoding:** Dynamically resolve ambiguous or free-text area names into precise geographic coordinates.


## Machine Learning Integration

*   **Traffic Prediction Models:** XGBoost Classifier and Regressor models predicting priority (High/Low) and estimated resolution time (in minutes). Inputs include location, corridor frequency, time-of-day, zone, and incident cause.
*   **Anomaly Detection:** Isolation Forest model monitoring unexpected congestion surges and unplanned disruptions, outputting alert severity scores.


## Technology Stack

### Frontend
*   **Next.js 16**
*   **TypeScript**
*   **Tailwind CSS**
*   **Leaflet.js** (Interactive mapping and heatmaps)
*   **Recharts** (Analytics and data visualization)

### Backend
*   **Python 3**
*   **FastAPI** (REST API, Server-Sent Events, background tasks)
*   **AsyncIO**

### Machine Learning & Data Processing
*   **Scikit-learn** (Preprocessing, Isolation Forest)
*   **XGBoost** (Classification and regression models)
*   **Pandas / NumPy** (In-memory data processing and feature engineering)

### Generative AI
*   **Groq API** (NLP extraction, geocoding resolution, and action plan generation)


## Dashboard Views

1.  **Map View:** Full-screen Leaflet map displaying a historical or streaming heatmap, anomaly zone polygons, and a real-time alert sidebar.
2.  **Submit Incident:** An intuitive form supporting both structured inputs and free-text NLP processing to simulate or report live incidents.
3.  **Analytics:** Historical data charts displaying hourly volume profiles, a leaderboard of high-risk junctions, and planned versus unplanned monthly trends.

All user interactions funnel into a shared **Incident Panel** drawer that displays predictions, streams the LLM-generated action plans, and collects user feedback.

## Dataset Information

The system is built on a real Bengaluru traffic incident dataset containing 8,173 records. The data includes both planned and unplanned events, specific causes, corridor rankings, multilingual descriptions, and zone/junction metadata.
