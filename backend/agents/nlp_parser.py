import os
import json
import logging
import re
from typing import Dict, Any, Optional
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

from backend.utils.security import sanitize_url

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowed LLM models for Agent 1 (NLP Parser) — all routed via Groq API
# ---------------------------------------------------------------------------
ALLOWED_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "deepseek-r1-distill-llama-70b",
    "qwen-2.5-32b",
]
DEFAULT_MODEL = "llama-3.1-8b-instant"



class NLPIncidentParser:
    """
    Agent 1: NLP Description Parser.
    Extracts structured fields from free-text descriptions (in any language like English,
    Kannada, or mixed) and maps them to our traffic dataset vocabulary.
    Supports Google Gemini (default/preferred) and regex heuristics fallback.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        # Look for Groq API key
        self.groq_key = api_key or os.environ.get("GROQ_API_KEY")
        self.default_model = DEFAULT_MODEL
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

        if self.groq_key:
            logger.info(
                "[Agent 1 - NLP Parser] Initialised. Default model: %s",
                self.default_model,
            )
        else:
            logger.warning("[Agent 1 - NLP Parser] No Groq API key found. Parser will return None.")

    def _get_system_prompt(self) -> str:
        return """You are a structured extraction agent for Bengaluru traffic incidents.
Your task is to analyze free-text traffic descriptions (which could be in Kannada, English, mixed/Kannada-English code-mixed, or transliterated Kannada) and extract structural fields mapping to our dataset's vocabulary.

Allowed values for 'root_cause':
- "vehicle_breakdown"
- "accident"
- "road_maintenance"
- "water_logging"
- "tree_fall"
- "protest"
- "traffic_congestion"
- "vip_movement"
- "unplanned_utility_work"
- "general_delay"

Allowed values for 'vehicle_type':
- "bmtc_bus"
- "car"
- "two_wheeler"
- "auto_rickshaw"
- "hgv" (heavy goods vehicle like trucks/lorries)
- "lcv" (light commercial vehicle like tempos)
- "ambulance"
- null (when no specific vehicle type is involved or mentioned)

Allowed values for 'severity':
- 1 (low)
- 2 (medium)
- 3 (high)

Allowed values for 'action_needed':
- true
- false

'normalized_summary': A short, concise one-sentence summary of the incident in English.

You MUST respond with a valid JSON object ONLY. Do not include any markdown formatting like ```json or ```, no preamble, and no explanation. Return just raw JSON.
If you cannot parse the incident or if the text is completely irrelevant to traffic, return the JSON value: null.
"""

    def parse_with_heuristics(self, description: str) -> Dict[str, Any]:
        """
        Regex and keyword-based heuristic fallback if the LLM cannot be reached.
        Supports common English and Kannada keywords.
        """
        desc_lower = description.lower()
        
        # Determine root cause
        root_cause = "general_delay"
        if any(w in desc_lower for w in ["accident", "accidents", "collision", "hit", "ಅಪಘಾತ", "ಡಿಕ್ಕಿ"]):
            root_cause = "accident"
        elif any(w in desc_lower for w in ["breakdown", "break down", "puncture", "repair", "ಕೆಟ್ಟು", "ಕೆಲಸ", "ಪಂಚರ್"]):
            root_cause = "vehicle_breakdown"
        elif any(w in desc_lower for w in ["water", "rain", "flood", "clog", "puddle", "ನೀರು", "ಮಳೆ"]):
            root_cause = "water_logging"
        elif any(w in desc_lower for w in ["tree", "branch", "fall", "ಬಿದ್ದಿದೆ", "ಮರ"]):
            root_cause = "tree_fall"
        elif any(w in desc_lower for w in ["protest", "strike", "rally", "dharna", "procession", "ಪ್ರತಿಭಟನೆ", "ಮುಷ್ಕರ"]):
            root_cause = "protest"
        elif any(w in desc_lower for w in ["vip", "minister", "convoy", "ವಿಐಪಿ"]):
            root_cause = "vip_movement"
        elif any(w in desc_lower for w in ["work", "digging", "roadwork", "utility", "ಮೆಟ್ರೋ", "ರಸ್ತೆ ಕೆಲಸ"]):
            root_cause = "road_maintenance"

        # Determine vehicle type
        vehicle_type = None
        if any(w in desc_lower for w in ["bus", "bmtc", "ಬಸ್"]):
            vehicle_type = "bmtc_bus"
        elif any(w in desc_lower for w in ["car", "cab", "taxi", "ಕಾರು"]):
            vehicle_type = "car"
        elif any(w in desc_lower for w in ["bike", "scooter", "two wheeler", "cycle", "ಬೈಕ್", "ದ್ವಿಚಕ್ರ"]):
            vehicle_type = "two_wheeler"
        elif any(w in desc_lower for w in ["auto", "rickshaw", "ಆಟೋ"]):
            vehicle_type = "auto_rickshaw"
        elif any(w in desc_lower for w in ["truck", "lorry", "hgv", "container", "ಲಾರಿ"]):
            vehicle_type = "hgv"
        elif any(w in desc_lower for w in ["tempo", "lcv", "van"]):
            vehicle_type = "lcv"
        elif any(w in desc_lower for w in ["ambulance", "hospital", "ಆಂಬ್ಯುಲೆನ್ಸ್"]):
            vehicle_type = "ambulance"

        # Determine severity
        severity = 1
        if any(w in desc_lower for w in ["severe", "critical", "heavy", "deadly", "danger", "ತುಂಬಾ", "ಅಪಾಯ", "ಬಹಳ"]):
            severity = 3
        elif any(w in desc_lower for w in ["medium", "slow", "delay", "ಬ್ಲಾಕ್", "ನಿಧಾನ"]):
            severity = 2

        action_needed = True if root_cause != "general_delay" or severity >= 2 else False

        # Generate English summary
        summary = f"Traffic event ({root_cause.replace('_', ' ')}) reported in Bengaluru."
        if vehicle_type:
            summary = f"Incident involving {vehicle_type.replace('_', ' ')}: {root_cause.replace('_', ' ')}."
            
        return {
            "root_cause": root_cause,
            "vehicle_type": vehicle_type,
            "severity": severity,
            "action_needed": action_needed,
            "normalized_summary": summary
        }

    def _parse_with_groq(self, description: str, model_name: str) -> Optional[Dict[str, Any]]:
        """
        Internal helper to parse description using Groq chat-completions REST API.
        Uses the provided model_name for this specific API call.
        """
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.groq_key}",
        }
        few_shot_user_1 = "ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್"
        few_shot_assistant_1 = json.dumps({
            "root_cause": "vehicle_breakdown",
            "vehicle_type": "bmtc_bus",
            "severity": 2,
            "action_needed": True,
            "normalized_summary": "BMTC bus has broken down at the reported location."
        })
        few_shot_user_2 = "there was a murder in the alleyway"
        few_shot_assistant_2 = "null"
        
        payload = {
            "model": model_name,
            "temperature": 0.0,
            "messages": [
                {"role": "system",    "content": self._get_system_prompt()},
                {"role": "user",      "content": few_shot_user_1},
                {"role": "assistant", "content": few_shot_assistant_1},
                {"role": "user",      "content": few_shot_user_2},
                {"role": "assistant", "content": few_shot_assistant_2},
                {"role": "user",      "content": description},
            ],
        }

        import time
        for attempt in range(3):
            try:
                response = requests.post(self.base_url, headers=headers, json=payload, timeout=10)
                if response.status_code == 429:
                    logger.warning(f"Groq NLP API 429. Retrying in {2**(attempt+1)}s...")
                    time.sleep(2 ** (attempt + 1))
                    continue
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"].strip()

                if text.lower() == "null":
                    return None

                return json.loads(text)
            except Exception as e:
                if isinstance(e, requests.exceptions.HTTPError) and e.response and e.response.status_code == 429 and attempt < 2:
                    logger.warning(f"Groq NLP API 429. Retrying in {2**(attempt+1)}s...")
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise e
        return None

    def parse_description(
        self,
        description: str,
        model_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Sends the incident description to the Groq API for parsing.

        Args:
            description: Raw incident text (any language).
            model_name:  Groq model ID to use for this call. Defaults to
                         DEFAULT_MODEL if None or not in ALLOWED_MODELS.

        Logs an explicit warning and returns None if the API key is not
        configured or an error occurs, rather than falling back to heuristics.
        """
        if not description or not description.strip():
            return None

        # 1. Resolve and validate model
        resolved_model = model_name if model_name in ALLOWED_MODELS else DEFAULT_MODEL
        if model_name and model_name not in ALLOWED_MODELS:
            logger.warning(
                "[Agent 1 - NLP Parser] Unknown model %r requested; falling back to %s.",
                model_name,
                DEFAULT_MODEL,
            )

        # 2. Check for API key
        if not self.groq_key:
            logger.warning("[Agent 1 - NLP Parser] WARNING: No Groq API key found. Model not loaded.")
            return None

        # 3. Log which model is being used for this call
        logger.info(
            "[Agent 1 - NLP Parser] Calling Groq API — model: %s",
            resolved_model,
        )

        # 4. Attempt Groq
        try:
            return self._parse_with_groq(description, resolved_model)
        except requests.exceptions.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else "Unknown"
            reason = exc.response.reason if exc.response is not None else "Error"
            safe_url = sanitize_url(exc.request.url) if (exc.request and exc.request.url) else "URL"
            safe_err = f"{status_code} Client Error: {reason} for url: {safe_url}"
            logger.error(
                "[Agent 1 - NLP Parser] WARNING: Groq API call failed (model=%s, %s). "
                "NLP parser model is not loaded.",
                resolved_model,
                safe_err,
            )
            return None
        except Exception as e:
            safe_err = re.sub(r'(Bearer\s+)\S+', r'\1[REDACTED]', str(e))
            logger.error(
                "[Agent 1 - NLP Parser] WARNING: Groq API call failed (model=%s, %s). "
                "NLP parser model is not loaded.",
                resolved_model,
                safe_err,
            )
            return None
