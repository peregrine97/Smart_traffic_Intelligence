"""
test_incidents.py — Tests for GET /incidents endpoint.

Covers:
- Returns 200 with correct structure
- Pagination fields present (total, page, page_size, incidents)
- Incident markers have required coordinate fields
- Filtering by zone, priority, event_type
- Filter combinations
- Page/page_size params
- Empty filter results
"""

import pytest


class TestIncidentsEndpoint:
    """Tests for GET /incidents."""

    def test_incidents_returns_200(self, client):
        """GET /incidents must return 200."""
        response = client.get("/incidents")
        assert response.status_code == 200

    def test_incidents_content_type_json(self, client):
        """Response must be application/json."""
        response = client.get("/incidents")
        assert "application/json" in response.headers["content-type"]

    def test_incidents_response_has_total(self, client):
        """Response must have 'total' field."""
        data = client.get("/incidents").json()
        assert "total" in data

    def test_incidents_response_has_page(self, client):
        """Response must have 'page' field."""
        data = client.get("/incidents").json()
        assert "page" in data

    def test_incidents_response_has_page_size(self, client):
        """Response must have 'page_size' field."""
        data = client.get("/incidents").json()
        assert "page_size" in data

    def test_incidents_response_has_incidents_list(self, client):
        """Response must have 'incidents' list."""
        data = client.get("/incidents").json()
        assert "incidents" in data
        assert isinstance(data["incidents"], list)

    def test_incidents_total_is_non_negative(self, client):
        """Total must be >= 0."""
        data = client.get("/incidents").json()
        assert data["total"] >= 0

    def test_incidents_page_default_is_1(self, client):
        """Default page should be 1."""
        data = client.get("/incidents").json()
        assert data["page"] == 1

    def test_incidents_page_size_default_200(self, client):
        """Default page_size should be 200."""
        data = client.get("/incidents").json()
        assert data["page_size"] == 200

    # ── Incident marker fields ────────────────────────────────────────────

    def test_incidents_markers_have_id(self, client):
        """Each incident marker must have 'id'."""
        data = client.get("/incidents").json()
        for inc in data["incidents"]:
            assert "id" in inc

    def test_incidents_markers_have_lat(self, client):
        """Each incident marker must have 'lat'."""
        data = client.get("/incidents").json()
        for inc in data["incidents"]:
            assert "lat" in inc

    def test_incidents_markers_have_lng(self, client):
        """Each incident marker must have 'lng'."""
        data = client.get("/incidents").json()
        for inc in data["incidents"]:
            assert "lng" in inc

    def test_incidents_lat_in_valid_range(self, client):
        """Latitudes must be in India's range."""
        data = client.get("/incidents").json()
        for inc in data["incidents"]:
            assert 7.0 <= inc["lat"] <= 37.0

    def test_incidents_lng_in_valid_range(self, client):
        """Longitudes must be in India's range."""
        data = client.get("/incidents").json()
        for inc in data["incidents"]:
            assert 68.0 <= inc["lng"] <= 97.0

    # ── Filtering ─────────────────────────────────────────────────────────

    def test_incidents_filter_by_priority_high(self, client):
        """Filter by priority=High — all returned incidents should be High."""
        data = client.get("/incidents?priority=High").json()
        for inc in data["incidents"]:
            if inc["priority"] is not None:
                assert inc["priority"].lower() == "high"

    def test_incidents_filter_by_priority_low(self, client):
        """Filter by priority=Low — all returned incidents should be Low."""
        data = client.get("/incidents?priority=Low").json()
        for inc in data["incidents"]:
            if inc["priority"] is not None:
                assert inc["priority"].lower() == "low"

    def test_incidents_filter_by_event_type_unplanned(self, client):
        """Filter by event_type=unplanned — all returned should be unplanned."""
        data = client.get("/incidents?event_type=unplanned").json()
        for inc in data["incidents"]:
            if inc["event_type"] is not None:
                assert inc["event_type"].lower() == "unplanned"

    def test_incidents_filter_by_event_type_planned(self, client):
        """Filter by event_type=planned — all returned should be planned."""
        data = client.get("/incidents?event_type=planned").json()
        for inc in data["incidents"]:
            if inc["event_type"] is not None:
                assert inc["event_type"].lower() == "planned"

    def test_incidents_filter_by_zone(self, client):
        """Filter by zone — all returned incidents should match zone."""
        data = client.get("/incidents?zone=Koramangala").json()
        for inc in data["incidents"]:
            if inc["zone"] is not None:
                assert inc["zone"].lower() == "koramangala"

    def test_incidents_nonexistent_zone_returns_empty(self, client):
        """Filter by a nonexistent zone should return 0 incidents."""
        data = client.get("/incidents?zone=xyzzy_nonexistent_zone_12345").json()
        assert data["total"] == 0
        assert data["incidents"] == []

    # ── Pagination ────────────────────────────────────────────────────────

    def test_incidents_custom_page_size(self, client):
        """Custom page_size should be respected."""
        data = client.get("/incidents?page_size=10").json()
        assert data["page_size"] == 10
        assert len(data["incidents"]) <= 10

    def test_incidents_page_2(self, client):
        """Page 2 should work without error."""
        response = client.get("/incidents?page=2&page_size=5")
        assert response.status_code == 200

    def test_incidents_invalid_page_zero_422(self, client):
        """page=0 should return 422 (ge=1 validation)."""
        response = client.get("/incidents?page=0")
        assert response.status_code == 422

    def test_incidents_page_size_above_max_422(self, client):
        """page_size > 1000 should return 422."""
        response = client.get("/incidents?page_size=9999")
        assert response.status_code == 422
