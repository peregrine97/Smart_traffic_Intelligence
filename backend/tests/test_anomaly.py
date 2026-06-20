"""
test_anomaly.py — Tests for GET /anomaly and POST /anomaly/replay endpoints.

Covers:
- GET /anomaly returns correct shape
- Zone entries have all required fields
- Alert levels are valid values
- Progress tracking fields present
- POST /anomaly/replay resets and returns zeroed state
- Handles empty cache with placeholder
"""

import pytest


REQUIRED_ZONE_FIELDS = {
    "zone", "alert_level", "incident_count",
    "high_priority_ratio", "mean_duration", "anomaly_score",
}

VALID_ALERT_LEVELS = {"Normal", "Watch", "Critical"}


class TestAnomalyEndpoint:
    """Tests for GET /anomaly."""

    def test_anomaly_returns_200(self, client):
        """GET /anomaly must return 200."""
        response = client.get("/anomaly")
        assert response.status_code == 200

    def test_anomaly_response_is_dict(self, client):
        """Response must be a JSON object (dict)."""
        response = client.get("/anomaly")
        assert isinstance(response.json(), dict)

    def test_anomaly_has_zones_key(self, client):
        """Response must have 'zones' key."""
        data = client.get("/anomaly").json()
        assert "zones" in data

    def test_anomaly_has_progress_key(self, client):
        """Response must have 'progress' key."""
        data = client.get("/anomaly").json()
        assert "progress" in data

    def test_anomaly_zones_is_list(self, client):
        """'zones' must be a list."""
        data = client.get("/anomaly").json()
        assert isinstance(data["zones"], list)

    def test_anomaly_progress_has_done(self, client):
        """Progress must have 'done' integer field."""
        data = client.get("/anomaly").json()
        assert "done" in data["progress"]
        assert isinstance(data["progress"]["done"], int)

    def test_anomaly_progress_has_total(self, client):
        """Progress must have 'total' integer field."""
        data = client.get("/anomaly").json()
        assert "total" in data["progress"]
        assert isinstance(data["progress"]["total"], int)

    def test_anomaly_progress_has_finished(self, client):
        """Progress must have 'finished' boolean field."""
        data = client.get("/anomaly").json()
        assert "finished" in data["progress"]
        assert isinstance(data["progress"]["finished"], bool)

    def test_anomaly_progress_done_non_negative(self, client):
        """Progress 'done' must be >= 0."""
        data = client.get("/anomaly").json()
        assert data["progress"]["done"] >= 0

    def test_anomaly_progress_total_non_negative(self, client):
        """Progress 'total' must be >= 0."""
        data = client.get("/anomaly").json()
        assert data["progress"]["total"] >= 0

    def test_anomaly_zones_have_required_fields(self, client):
        """Each zone entry must have all required fields."""
        data = client.get("/anomaly").json()
        for zone in data["zones"]:
            for field in REQUIRED_ZONE_FIELDS:
                assert field in zone, f"Zone missing field: {field}"

    def test_anomaly_zone_names_are_strings(self, client):
        """Zone names must be strings."""
        data = client.get("/anomaly").json()
        for zone in data["zones"]:
            assert isinstance(zone["zone"], str)

    def test_anomaly_alert_levels_are_valid(self, client):
        """Alert levels must be Normal, Watch, or Critical."""
        data = client.get("/anomaly").json()
        for zone in data["zones"]:
            assert zone["alert_level"] in VALID_ALERT_LEVELS

    def test_anomaly_incident_count_non_negative(self, client):
        """Incident counts must be >= 0."""
        data = client.get("/anomaly").json()
        for zone in data["zones"]:
            assert zone["incident_count"] >= 0

    def test_anomaly_high_priority_ratio_in_range(self, client):
        """High priority ratio must be 0.0–1.0."""
        data = client.get("/anomaly").json()
        for zone in data["zones"]:
            assert 0.0 <= zone["high_priority_ratio"] <= 1.0

    def test_anomaly_mean_duration_non_negative(self, client):
        """Mean duration must be >= 0."""
        data = client.get("/anomaly").json()
        for zone in data["zones"]:
            assert zone["mean_duration"] >= 0.0

    def test_anomaly_content_type_json(self, client):
        """Response Content-Type must be application/json."""
        response = client.get("/anomaly")
        assert "application/json" in response.headers["content-type"]


class TestAnomalyReplayEndpoint:
    """Tests for POST /anomaly/replay."""

    def test_replay_reset_returns_200(self, client):
        """POST /anomaly/replay must return 200."""
        response = client.post("/anomaly/replay")
        assert response.status_code == 200

    def test_replay_reset_returns_dict(self, client):
        """Reset response must be a JSON object."""
        response = client.post("/anomaly/replay")
        assert isinstance(response.json(), dict)

    def test_replay_reset_has_zones(self, client):
        """Reset response must have 'zones' key."""
        data = client.post("/anomaly/replay").json()
        assert "zones" in data

    def test_replay_reset_has_progress(self, client):
        """Reset response must have 'progress' key."""
        data = client.post("/anomaly/replay").json()
        assert "progress" in data

    def test_replay_reset_progress_done_is_zero(self, client):
        """Reset response 'done' must be 0."""
        data = client.post("/anomaly/replay").json()
        assert data["progress"]["done"] == 0

    def test_replay_reset_finished_is_false(self, client):
        """Reset response 'finished' must be False."""
        data = client.post("/anomaly/replay").json()
        assert data["progress"]["finished"] is False

    def test_replay_reset_zones_all_normal(self, client):
        """After reset all zones should show Normal alert level."""
        data = client.post("/anomaly/replay").json()
        for zone in data["zones"]:
            assert zone["alert_level"] == "Normal"

    def test_replay_reset_incident_counts_zeroed(self, client):
        """After reset all zones should have 0 incident_count."""
        data = client.post("/anomaly/replay").json()
        for zone in data["zones"]:
            assert zone["incident_count"] == 0

    def test_replay_idempotent(self, client):
        """Multiple resets should all return 200."""
        for _ in range(3):
            response = client.post("/anomaly/replay")
            assert response.status_code == 200
