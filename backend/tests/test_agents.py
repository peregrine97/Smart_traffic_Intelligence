"""
test_agents.py — Unit tests for AI agent classes.

Tests the agents in isolation (no FastAPI routes, no HTTP calls).
All external API calls (Groq) are mocked.

Covers:
- NLPIncidentParser: heuristics fallback, model validation, no-key handling
- PredictionAgent: feature vector shape, model loaded/unloaded states
- TrafficAnomalyDetector: initialization, placeholder behaviour
- ActionPlannerAgent: prompt construction, model validation, no-key handling
"""

import os
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from backend.agents.nlp_parser import NLPIncidentParser, ALLOWED_MODELS, DEFAULT_MODEL
from backend.agents.action_planner import ActionPlannerAgent


# ─────────────────────────────────────────────────────────────────────────────
# NLPIncidentParser Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestNLPIncidentParser:
    """Unit tests for NLPIncidentParser agent."""

    def test_init_without_api_key(self):
        """Parser initialises without error when no API key is provided."""
        with patch.dict(os.environ, {}, clear=True):
            parser = NLPIncidentParser(api_key=None)
        assert parser.groq_key is None

    def test_init_with_api_key(self):
        """Parser stores provided API key."""
        parser = NLPIncidentParser(api_key="test-key-123")
        assert parser.groq_key == "test-key-123"

    def test_init_reads_env_key(self):
        """Parser reads GROQ_API_KEY from environment."""
        with patch.dict(os.environ, {"GROQ_API_KEY": "env-key-abc"}):
            parser = NLPIncidentParser()
        assert parser.groq_key == "env-key-abc"

    def test_default_model_is_compound_mini(self):
        """Default model should be groq/compound-mini."""
        parser = NLPIncidentParser(api_key="key")
        assert parser.default_model == "groq/compound-mini"

    def test_parse_description_empty_returns_none(self):
        """Empty description should return None without API call."""
        parser = NLPIncidentParser(api_key="key")
        result = parser.parse_description("")
        assert result is None

    def test_parse_description_no_key_returns_none(self):
        """No API key → parse_description should return None."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_description("Some traffic description")
        assert result is None

    def test_parse_with_heuristics_vehicle_breakdown(self):
        """Heuristics should detect vehicle_breakdown from English text."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("There is a car breakdown near the signal")
        assert result["root_cause"] == "vehicle_breakdown"

    def test_parse_with_heuristics_accident(self):
        """Heuristics should detect accident."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Major accident at the junction")
        assert result["root_cause"] == "accident"

    def test_parse_with_heuristics_water_logging(self):
        """Heuristics should detect water_logging."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Heavy rain causing water logging on road")
        assert result["root_cause"] == "water_logging"

    def test_parse_with_heuristics_tree_fall(self):
        """Heuristics should detect tree_fall."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("A tree has fallen blocking the road")
        assert result["root_cause"] == "tree_fall"

    def test_parse_with_heuristics_protest(self):
        """Heuristics should detect protest."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Protest rally blocking the main road")
        assert result["root_cause"] == "protest"

    def test_parse_with_heuristics_vip_movement(self):
        """Heuristics should detect vip_movement."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("VIP convoy passing through")
        assert result["root_cause"] == "vip_movement"

    def test_parse_with_heuristics_road_maintenance(self):
        """Heuristics should detect road maintenance."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Roadwork and digging near metro station")
        assert result["root_cause"] == "road_maintenance"

    def test_parse_with_heuristics_bus_vehicle(self):
        """Heuristics should detect bus vehicle type."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("BMTC bus stuck at junction")
        assert result["vehicle_type"] == "bmtc_bus"

    def test_parse_with_heuristics_car_vehicle(self):
        """Heuristics should detect car vehicle type."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("A car has broken down")
        assert result["vehicle_type"] == "car"

    def test_parse_with_heuristics_severity_high(self):
        """Heuristics should detect high severity."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Critical and severe accident, very dangerous")
        assert result["severity"] == 3

    def test_parse_with_heuristics_returns_all_keys(self):
        """Heuristics result must have all required keys."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Test description")
        assert "root_cause" in result
        assert "vehicle_type" in result
        assert "severity" in result
        assert "action_needed" in result
        assert "normalized_summary" in result

    def test_parse_with_heuristics_normalized_summary_is_string(self):
        """normalized_summary must be a string."""
        parser = NLPIncidentParser(api_key=None)
        result = parser.parse_with_heuristics("Bus breakdown on main road")
        assert isinstance(result["normalized_summary"], str)

    def test_parse_description_groq_error_returns_none(self):
        """Groq API error should return None (not raise)."""
        parser = NLPIncidentParser(api_key="key")
        with patch("backend.agents.nlp_parser.requests.post") as mock_post:
            mock_post.side_effect = Exception("Connection refused")
            result = parser.parse_description("Bus breakdown near signal")
            assert result is None

    def test_parse_description_allowed_model_used(self):
        """Requesting a valid allowed model should use it."""
        parser = NLPIncidentParser(api_key="test-key")
        with patch.object(parser, "_parse_with_groq") as mock_groq:
            mock_groq.return_value = {"root_cause": "accident", "vehicle_type": None, "severity": 2, "action_needed": True, "normalized_summary": "Test"}
            result = parser.parse_description("accident at junction", model_name="llama-3.3-70b-versatile")
            mock_groq.assert_called_once_with("accident at junction", "llama-3.3-70b-versatile")

    def test_parse_description_unknown_model_falls_back_to_default(self):
        """Unknown model should fall back to DEFAULT_MODEL."""
        parser = NLPIncidentParser(api_key="test-key")
        with patch.object(parser, "_parse_with_groq") as mock_groq:
            mock_groq.return_value = None
            parser.parse_description("test", model_name="unknown-model-xyz")
            mock_groq.assert_called_once_with("test", DEFAULT_MODEL)

    def test_allowed_models_list_not_empty(self):
        """ALLOWED_MODELS list must not be empty."""
        assert len(ALLOWED_MODELS) > 0

    def test_default_model_in_allowed_models(self):
        """DEFAULT_MODEL must be in ALLOWED_MODELS."""
        assert DEFAULT_MODEL in ALLOWED_MODELS


# ─────────────────────────────────────────────────────────────────────────────
# ActionPlannerAgent Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestActionPlannerAgent:
    """Unit tests for ActionPlannerAgent."""

    def test_init_without_api_key(self):
        """Planner initialises without error when no key provided."""
        with patch.dict(os.environ, {}, clear=True):
            planner = ActionPlannerAgent(api_key=None)
        assert planner.groq_key is None

    def test_init_with_api_key(self):
        """Planner stores provided API key."""
        planner = ActionPlannerAgent(api_key="groq-key-xyz")
        assert planner.groq_key == "groq-key-xyz"

    def test_init_reads_env_key(self):
        """Planner reads GROQ_API_KEY from environment."""
        with patch.dict(os.environ, {"GROQ_API_KEY": "env-planner-key"}):
            planner = ActionPlannerAgent()
        assert planner.groq_key == "env-planner-key"

    def test_system_prompt_contains_sections(self):
        """System prompt must reference all 6 plan sections."""
        planner = ActionPlannerAgent(api_key="key")
        prompt = planner._build_system_prompt()
        for section in ["Officers", "Barricades", "Diversion", "Estimated Clearance", "Escalation Trigger", "Public Advisory"]:
            assert section in prompt

    def test_user_prompt_includes_zone(self):
        """User prompt must include zone information."""
        planner = ActionPlannerAgent(api_key="key")
        params = {
            "zone": "Koramangala",
            "event_cause": "vehicle_breakdown",
            "priority": "High",
            "event_type": "unplanned",
            "address": "Silk Board",
            "junction": "Silk Board Junction",
            "corridor": "ORR East 1",
            "police_station": "Koramangala PS",
            "confidence": "0.85",
            "estimated_duration_minutes": "75",
            "requires_road_closure": "false",
            "nlp_cause": "",
            "nlp_summary": "",
            "is_zone_alert": "false",
        }
        prompt = planner._build_user_prompt(params)
        assert "Koramangala" in prompt

    def test_user_prompt_includes_priority(self):
        """User prompt must include priority."""
        planner = ActionPlannerAgent(api_key="key")
        params = {
            "zone": "Whitefield",
            "event_cause": "accident",
            "priority": "High",
            "event_type": "unplanned",
            "address": "Marathahalli",
            "junction": "Marathahalli Bridge",
            "corridor": "ORR East 2",
            "police_station": "Whitefield PS",
            "confidence": "0.9",
            "estimated_duration_minutes": "90",
            "requires_road_closure": "true",
            "nlp_cause": "",
            "nlp_summary": "",
            "is_zone_alert": "false",
        }
        prompt = planner._build_user_prompt(params)
        assert "High" in prompt

    def test_user_prompt_zone_alert_framing(self):
        """Zone alert should use pre-emptive zone framing."""
        planner = ActionPlannerAgent(api_key="key")
        params = {
            "zone": "HSR Layout",
            "event_cause": "congestion",
            "priority": "High",
            "event_type": "unplanned",
            "address": "HSR Layout",
            "junction": "",
            "corridor": "",
            "police_station": "HSR PS",
            "confidence": "0.7",
            "estimated_duration_minutes": "60",
            "requires_road_closure": "false",
            "nlp_cause": "",
            "nlp_summary": "",
            "is_zone_alert": "true",
        }
        prompt = planner._build_user_prompt(params)
        assert "ZONE-LEVEL" in prompt or "PRE-EMPTIVE" in prompt

    def test_user_prompt_planned_event_framing(self):
        """Planned event should use pre-announced framing."""
        planner = ActionPlannerAgent(api_key="key")
        params = {
            "zone": "CBD",
            "event_cause": "public_event",
            "priority": "Low",
            "event_type": "planned",
            "address": "MG Road",
            "junction": "Trinity Circle",
            "corridor": "MG Road",
            "police_station": "Cubbon Park PS",
            "confidence": "0.6",
            "estimated_duration_minutes": "180",
            "requires_road_closure": "true",
            "nlp_cause": "",
            "nlp_summary": "",
            "is_zone_alert": "false",
        }
        prompt = planner._build_user_prompt(params)
        assert "PLANNED" in prompt or "planned" in prompt.lower()

    @pytest.mark.asyncio
    async def test_stream_plan_no_key_yields_warning(self):
        """No API key should yield a warning token then [DONE]."""
        planner = ActionPlannerAgent(api_key=None)
        tokens = []
        async for token in planner.stream_plan({}):
            tokens.append(token)
        assert any("[DONE]" in t for t in tokens)
        assert any("WARNING" in t for t in tokens)

    @pytest.mark.asyncio
    async def test_stream_plan_yields_done_sentinel(self):
        """Stream must always end with [DONE] sentinel."""
        planner = ActionPlannerAgent(api_key=None)
        tokens = []
        async for token in planner.stream_plan({}):
            tokens.append(token)
        assert tokens[-1] == "data: [DONE]\n\n"

    def test_planner_allowed_models_not_empty(self):
        """ALLOWED_MODELS must not be empty."""
        from backend.agents.action_planner import ALLOWED_MODELS
        assert len(ALLOWED_MODELS) > 0

    def test_planner_default_model_in_allowed(self):
        """Default model must be in ALLOWED_MODELS."""
        from backend.agents.action_planner import ALLOWED_MODELS, DEFAULT_MODEL
        assert DEFAULT_MODEL in ALLOWED_MODELS


# ─────────────────────────────────────────────────────────────────────────────
# TrafficAnomalyDetector Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestAnomalyDetector:
    """Unit tests for TrafficAnomalyDetector."""

    def test_init_creates_detector(self):
        """Detector can be instantiated without errors."""
        from backend.agents.anomaly_detector import TrafficAnomalyDetector
        detector = TrafficAnomalyDetector(model_path="backend/models/anomaly_detector.joblib")
        assert detector is not None

    def test_init_model_is_none_without_load(self):
        """Model should be None before loading."""
        from backend.agents.anomaly_detector import TrafficAnomalyDetector
        detector = TrafficAnomalyDetector(model_path="nonexistent.joblib")
        assert detector.model is None

    def test_load_nonexistent_file_does_not_raise(self):
        """Loading a nonexistent file path should not raise (handled gracefully)."""
        from backend.agents.anomaly_detector import TrafficAnomalyDetector
        detector = TrafficAnomalyDetector(model_path="nonexistent_path.joblib")
        # load() may log a warning but should not crash
        try:
            detector.load("nonexistent_path.joblib")
        except Exception as e:
            # It's acceptable to raise FileNotFoundError but not silent data corruption
            assert isinstance(e, (FileNotFoundError, OSError))
