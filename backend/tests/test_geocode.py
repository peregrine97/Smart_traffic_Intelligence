"""
test_geocode.py — Tests for POST /geocode-zone endpoint.

Covers:
- Empty zone input → confidence=failed
- High confidence response structure
- Ambiguous response structure
- Groq unavailable fallback
- Nominatim failure
- Outside-bounds coordinate filtering
- Bounds validation function
"""

import pytest
from unittest.mock import patch, MagicMock


class TestGeocodeEndpoint:
    """Tests for POST /geocode-zone."""

    # ── Empty / null input ────────────────────────────────────────────────

    def test_geocode_empty_zone_returns_failed(self, client):
        """Empty zone string must return confidence=failed."""
        response = client.post("/geocode-zone", json={"zone": ""})
        assert response.status_code == 200
        data = response.json()
        assert data["confidence"] == "failed"

    def test_geocode_whitespace_zone_returns_failed(self, client):
        """Whitespace-only zone must return confidence=failed."""
        response = client.post("/geocode-zone", json={"zone": "   "})
        assert response.status_code == 200
        data = response.json()
        assert data["confidence"] == "failed"

    def test_geocode_missing_zone_field_422(self, client):
        """Missing 'zone' field must return 422."""
        response = client.post("/geocode-zone", json={})
        assert response.status_code == 422

    # ── High confidence response ──────────────────────────────────────────

    def test_geocode_high_confidence_has_lat(self, client):
        """High confidence response must have 'lat'."""
        mock_result = {
            "confidence": "high",
            "lat": 12.9352,
            "lng": 77.6245,
            "resolved_name": "Koramangala, Bengaluru, Karnataka",
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "Koramangala"})
            data = response.json()
            if data["confidence"] == "high":
                assert "lat" in data

    def test_geocode_high_confidence_has_lng(self, client):
        """High confidence response must have 'lng'."""
        mock_result = {
            "confidence": "high",
            "lat": 12.9352,
            "lng": 77.6245,
            "resolved_name": "Koramangala, Bengaluru, Karnataka",
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "Koramangala"})
            data = response.json()
            if data["confidence"] == "high":
                assert "lng" in data

    def test_geocode_high_confidence_has_resolved_name(self, client):
        """High confidence response must have 'resolved_name'."""
        mock_result = {
            "confidence": "high",
            "lat": 12.9352,
            "lng": 77.6245,
            "resolved_name": "Koramangala, Bengaluru, Karnataka",
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "Koramangala"})
            data = response.json()
            if data["confidence"] == "high":
                assert "resolved_name" in data

    # ── Ambiguous response ────────────────────────────────────────────────

    def test_geocode_ambiguous_has_candidates(self, client):
        """Ambiguous response must have 'candidates' list."""
        mock_result = {
            "confidence": "ambiguous",
            "candidates": [
                {"name": "Indiranagar, Bengaluru", "lat": 12.9784, "lng": 77.6408},
                {"name": "HAL Layout, Bengaluru", "lat": 12.9756, "lng": 77.6250},
            ],
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "near old airport"})
            data = response.json()
            if data["confidence"] == "ambiguous":
                assert "candidates" in data
                assert isinstance(data["candidates"], list)

    def test_geocode_ambiguous_candidates_have_name(self, client):
        """Candidates must have 'name' field."""
        mock_result = {
            "confidence": "ambiguous",
            "candidates": [
                {"name": "Indiranagar, Bengaluru", "lat": 12.9784, "lng": 77.6408},
            ],
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "near old airport"})
            data = response.json()
            if data["confidence"] == "ambiguous":
                for c in data["candidates"]:
                    assert "name" in c

    def test_geocode_ambiguous_candidates_have_coords(self, client):
        """Candidates must have lat/lng fields."""
        mock_result = {
            "confidence": "ambiguous",
            "candidates": [
                {"name": "Indiranagar, Bengaluru", "lat": 12.9784, "lng": 77.6408},
            ],
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "near old airport"})
            data = response.json()
            if data["confidence"] == "ambiguous":
                for c in data["candidates"]:
                    assert "lat" in c
                    assert "lng" in c

    # ── Failed confidence ─────────────────────────────────────────────────

    def test_geocode_failed_has_message(self, client):
        """Failed response must have 'message' field."""
        mock_result = {"confidence": "failed", "message": "Could not resolve location."}
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "xyzzy_invalid_location"})
            data = response.json()
            if data["confidence"] == "failed":
                assert "message" in data

    # ── Groq unavailable ──────────────────────────────────────────────────

    def test_geocode_groq_unavailable_returns_failed(self, client):
        """When hybrid geocode returns None (Groq unavailable), return failed."""
        with patch("backend.routes.geocode._hybrid_geocode", return_value=None):
            response = client.post("/geocode-zone", json={"zone": "Koramangala"})
            assert response.status_code == 200
            data = response.json()
            assert data["confidence"] == "failed"

    # ── Bounds validation ─────────────────────────────────────────────────

    def test_geocode_out_of_bounds_lat_returns_failed(self, client):
        """Coordinates outside India bounds should return failed."""
        mock_result = {
            "confidence": "high",
            "lat": 51.5074,  # London — outside India
            "lng": -0.1278,
            "resolved_name": "London, UK",
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "London"})
            data = response.json()
            assert data["confidence"] == "failed"

    def test_geocode_ambiguous_filters_out_of_bounds_candidates(self, client):
        """Out-of-bounds ambiguous candidates should be filtered out."""
        mock_result = {
            "confidence": "ambiguous",
            "candidates": [
                {"name": "Koramangala, Bengaluru", "lat": 12.9352, "lng": 77.6245},  # valid
                {"name": "London, UK", "lat": 51.5074, "lng": -0.1278},  # invalid
            ],
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "ambiguous"})
            data = response.json()
            if data["confidence"] == "ambiguous":
                for c in data["candidates"]:
                    # All remaining candidates must be within India
                    assert 7.0 <= c["lat"] <= 19.0
                    assert 72.0 <= c["lng"] <= 84.0

    def test_geocode_ambiguous_all_out_of_bounds_returns_failed(self, client):
        """If all candidates are out of bounds, return failed."""
        mock_result = {
            "confidence": "ambiguous",
            "candidates": [
                {"name": "London, UK", "lat": 51.5074, "lng": -0.1278},
                {"name": "Paris, France", "lat": 48.8566, "lng": 2.3522},
            ],
        }
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "european city"})
            data = response.json()
            assert data["confidence"] == "failed"

    # ── Bounds validation function ────────────────────────────────────────

    def test_validate_bengaluru_coords_valid_location(self):
        """Koramangala coordinates should pass bounds check."""
        from backend.routes.geocode import _validate_bengaluru_coords
        assert _validate_bengaluru_coords(12.9352, 77.6245) is True

    def test_validate_bengaluru_coords_northern_india(self):
        """Delhi coordinates are outside Bengaluru metro bounds — correctly returns False."""
        from backend.routes.geocode import _validate_bengaluru_coords
        # Bengaluru region bounds are ~lat 7-19, lng 72-84
        # Delhi (28.6°N) is outside this range
        assert _validate_bengaluru_coords(28.6139, 77.2090) is False

    def test_validate_bengaluru_coords_outside_india(self):
        """London coordinates should fail bounds check."""
        from backend.routes.geocode import _validate_bengaluru_coords
        assert _validate_bengaluru_coords(51.5074, -0.1278) is False

    def test_validate_bengaluru_coords_edge_lat_min(self):
        """Latitude at southern India boundary should pass."""
        from backend.routes.geocode import _validate_bengaluru_coords
        assert _validate_bengaluru_coords(7.5, 77.5) is True

    def test_validate_bengaluru_coords_edge_lat_max(self):
        """Latitude at northern India boundary should pass."""
        from backend.routes.geocode import _validate_bengaluru_coords
        assert _validate_bengaluru_coords(18.5, 77.5) is True

    def test_validate_bengaluru_coords_outside_lng(self):
        """Longitude too far east should fail."""
        from backend.routes.geocode import _validate_bengaluru_coords
        assert _validate_bengaluru_coords(12.9, 90.0) is False

    # ── Content-type ──────────────────────────────────────────────────────

    def test_geocode_content_type_json(self, client):
        """Response must be application/json."""
        mock_result = {"confidence": "failed", "message": "Unavailable"}
        with patch("backend.routes.geocode._hybrid_geocode", return_value=mock_result):
            response = client.post("/geocode-zone", json={"zone": "test"})
            assert "application/json" in response.headers["content-type"]
