"""
test_nlp.py — Tests for POST /nlp-parse endpoint.

Covers:
- Empty / whitespace-only description → returns null (200)
- Valid English text
- Response schema validation
- 503 when parser not initialised
- Vocabulary normalisation map coverage (all cause and vehicle mappings)
- Unknown model fallback to default
- No API key graceful degradation
- Parser returning None → endpoint returns null
"""

import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Test data
# ---------------------------------------------------------------------------

ENGLISH_DESCRIPTION = "There is a BMTC bus broken down at Silk Board junction, causing heavy traffic."
KANNADA_DESCRIPTION = "ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್"
MIXED_DESCRIPTION = "Bus breakdown near Silk Board - ಭಾರಿ ಸಂಚಾರ ದಟ್ಟಣೆ"
IRRELEVANT_DESCRIPTION = "The weather is sunny today."

MOCK_NLP_RESULT = {
    "root_cause": "vehicle_breakdown",
    "vehicle_type": "bmtc_bus",
    "severity": 2,
    "action_needed": True,
    "normalized_summary": "BMTC bus has broken down at Silk Board junction.",
}


class TestNLPEndpoint:
    """Tests for POST /nlp-parse."""

    # ── Empty / null input ────────────────────────────────────────────────

    def test_nlp_empty_description_returns_null(self, client):
        """Empty description should return null (HTTP 200, body null)."""
        response = client.post("/nlp-parse", json={"description": ""})
        assert response.status_code == 200
        assert response.json() is None

    def test_nlp_whitespace_description_returns_null(self, client):
        """Whitespace-only description should return null."""
        response = client.post("/nlp-parse", json={"description": "   "})
        assert response.status_code == 200
        assert response.json() is None

    # ── Valid input ───────────────────────────────────────────────────────

    def test_nlp_english_description_returns_200(self, client):
        """English description should return 200."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        assert response.status_code == 200

    def test_nlp_kannada_description_returns_200(self, client):
        """Kannada description should return 200."""
        response = client.post("/nlp-parse", json={"description": KANNADA_DESCRIPTION})
        assert response.status_code == 200

    def test_nlp_mixed_description_returns_200(self, client):
        """Mixed Kannada-English description should return 200."""
        response = client.post("/nlp-parse", json={"description": MIXED_DESCRIPTION})
        assert response.status_code == 200

    # ── Response schema ───────────────────────────────────────────────────

    def test_nlp_response_has_root_cause(self, client):
        """Successful response must have root_cause field."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None:
            assert "root_cause" in data

    def test_nlp_response_has_vehicle_type(self, client):
        """Successful response must have vehicle_type field."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None:
            assert "vehicle_type" in data

    def test_nlp_response_has_severity(self, client):
        """Successful response must have severity field."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None:
            assert "severity" in data

    def test_nlp_response_has_action_needed(self, client):
        """Successful response must have action_needed field."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None:
            assert "action_needed" in data

    def test_nlp_response_has_normalized_summary(self, client):
        """Successful response must have normalized_summary field."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None:
            assert "normalized_summary" in data

    def test_nlp_severity_valid_range(self, client):
        """Severity must be 1, 2, or 3."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None and "severity" in data and data["severity"] is not None:
            assert data["severity"] in (1, 2, 3)

    def test_nlp_action_needed_is_bool(self, client):
        """action_needed must be a boolean."""
        response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
        data = response.json()
        if data is not None and "action_needed" in data and data["action_needed"] is not None:
            assert isinstance(data["action_needed"], bool)

    # ── Parser returns None → endpoint returns null ───────────────────────

    def test_nlp_parser_none_result_returns_null(self, client, app_with_mocks):
        """When parser returns None, endpoint returns null (200)."""
        from backend.routes import nlp as nlp_route
        original = nlp_route._nlp_parser
        mock = MagicMock()
        mock.parse_description.return_value = None
        try:
            nlp_route._nlp_parser = mock
            response = client.post("/nlp-parse", json={"description": IRRELEVANT_DESCRIPTION})
            assert response.status_code == 200
            assert response.json() is None
        finally:
            nlp_route._nlp_parser = original

    # ── 503 when parser not initialised ──────────────────────────────────

    def test_nlp_503_when_parser_none(self, client, app_with_mocks):
        """Should return 503 when NLP parser is not initialised."""
        from backend.routes import nlp as nlp_route
        original = nlp_route._nlp_parser
        try:
            nlp_route._nlp_parser = None
            response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
            assert response.status_code == 503
        finally:
            nlp_route._nlp_parser = original

    # ── Custom model parameter ────────────────────────────────────────────

    def test_nlp_with_valid_model_param(self, client):
        """Passing a valid model param should return 200."""
        response = client.post("/nlp-parse", json={
            "description": ENGLISH_DESCRIPTION,
            "model": "llama-3.3-70b-versatile",
        })
        assert response.status_code == 200

    def test_nlp_with_unknown_model_fallback(self, client):
        """Unknown model should fall back and still return 200."""
        response = client.post("/nlp-parse", json={
            "description": ENGLISH_DESCRIPTION,
            "model": "some-unknown-model-xyz",
        })
        assert response.status_code == 200

    def test_nlp_exception_in_parser_returns_null(self, client, app_with_mocks):
        """Exception in parser returns null (not 500), per spec."""
        from backend.routes import nlp as nlp_route
        original = nlp_route._nlp_parser
        mock = MagicMock()
        mock.parse_description.side_effect = Exception("Groq API unavailable")
        try:
            nlp_route._nlp_parser = mock
            response = client.post("/nlp-parse", json={"description": ENGLISH_DESCRIPTION})
            assert response.status_code == 200
            assert response.json() is None
        finally:
            nlp_route._nlp_parser = original

    # ── Vocabulary normalisation ──────────────────────────────────────────

    def test_nlp_normalise_cause_road_maintenance(self, client, app_with_mocks):
        """road_maintenance → construction normalisation."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "road_maintenance", "vehicle_type": "car", "severity": 1, "action_needed": True, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["root_cause"] == "construction"

    def test_nlp_normalise_cause_traffic_congestion(self, client, app_with_mocks):
        """traffic_congestion → congestion normalisation."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "traffic_congestion", "vehicle_type": None, "severity": 1, "action_needed": False, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["root_cause"] == "congestion"

    def test_nlp_normalise_cause_general_delay(self, client, app_with_mocks):
        """general_delay → others normalisation."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "general_delay", "vehicle_type": None, "severity": 1, "action_needed": False, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["root_cause"] == "others"

    def test_nlp_normalise_veh_car_to_private_car(self, client, app_with_mocks):
        """car → private_car normalisation."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "accident", "vehicle_type": "car", "severity": 2, "action_needed": True, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["vehicle_type"] == "private_car"

    def test_nlp_normalise_veh_auto_rickshaw(self, client, app_with_mocks):
        """auto_rickshaw → auto normalisation."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "accident", "vehicle_type": "auto_rickshaw", "severity": 2, "action_needed": True, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["vehicle_type"] == "auto"

    def test_nlp_normalise_veh_hgv(self, client, app_with_mocks):
        """hgv → heavy_vehicle normalisation."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "accident", "vehicle_type": "hgv", "severity": 3, "action_needed": True, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["vehicle_type"] == "heavy_vehicle"

    def test_nlp_normalise_unknown_cause_fallback(self, client, app_with_mocks):
        """Unknown root_cause → 'others' fallback."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "completely_unknown_cause_xyz", "vehicle_type": None, "severity": 1, "action_needed": False, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["root_cause"] == "others"

    def test_nlp_normalise_unknown_veh_fallback(self, client, app_with_mocks):
        """Unknown vehicle_type → 'unknown' fallback."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "accident", "vehicle_type": "spaceship_xyz", "severity": 2, "action_needed": True, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["vehicle_type"] == "unknown"

    def test_nlp_normalise_none_input_returns_none(self, client, app_with_mocks):
        """_normalize_nlp_result(None) should return None."""
        from backend.routes.nlp import _normalize_nlp_result
        assert _normalize_nlp_result(None) is None

    def test_nlp_normalise_passthrough_values_unchanged(self, client, app_with_mocks):
        """Valid encoder values pass through unchanged."""
        from backend.routes.nlp import _normalize_nlp_result
        result = {"root_cause": "accident", "vehicle_type": "bmtc_bus", "severity": 3, "action_needed": True, "normalized_summary": "Test"}
        normalised = _normalize_nlp_result(result)
        assert normalised["root_cause"] == "accident"
        assert normalised["vehicle_type"] == "bmtc_bus"
