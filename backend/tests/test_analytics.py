"""
test_analytics.py — Tests for GET /analytics endpoint.

Covers:
- Returns 200 with correct structure
- 4 required datasets present
- volume_grid is 7 rows × 24 columns
- top_junctions has required fields with coordinates
- corridor_durations has required fields
- planned_vs_unplanned has required fields
- 503 when cache is not ready
"""

import pytest
from unittest.mock import patch


class TestAnalyticsEndpoint:
    """Tests for GET /analytics."""

    def test_analytics_returns_200(self, client):
        """GET /analytics must return 200."""
        response = client.get("/analytics")
        assert response.status_code == 200

    def test_analytics_content_type_json(self, client):
        """Response must be application/json."""
        response = client.get("/analytics")
        assert "application/json" in response.headers["content-type"]

    def test_analytics_response_is_dict(self, client):
        """Response must be a JSON object."""
        data = client.get("/analytics").json()
        assert isinstance(data, dict)

    # ── Four required datasets ────────────────────────────────────────────

    def test_analytics_has_volume_grid(self, client):
        """Response must have 'volume_grid' key."""
        data = client.get("/analytics").json()
        assert "volume_grid" in data

    def test_analytics_has_top_junctions(self, client):
        """Response must have 'top_junctions' key."""
        data = client.get("/analytics").json()
        assert "top_junctions" in data

    def test_analytics_has_corridor_durations(self, client):
        """Response must have 'corridor_durations' key."""
        data = client.get("/analytics").json()
        assert "corridor_durations" in data

    def test_analytics_has_planned_vs_unplanned(self, client):
        """Response must have 'planned_vs_unplanned' key."""
        data = client.get("/analytics").json()
        assert "planned_vs_unplanned" in data

    # ── volume_grid shape ─────────────────────────────────────────────────

    def test_volume_grid_is_list(self, client):
        """volume_grid must be a list."""
        data = client.get("/analytics").json()
        assert isinstance(data["volume_grid"], list)

    def test_volume_grid_has_7_rows(self, client):
        """volume_grid must have 7 rows (one per day of week)."""
        data = client.get("/analytics").json()
        assert len(data["volume_grid"]) == 7

    def test_volume_grid_has_24_cols(self, client):
        """Each volume_grid row must have 24 columns (one per hour)."""
        data = client.get("/analytics").json()
        for row in data["volume_grid"]:
            assert len(row) == 24

    def test_volume_grid_values_are_numeric(self, client):
        """volume_grid values must be numeric."""
        data = client.get("/analytics").json()
        for row in data["volume_grid"]:
            for val in row:
                assert isinstance(val, (int, float))

    # ── top_junctions schema ──────────────────────────────────────────────

    def test_top_junctions_is_list(self, client):
        """top_junctions must be a list."""
        data = client.get("/analytics").json()
        assert isinstance(data["top_junctions"], list)

    def test_top_junctions_has_junction_field(self, client):
        """Each junction entry must have 'junction' field."""
        data = client.get("/analytics").json()
        for jct in data["top_junctions"]:
            assert "junction" in jct

    def test_top_junctions_has_count_field(self, client):
        """Each junction entry must have 'count' field."""
        data = client.get("/analytics").json()
        for jct in data["top_junctions"]:
            assert "count" in jct

    def test_top_junctions_has_lat(self, client):
        """Each junction entry must have 'lat' coordinate."""
        data = client.get("/analytics").json()
        for jct in data["top_junctions"]:
            assert "lat" in jct

    def test_top_junctions_has_lng(self, client):
        """Each junction entry must have 'lng' coordinate."""
        data = client.get("/analytics").json()
        for jct in data["top_junctions"]:
            assert "lng" in jct

    def test_top_junctions_lat_in_valid_range(self, client):
        """Junction latitudes must be in India's range."""
        data = client.get("/analytics").json()
        for jct in data["top_junctions"]:
            assert 7.0 <= jct["lat"] <= 37.0

    def test_top_junctions_lng_in_valid_range(self, client):
        """Junction longitudes must be in India's range."""
        data = client.get("/analytics").json()
        for jct in data["top_junctions"]:
            assert 68.0 <= jct["lng"] <= 97.0

    # ── corridor_durations schema ─────────────────────────────────────────

    def test_corridor_durations_is_list(self, client):
        """corridor_durations must be a list."""
        data = client.get("/analytics").json()
        assert isinstance(data["corridor_durations"], list)

    def test_corridor_durations_has_label(self, client):
        """Each corridor entry must have 'label' field."""
        data = client.get("/analytics").json()
        for entry in data["corridor_durations"]:
            assert "label" in entry

    def test_corridor_durations_has_median_minutes(self, client):
        """Each corridor entry must have 'median_minutes' field."""
        data = client.get("/analytics").json()
        for entry in data["corridor_durations"]:
            assert "median_minutes" in entry

    def test_corridor_durations_median_positive(self, client):
        """median_minutes must be positive."""
        data = client.get("/analytics").json()
        for entry in data["corridor_durations"]:
            assert entry["median_minutes"] > 0

    # ── planned_vs_unplanned schema ───────────────────────────────────────

    def test_planned_vs_unplanned_is_list(self, client):
        """planned_vs_unplanned must be a list."""
        data = client.get("/analytics").json()
        assert isinstance(data["planned_vs_unplanned"], list)

    def test_planned_vs_unplanned_has_month(self, client):
        """Each entry must have 'month' field."""
        data = client.get("/analytics").json()
        for entry in data["planned_vs_unplanned"]:
            assert "month" in entry

    def test_planned_vs_unplanned_has_planned(self, client):
        """Each entry must have 'planned' field."""
        data = client.get("/analytics").json()
        for entry in data["planned_vs_unplanned"]:
            assert "planned" in entry

    def test_planned_vs_unplanned_has_unplanned(self, client):
        """Each entry must have 'unplanned' field."""
        data = client.get("/analytics").json()
        for entry in data["planned_vs_unplanned"]:
            assert "unplanned" in entry

    # ── Error handling ────────────────────────────────────────────────────

    def test_analytics_503_when_cache_not_ready(self, client, app_with_mocks):
        """Should return 503 when the analytics cache raises RuntimeError."""
        from backend.routes import analytics as analytics_route
        with patch("backend.routes.analytics.get_analytics_cache") as mock_cache:
            mock_cache.side_effect = RuntimeError("Cache not ready")
            response = client.get("/analytics")
            assert response.status_code == 503
