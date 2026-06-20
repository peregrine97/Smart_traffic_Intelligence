"""
test_feedback.py — Tests for POST /feedback and GET /feedback endpoints.

Covers:
- POST with 'up' rating
- POST with 'down' rating
- Invalid rating rejected (422)
- GET returns list
- GET returns empty list when file not present
- GET skips malformed JSONL lines
- File write failure returns 500
- Full feedback entry structure after POST
"""

import json
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


VALID_FEEDBACK_PAYLOAD = {
    "incident_context": {
        "zone": "Koramangala",
        "event_cause": "vehicle_breakdown",
        "priority": "High",
    },
    "action_plan": "Officers: Deploy 4 at Silk Board.\nBarricades: 3 on ORR East 1.",
    "rating": "up",
}


class TestFeedbackPostEndpoint:
    """Tests for POST /feedback."""

    def test_feedback_up_returns_200(self, client, tmp_feedback_file):
        """POST with 'up' rating must return 200."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.post("/feedback", json={**VALID_FEEDBACK_PAYLOAD, "rating": "up"})
            assert response.status_code == 200

    def test_feedback_down_returns_200(self, client, tmp_feedback_file):
        """POST with 'down' rating must return 200."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.post("/feedback", json={**VALID_FEEDBACK_PAYLOAD, "rating": "down"})
            assert response.status_code == 200

    def test_feedback_up_response_status_ok(self, client, tmp_feedback_file):
        """POST response body must have status='ok'."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
            assert response.json()["status"] == "ok"

    def test_feedback_invalid_rating_422(self, client):
        """Invalid rating value must return 422 Unprocessable Entity."""
        response = client.post("/feedback", json={
            **VALID_FEEDBACK_PAYLOAD,
            "rating": "sideways",  # Not 'up' or 'down'
        })
        assert response.status_code == 422

    def test_feedback_missing_incident_context_422(self, client):
        """Missing incident_context must return 422."""
        response = client.post("/feedback", json={
            "action_plan": "Test plan",
            "rating": "up",
        })
        assert response.status_code == 422

    def test_feedback_missing_action_plan_422(self, client):
        """Missing action_plan must return 422."""
        response = client.post("/feedback", json={
            "incident_context": {"zone": "Koramangala"},
            "rating": "down",
        })
        assert response.status_code == 422

    def test_feedback_missing_rating_422(self, client):
        """Missing rating must return 422."""
        response = client.post("/feedback", json={
            "incident_context": {"zone": "Koramangala"},
            "action_plan": "Test plan",
        })
        assert response.status_code == 422

    def test_feedback_writes_to_file(self, client, tmp_feedback_file):
        """POST should append a JSONL line to the feedback file."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
            assert tmp_feedback_file.exists()
            lines = tmp_feedback_file.read_text(encoding="utf-8").strip().split("\n")
            assert len(lines) == 1
            entry = json.loads(lines[0])
            assert entry["rating"] == "up"

    def test_feedback_written_entry_has_timestamp(self, client, tmp_feedback_file):
        """Written entry must have an ISO timestamp."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
            entry = json.loads(tmp_feedback_file.read_text())
            assert "timestamp" in entry
            assert "T" in entry["timestamp"]

    def test_feedback_written_entry_has_incident_context(self, client, tmp_feedback_file):
        """Written entry must contain incident_context."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
            entry = json.loads(tmp_feedback_file.read_text())
            assert "incident_context" in entry
            assert entry["incident_context"]["zone"] == "Koramangala"

    def test_feedback_written_entry_has_action_plan(self, client, tmp_feedback_file):
        """Written entry must contain action_plan."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
            entry = json.loads(tmp_feedback_file.read_text())
            assert "action_plan" in entry

    def test_feedback_multiple_entries_appended(self, client, tmp_feedback_file):
        """Multiple POSTs should append multiple JSONL lines."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            client.post("/feedback", json={**VALID_FEEDBACK_PAYLOAD, "rating": "up"})
            client.post("/feedback", json={**VALID_FEEDBACK_PAYLOAD, "rating": "down"})
            lines = tmp_feedback_file.read_text(encoding="utf-8").strip().split("\n")
            assert len(lines) == 2

    def test_feedback_file_write_failure_returns_500(self, client, tmp_path):
        """OSError on write should return 500."""
        bad_path = tmp_path / "feedback.jsonl"
        with patch("backend.routes.feedback._FEEDBACK_PATH", bad_path):
            # Mock pathlib.Path.open to force an OSError
            with patch("pathlib.Path.open", side_effect=OSError("Permission denied")):
                response = client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
                assert response.status_code == 500

    def test_feedback_complex_incident_context(self, client, tmp_feedback_file):
        """Complex nested incident_context should be persisted correctly."""
        complex_payload = {
            "incident_context": {
                "zone": "Whitefield",
                "event_cause": "construction",
                "priority": "Low",
                "lat": 12.9715,
                "lng": 77.7499,
                "nlp_summary": "Road widening work blocking 2 lanes.",
                "nested": {"key": "value"},
            },
            "action_plan": "Officers: 2\nBarricades: 5",
            "rating": "down",
        }
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.post("/feedback", json=complex_payload)
            assert response.status_code == 200


class TestFeedbackGetEndpoint:
    """Tests for GET /feedback."""

    def test_feedback_get_no_file_returns_empty_list(self, client, tmp_path):
        """GET when file doesn't exist returns empty list."""
        nonexistent = tmp_path / "does_not_exist.jsonl"
        with patch("backend.routes.feedback._FEEDBACK_PATH", nonexistent):
            response = client.get("/feedback")
            assert response.status_code == 200
            assert response.json() == []

    def test_feedback_get_returns_list(self, client, tmp_feedback_file):
        """GET must return a JSON array."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.get("/feedback")
            assert isinstance(response.json(), list)

    def test_feedback_get_returns_posted_entries(self, client, tmp_feedback_file):
        """GET should return previously posted entries."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            client.post("/feedback", json=VALID_FEEDBACK_PAYLOAD)
            response = client.get("/feedback")
            entries = response.json()
            assert len(entries) == 1
            assert entries[0]["rating"] == "up"

    def test_feedback_get_skips_malformed_lines(self, client, tmp_feedback_file):
        """Malformed JSONL lines must be skipped silently."""
        tmp_feedback_file.write_text(
            '{"rating": "up", "timestamp": "2024-01-01T00:00:00"}\n'
            'this is not json at all\n'
            '{"rating": "down", "timestamp": "2024-01-02T00:00:00"}\n',
            encoding="utf-8"
        )
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.get("/feedback")
            assert response.status_code == 200
            entries = response.json()
            # Should return the 2 valid entries only
            assert len(entries) == 2

    def test_feedback_get_200_content_type(self, client, tmp_feedback_file):
        """GET must return application/json."""
        with patch("backend.routes.feedback._FEEDBACK_PATH", tmp_feedback_file):
            response = client.get("/feedback")
            assert "application/json" in response.headers["content-type"]
