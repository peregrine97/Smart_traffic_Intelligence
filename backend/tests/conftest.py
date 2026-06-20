"""
conftest.py — Shared pytest fixtures for Smart Traffic Intelligence backend tests.

All agent singletons are mocked so tests run without:
  - Real ML model files on disk
  - Real Groq API calls
  - Real CSV dataset loading

The TestClient is pre-configured with agents injected so every endpoint
responds correctly even without the real startup sequence.
"""

import io
import json
import textwrap
from pathlib import Path
from typing import Any, Dict, Generator, List
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Synthetic in-memory DataFrame (replaces the 8173-row CSV)
# ---------------------------------------------------------------------------

SYNTHETIC_INCIDENTS = [
    {
        "incident_id": f"INC_{i:04d}",
        "start_datetime": f"2024-01-{(i % 28) + 1:02d}T{(i % 24):02d}:00:00",
        "closed_datetime": f"2024-01-{(i % 28) + 1:02d}T{(i % 24) + 1:02d}:00:00",
        "event_type": "unplanned" if i % 3 != 0 else "planned",
        "event_cause": ["vehicle_breakdown", "accident", "congestion", "construction", "tree_fall"][i % 5],
        "veh_type": ["bmtc_bus", "private_car", "auto", "heavy_vehicle", "taxi"][i % 5],
        "priority": "High" if i % 2 == 0 else "Low",
        "zone": ["Koramangala", "Whitefield", "Indiranagar", None, "HSR Layout"][i % 5],
        "police_station": ["Koramangala PS", "Whitefield PS", "Indiranagar PS", "Marathahalli PS", "HSR PS"][i % 5],
        "junction": ["Silk Board", "Marathahalli", "Trinity", None, "BTM"][i % 5],
        "corridor": ["ORR East 1", None, "ORR West 1", "MG Road", None][i % 5],
        "latitude": 12.9352 + (i * 0.001),
        "longitude": 77.6245 + (i * 0.001),
        "requires_road_closure": i % 4 == 0,
        "resolution_minutes": 60 + (i * 5) % 120,
    }
    for i in range(1, 61)  # 60 synthetic incidents
]

SYNTHETIC_DF = pd.DataFrame(SYNTHETIC_INCIDENTS)


# ---------------------------------------------------------------------------
# Mock Agents
# ---------------------------------------------------------------------------

def make_mock_prediction_agent():
    """Return a mock PredictionAgent that always succeeds."""
    agent = MagicMock()
    agent._models_loaded = True
    agent.predict_incident.return_value = {
        "priority": "High",
        "confidence": 0.8542,
        "estimated_duration_minutes": 75,
        "estimated_resolution_time": "2024-06-15T10:15:00",
    }
    return agent


def make_mock_nlp_parser():
    """Return a mock NLPIncidentParser."""
    parser = MagicMock()
    parser.groq_key = "mock-key"
    parser.parse_description.return_value = {
        "root_cause": "vehicle_breakdown",
        "vehicle_type": "bmtc_bus",
        "severity": 2,
        "action_needed": True,
        "normalized_summary": "BMTC bus has broken down at the reported location.",
    }
    return parser


def make_mock_anomaly_detector():
    """Return a mock TrafficAnomalyDetector."""
    detector = MagicMock()
    detector.model = MagicMock()
    detector.model.decision_function.return_value = np.array([-0.05])
    detector.baseline_stats = pd.DataFrame({
        "zone_or_station": ["Koramangala", "Whitefield", "Indiranagar"],
    })
    detector.overall_mean_duration = 72.0
    return detector


def make_mock_action_planner():
    """Return a mock ActionPlannerAgent with a streaming generator."""
    planner = MagicMock()

    async def _mock_stream(params, model_name=None):
        tokens = [
            "Officers: Deploy 4 officers at Silk Board junction.\n",
            "Barricades: Place 3 barricades on ORR East 1.\n",
            "Diversion: Route traffic via MG Road.\n",
            "Estimated Clearance: 75 minutes.\n",
            "Escalation Trigger: If not cleared in 90 mins, call senior officer.\n",
            "Public Advisory: Expect 45-60 minute delays on ORR East 1.\n",
        ]
        for token in tokens:
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    planner.stream_plan = _mock_stream
    return planner


# ---------------------------------------------------------------------------
# Analytics & heatmap cache mocks
# ---------------------------------------------------------------------------

MOCK_ANALYTICS_CACHE = {
    "volume_grid": [[i * j for j in range(24)] for i in range(7)],
    "top_junctions": [
        {"junction": "Silk Board", "count": 120, "lat": 12.9162, "lng": 77.6227},
        {"junction": "Marathahalli", "count": 95, "lat": 12.9563, "lng": 77.7010},
    ],
    "corridor_durations": [
        {"corridor_rank": 1, "label": "ORR East 1", "median_minutes": 45.0},
        {"corridor_rank": 2, "label": "ORR West 1", "median_minutes": 38.0},
    ],
    "planned_vs_unplanned": [
        {"month": "2024-01", "planned": 12, "unplanned": 34},
        {"month": "2024-02", "planned": 8, "unplanned": 29},
    ],
}

MOCK_HEATMAP_CACHE = [
    {"lat": 12.9352, "lng": 77.6245, "weight": 1.5},
    {"lat": 12.9563, "lng": 77.7010, "weight": 2.0},
    {"lat": 12.9162, "lng": 77.6227, "weight": 0.8},
]

MOCK_INCIDENTS = [
    {
        "incident_id": "INC_0001",
        "lat": 12.9352,
        "lng": 77.6245,
        "priority": "High",
        "event_type": "unplanned",
        "event_cause": "vehicle_breakdown",
        "zone": "Koramangala",
        "police_station": "Koramangala PS",
        "junction": "Silk Board",
        "corridor": "ORR East 1",
        "start_datetime": "2024-06-15T08:30:00",
        "veh_type": "bmtc_bus",
        "requires_road_closure": False,
    },
    {
        "incident_id": "INC_0002",
        "lat": 12.9563,
        "lng": 77.7010,
        "priority": "Low",
        "event_type": "planned",
        "event_cause": "construction",
        "zone": "Whitefield",
        "police_station": "Whitefield PS",
        "junction": "Marathahalli",
        "corridor": None,
        "start_datetime": "2024-06-15T10:00:00",
        "veh_type": None,
        "requires_road_closure": True,
    },
]


# ---------------------------------------------------------------------------
# Main application fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app_with_mocks():
    """
    Create the FastAPI app with all external dependencies mocked.
    Scope=session so we only build it once.
    """
    # Patch data loader before importing app
    with patch("backend.data.loader.load_dataset") as mock_load, \
         patch("backend.data.loader.get_dataframe", return_value=SYNTHETIC_DF), \
         patch("backend.data.loader.get_heatmap_cache", return_value=MOCK_HEATMAP_CACHE), \
         patch("backend.data.loader.get_analytics_cache", return_value=MOCK_ANALYTICS_CACHE), \
         patch("backend.data.loader.add_live_incident", return_value=None), \
         patch("backend.data.loader.get_corridor_counts", return_value={"ORR East 1": 2, "ORR West 1": 1}):

        mock_load.return_value = None

        # Import app AFTER patching loader so startup code uses mocks
        from backend.main import app
        from backend.routes import predict, nlp, anomaly, action_plan, feedback

        # Inject mock agents into route modules
        predict.init_prediction_agent(make_mock_prediction_agent())
        nlp.init_nlp_parser(make_mock_nlp_parser())
        anomaly.init_anomaly_detector(make_mock_anomaly_detector())
        action_plan.init_action_planner(make_mock_action_planner())

        yield app


@pytest.fixture(scope="session")
def client(app_with_mocks) -> TestClient:
    """Return a TestClient bound to the mocked app."""
    return TestClient(app_with_mocks, raise_server_exceptions=True)


@pytest.fixture()
def mock_prediction_agent():
    """Fresh mock prediction agent for test isolation."""
    return make_mock_prediction_agent()


@pytest.fixture()
def mock_nlp_parser():
    """Fresh mock NLP parser."""
    return make_mock_nlp_parser()


@pytest.fixture()
def mock_anomaly_detector():
    """Fresh mock anomaly detector."""
    return make_mock_anomaly_detector()


@pytest.fixture()
def mock_action_planner():
    """Fresh mock action planner."""
    return make_mock_action_planner()


@pytest.fixture()
def synthetic_df() -> pd.DataFrame:
    """Return a copy of the synthetic DataFrame for data-manipulation tests."""
    return SYNTHETIC_DF.copy()


@pytest.fixture()
def tmp_feedback_file(tmp_path) -> Path:
    """Provide a temporary feedback.jsonl path for feedback route tests."""
    return tmp_path / "feedback.jsonl"
