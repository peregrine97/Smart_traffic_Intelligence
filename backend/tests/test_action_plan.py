"""
test_action_plan.py — Tests for POST /action-plan (SSE streaming) endpoint.

Covers:
- Returns 200 with text/event-stream Content-Type
- Stream contains SSE data: lines
- Stream contains [DONE] sentinel
- 503 when agent not initialised
- All optional fields with defaults
- Zone alert framing
- Planned event framing
"""

import pytest
from unittest.mock import MagicMock, AsyncMock


FULL_ACTION_PLAN_BODY = {
    "event_type": "unplanned",
    "event_cause": "vehicle_breakdown",
    "address": "Silk Board Junction, Bengaluru",
    "junction": "Silk Board",
    "corridor": "ORR East 1",
    "police_station": "Koramangala PS",
    "zone": "Koramangala",
    "priority": "High",
    "confidence": 0.85,
    "estimated_duration_minutes": 75,
    "requires_road_closure": False,
    "nlp_cause": "vehicle_breakdown",
    "nlp_summary": "BMTC bus has broken down at Silk Board junction.",
    "is_zone_alert": False,
    "model": None,
}

MINIMAL_BODY = {}


class TestActionPlanEndpoint:
    """Tests for POST /action-plan (SSE streaming)."""

    def test_action_plan_returns_200(self, client):
        """POST /action-plan must return 200."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        assert response.status_code == 200

    def test_action_plan_content_type_event_stream(self, client):
        """Response must have text/event-stream Content-Type."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        assert "text/event-stream" in response.headers["content-type"]

    def test_action_plan_contains_sse_data_lines(self, client):
        """Response body must contain SSE 'data:' lines."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        content = response.text
        assert "data:" in content

    def test_action_plan_contains_done_sentinel(self, client):
        """Response must contain [DONE] sentinel to signal stream end."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        content = response.text
        assert "[DONE]" in content

    def test_action_plan_minimal_body_200(self, client):
        """Empty body should still return 200 (all fields have defaults)."""
        response = client.post("/action-plan", json=MINIMAL_BODY)
        assert response.status_code == 200

    def test_action_plan_has_officers_section(self, client):
        """Streamed plan should contain 'Officers:' section."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        assert "Officers" in response.text

    def test_action_plan_has_barricades_section(self, client):
        """Streamed plan should contain 'Barricades:' section."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        assert "Barricades" in response.text

    def test_action_plan_has_diversion_section(self, client):
        """Streamed plan should contain 'Diversion:' section."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        assert "Diversion" in response.text

    def test_action_plan_503_when_agent_none(self, client, app_with_mocks):
        """Should return 503 when action planner is not initialised."""
        from backend.routes import action_plan as action_plan_route
        original = action_plan_route._agent
        try:
            action_plan_route._agent = None
            response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
            assert response.status_code == 503
        finally:
            action_plan_route._agent = original

    def test_action_plan_zone_alert_framing(self, client):
        """Zone alert requests should return 200 with SSE stream."""
        body = {
            **FULL_ACTION_PLAN_BODY,
            "is_zone_alert": True,
            "zone": "Whitefield",
        }
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200
        assert "data:" in response.text

    def test_action_plan_planned_event_type(self, client):
        """Planned event type should return 200 with SSE stream."""
        body = {
            **FULL_ACTION_PLAN_BODY,
            "event_type": "planned",
            "event_cause": "public_event",
        }
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200

    def test_action_plan_with_specific_model(self, client):
        """Specifying a valid model should return 200."""
        body = {
            **FULL_ACTION_PLAN_BODY,
            "model": "llama-3.3-70b-versatile",
        }
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200

    def test_action_plan_with_unknown_model_falls_back(self, client):
        """Unknown model should fall back to default and return 200."""
        body = {
            **FULL_ACTION_PLAN_BODY,
            "model": "some-unknown-model-xyz",
        }
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200

    def test_action_plan_cache_control_header(self, client):
        """Response must have Cache-Control: no-cache header for SSE."""
        response = client.post("/action-plan", json=FULL_ACTION_PLAN_BODY)
        assert response.headers.get("cache-control") == "no-cache"

    @pytest.mark.parametrize("event_cause", [
        "vehicle_breakdown", "accident", "congestion", "construction",
        "tree_fall", "protest", "vip_movement", "water_logging",
    ])
    def test_action_plan_various_event_causes(self, client, event_cause):
        """All event causes should produce valid SSE streams."""
        body = {**FULL_ACTION_PLAN_BODY, "event_cause": event_cause}
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200
        assert "data:" in response.text

    def test_action_plan_high_confidence_float(self, client):
        """Confidence as a float should work correctly."""
        body = {**FULL_ACTION_PLAN_BODY, "confidence": 0.9512}
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200

    def test_action_plan_confidence_as_string(self, client):
        """Confidence as a string (from legacy callers) should work."""
        body = {**FULL_ACTION_PLAN_BODY, "confidence": "0.75"}
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200

    def test_action_plan_duration_as_string(self, client):
        """estimated_duration_minutes as a string should work."""
        body = {**FULL_ACTION_PLAN_BODY, "estimated_duration_minutes": "90"}
        response = client.post("/action-plan", json=body)
        assert response.status_code == 200
