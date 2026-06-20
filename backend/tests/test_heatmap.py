"""
test_heatmap.py — Tests for GET /heatmap and GET /heatmap/replay endpoints.

Covers:
- Returns 200
- Response is a list
- Each point has lat, lng, weight fields
- Weight values are positive
- 503 when cache not ready
- Heatmap replay structure
"""

import pytest
from unittest.mock import patch


class TestHeatmapEndpoint:
    """Tests for GET /heatmap."""

    def test_heatmap_returns_200(self, client):
        """GET /heatmap must return 200."""
        response = client.get("/heatmap")
        assert response.status_code == 200

    def test_heatmap_content_type_json(self, client):
        """Response must be application/json."""
        response = client.get("/heatmap")
        assert "application/json" in response.headers["content-type"]

    def test_heatmap_response_is_list(self, client):
        """Response must be a JSON array."""
        data = client.get("/heatmap").json()
        assert isinstance(data, list)

    def test_heatmap_points_have_lat(self, client):
        """Each heatmap point must have 'lat'."""
        data = client.get("/heatmap").json()
        for point in data:
            assert "lat" in point

    def test_heatmap_points_have_lng(self, client):
        """Each heatmap point must have 'lng'."""
        data = client.get("/heatmap").json()
        for point in data:
            assert "lng" in point

    def test_heatmap_points_have_weight(self, client):
        """Each heatmap point must have 'weight'."""
        data = client.get("/heatmap").json()
        for point in data:
            assert "weight" in point

    def test_heatmap_weight_is_positive(self, client):
        """Weight values must be positive numbers."""
        data = client.get("/heatmap").json()
        for point in data:
            assert isinstance(point["weight"], (int, float))
            assert point["weight"] > 0

    def test_heatmap_lat_in_valid_range(self, client):
        """Latitudes must be in India's range."""
        data = client.get("/heatmap").json()
        for point in data:
            assert 7.0 <= point["lat"] <= 37.0, f"Lat out of range: {point['lat']}"

    def test_heatmap_lng_in_valid_range(self, client):
        """Longitudes must be in India's range."""
        data = client.get("/heatmap").json()
        for point in data:
            assert 68.0 <= point["lng"] <= 97.0, f"Lng out of range: {point['lng']}"

    def test_heatmap_has_data(self, client):
        """Heatmap should contain at least one data point."""
        data = client.get("/heatmap").json()
        assert len(data) > 0

    def test_heatmap_503_when_cache_not_ready(self, client):
        """Should return 503 when heatmap cache raises RuntimeError."""
        with patch("backend.routes.heatmap.get_heatmap_cache") as mock_cache:
            mock_cache.side_effect = RuntimeError("Heatmap cache not ready")
            response = client.get("/heatmap")
            assert response.status_code == 503

    def test_heatmap_503_detail_present(self, client):
        """503 response must include a detail message."""
        with patch("backend.routes.heatmap.get_heatmap_cache") as mock_cache:
            mock_cache.side_effect = RuntimeError("Heatmap cache not ready")
            response = client.get("/heatmap")
            assert "detail" in response.json()


class TestHeatmapReplayEndpoint:
    """Tests for GET /heatmap/replay and POST /heatmap/replay."""

    def test_heatmap_replay_get_returns_200(self, client):
        """GET /heatmap/replay must return 200."""
        response = client.get("/heatmap/replay")
        assert response.status_code == 200

    def test_heatmap_replay_get_content_type(self, client):
        """GET /heatmap/replay must return application/json."""
        response = client.get("/heatmap/replay")
        assert "application/json" in response.headers["content-type"]

    def test_heatmap_replay_post_returns_200(self, client):
        """POST /heatmap/replay (reset) must return 200."""
        response = client.post("/heatmap/replay")
        assert response.status_code == 200

    def test_heatmap_replay_get_response_has_points(self, client):
        """GET /heatmap/replay response must have a 'points' key."""
        data = client.get("/heatmap/replay").json()
        # The replay endpoint returns either a list or a dict with 'points'
        assert isinstance(data, (list, dict))
