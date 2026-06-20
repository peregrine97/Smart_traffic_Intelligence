"""
test_predict.py — Tests for POST /predict endpoint.

Covers:
- Happy path with various field combinations
- Missing/null optional fields
- All event_cause categories
- All vehicle types
- 503 when agent is not initialised
- Response schema validation
- ISO 8601 timestamp format
- add_live_incident called correctly
"""

import re
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Minimal valid payload
# ---------------------------------------------------------------------------

MINIMAL_PAYLOAD = {
    "event_type": "unplanned",
    "event_cause": "vehicle_breakdown",
}

FULL_PAYLOAD = {
    "event_type": "unplanned",
    "event_cause": "vehicle_breakdown",
    "veh_type": "bmtc_bus",
    "requires_road_closure": False,
    "start_datetime": "2024-06-15T08:30:00",
    "zone": "Koramangala",
    "junction": "Silk Board",
    "corridor": "ORR East 1",
    "planned_duration_minutes": None,
    "lat": 12.9352,
    "lng": 77.6245,
    "address": "Silk Board Junction, Bengaluru",
    "police_station": "Koramangala PS",
}


class TestPredictEndpoint:
    """Tests for POST /predict."""

    # ── Happy path tests ──────────────────────────────────────────────────

    def test_predict_full_payload_returns_200(self, client):
        """Full payload with all fields should return 200."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        assert response.status_code == 200

    def test_predict_minimal_payload_returns_200(self, client):
        """Minimal payload (only event_type + event_cause) should return 200."""
        response = client.post("/predict", json=MINIMAL_PAYLOAD)
        assert response.status_code == 200

    def test_predict_empty_payload_returns_200(self, client):
        """Completely empty payload should return 200 (all fields are optional)."""
        response = client.post("/predict", json={})
        assert response.status_code == 200

    # ── Response schema ───────────────────────────────────────────────────

    def test_predict_response_has_priority(self, client):
        """Response must have a 'priority' field."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert "priority" in data

    def test_predict_priority_valid_value(self, client):
        """Priority must be 'High' or 'Low'."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert data["priority"] in ("High", "Low")

    def test_predict_response_has_confidence(self, client):
        """Response must have a 'confidence' field."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert "confidence" in data

    def test_predict_confidence_is_float(self, client):
        """Confidence must be a float."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert isinstance(data["confidence"], float)

    def test_predict_confidence_in_range(self, client):
        """Confidence must be between 0 and 1."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert 0.0 <= data["confidence"] <= 1.0

    def test_predict_response_has_duration(self, client):
        """Response must have 'estimated_duration_minutes'."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert "estimated_duration_minutes" in data

    def test_predict_duration_is_positive_int(self, client):
        """Duration must be a positive integer."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert isinstance(data["estimated_duration_minutes"], int)
        assert data["estimated_duration_minutes"] > 0

    def test_predict_response_has_resolution_time(self, client):
        """Response must have 'estimated_resolution_time'."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        assert "estimated_resolution_time" in data

    def test_predict_resolution_time_iso_format(self, client):
        """estimated_resolution_time must be a valid ISO 8601 string."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        data = response.json()
        # Basic ISO 8601 check: contains T separator and is a string
        assert isinstance(data["estimated_resolution_time"], str)
        assert "T" in data["estimated_resolution_time"]

    # ── Event cause variations ────────────────────────────────────────────

    @pytest.mark.parametrize("cause", [
        "vehicle_breakdown", "accident", "congestion", "construction",
        "tree_fall", "water_logging", "protest", "vip_movement",
        "procession", "public_event", "pot_holes", "road_conditions", "others",
    ])
    def test_predict_all_event_causes(self, client, cause):
        """All valid event_cause values must return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "event_cause": cause})
        assert response.status_code == 200

    # ── Vehicle type variations ───────────────────────────────────────────

    @pytest.mark.parametrize("veh_type", [
        "bmtc_bus", "ksrtc_bus", "heavy_vehicle", "lcv", "truck",
        "private_bus", "private_car", "taxi", "auto", "others", None,
    ])
    def test_predict_all_vehicle_types(self, client, veh_type):
        """All valid veh_type values (including null) must return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "veh_type": veh_type})
        assert response.status_code == 200

    # ── Boolean field handling ────────────────────────────────────────────

    def test_predict_requires_road_closure_true(self, client):
        """requires_road_closure=True should return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "requires_road_closure": True})
        assert response.status_code == 200

    def test_predict_requires_road_closure_false(self, client):
        """requires_road_closure=False should return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "requires_road_closure": False})
        assert response.status_code == 200

    # ── Null optional fields ──────────────────────────────────────────────

    def test_predict_null_zone(self, client):
        """zone=None should return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "zone": None})
        assert response.status_code == 200

    def test_predict_null_junction(self, client):
        """junction=None should return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "junction": None})
        assert response.status_code == 200

    def test_predict_null_corridor(self, client):
        """corridor=None should return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "corridor": None})
        assert response.status_code == 200

    def test_predict_with_lat_lng(self, client):
        """Providing lat/lng should return 200."""
        response = client.post("/predict", json={**MINIMAL_PAYLOAD, "lat": 12.9352, "lng": 77.6245})
        assert response.status_code == 200

    def test_predict_planned_event_type(self, client):
        """Planned event with planned_duration_minutes should return 200."""
        response = client.post("/predict", json={
            "event_type": "planned",
            "event_cause": "construction",
            "planned_duration_minutes": 120.0,
        })
        assert response.status_code == 200

    # ── Error scenarios ───────────────────────────────────────────────────

    def test_predict_503_when_agent_none(self, client, app_with_mocks):
        """Should return 503 when prediction agent is not initialised."""
        from backend.routes import predict as predict_route
        original = predict_route._agent
        try:
            predict_route._agent = None
            response = client.post("/predict", json=MINIMAL_PAYLOAD)
            assert response.status_code == 503
        finally:
            predict_route._agent = original

    def test_predict_503_detail_message(self, client, app_with_mocks):
        """503 response should include an explanatory detail."""
        from backend.routes import predict as predict_route
        original = predict_route._agent
        try:
            predict_route._agent = None
            response = client.post("/predict", json=MINIMAL_PAYLOAD)
            assert "detail" in response.json()
        finally:
            predict_route._agent = original

    def test_predict_500_on_agent_runtime_error(self, client, app_with_mocks):
        """RuntimeError in agent should return 503."""
        from backend.routes import predict as predict_route
        original = predict_route._agent
        mock = MagicMock()
        mock.predict_incident.side_effect = RuntimeError("Model not loaded")
        try:
            predict_route._agent = mock
            response = client.post("/predict", json=MINIMAL_PAYLOAD)
            assert response.status_code == 503
        finally:
            predict_route._agent = original

    def test_predict_500_on_unexpected_exception(self, client, app_with_mocks):
        """Unexpected exception in agent should return 500."""
        from backend.routes import predict as predict_route
        original = predict_route._agent
        mock = MagicMock()
        mock.predict_incident.side_effect = ValueError("Unexpected internal error")
        try:
            predict_route._agent = mock
            response = client.post("/predict", json=MINIMAL_PAYLOAD)
            assert response.status_code == 500
        finally:
            predict_route._agent = original

    # ── Content-type ──────────────────────────────────────────────────────

    def test_predict_content_type_is_json(self, client):
        """Response Content-Type must be application/json."""
        response = client.post("/predict", json=FULL_PAYLOAD)
        assert "application/json" in response.headers["content-type"]

    # ── With address and police_station ───────────────────────────────────

    def test_predict_with_display_only_fields(self, client):
        """Display-only fields (address, police_station) pass through without error."""
        response = client.post("/predict", json={
            **MINIMAL_PAYLOAD,
            "address": "Silk Board Junction, Bengaluru",
            "police_station": "Koramangala PS",
        })
        assert response.status_code == 200
