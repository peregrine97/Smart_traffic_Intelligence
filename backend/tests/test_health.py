"""
test_health.py — Tests for GET /health endpoint.

Tests:
1.  Returns HTTP 200
2.  Response body has correct "status" field
3.  Response body has correct "service" field
4.  Response body has correct "version" field
5.  Response Content-Type is application/json
"""

import pytest


class TestHealthEndpoint:
    """Tests for the /health liveness probe."""

    def test_health_returns_200(self, client):
        """Health endpoint must return HTTP 200 OK."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_status_ok(self, client):
        """Response body must have status='ok'."""
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "ok"

    def test_health_service_name(self, client):
        """Response body must include the service name."""
        response = client.get("/health")
        data = response.json()
        assert "service" in data
        assert "Smart Traffic Intelligence" in data["service"]

    def test_health_version_present(self, client):
        """Response body must include a version string."""
        response = client.get("/health")
        data = response.json()
        assert "version" in data
        assert isinstance(data["version"], str)
        assert len(data["version"]) > 0

    def test_health_content_type_json(self, client):
        """Health endpoint must respond with application/json."""
        response = client.get("/health")
        assert "application/json" in response.headers["content-type"]
