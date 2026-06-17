"""
Route: POST /nlp-parse

Calls Agent 1 (NLPIncidentParser) to parse a free-text incident
description into structured fields.

Request:  { "description": "kannada or english text" }
Response: { root_cause, vehicle_type, severity, action_needed, normalized_summary } | null

Vocabulary bridge:
  Agent 1 (Gemini NLP parser) uses its own label set defined in its system prompt.
  Agent 2 (XGBoost) uses LabelEncoders trained on the processed_dataset.
  This module normalises Agent 1 output to encoder-valid values before returning,
  so no label ever silently maps to -1 in feature_engineering.py.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agents.nlp_parser import NLPIncidentParser

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Vocabulary normalization maps
#
# HOW TO MAINTAIN:
#   After re-training, check the encoder classes with:
#       import joblib
#       enc = joblib.load("backend/models/encoders.joblib")
#       print(enc["event_cause"].classes_)
#       print(enc["veh_type"].classes_)
#   Then add/update entries here.
#
# Current encoder event_cause classes:
#   'Fog / Low Visibility', 'accident', 'congestion', 'construction', 'others',
#   'pot_holes', 'procession', 'protest', 'public_event', 'road_conditions',
#   'tree_fall', 'vehicle_breakdown', 'vip_movement', 'water_logging'
#
# Current encoder veh_type classes:
#   'auto', 'bmtc_bus', 'heavy_vehicle', 'ksrtc_bus', 'lcv', 'others',
#   'private_bus', 'private_car', 'taxi', 'truck', 'unknown'
# ---------------------------------------------------------------------------

NLP_CAUSE_MAP: Dict[str, str] = {
    # Agent 1 labels that are NOT in the encoder -- map to nearest valid label
    "road_maintenance":        "construction",
    "traffic_congestion":      "congestion",
    "unplanned_utility_work":  "construction",
    "general_delay":           "others",
    # Pass-through values (already in encoder vocabulary)
    "vehicle_breakdown":       "vehicle_breakdown",
    "accident":                "accident",
    "water_logging":           "water_logging",
    "tree_fall":               "tree_fall",
    "protest":                 "protest",
    "vip_movement":            "vip_movement",
    "construction":            "construction",
    "congestion":              "congestion",
    "procession":              "procession",
    "public_event":            "public_event",
    "pot_holes":               "pot_holes",
    "road_conditions":         "road_conditions",
    "others":                  "others",
}

NLP_VEH_MAP: Dict[str, str] = {
    # Agent 1 labels that are NOT in the encoder -- map to nearest valid label
    "car":           "private_car",
    "two_wheeler":   "others",
    "auto_rickshaw": "auto",
    "hgv":           "heavy_vehicle",
    "ambulance":     "others",
    # Pass-through values (already in encoder vocabulary)
    "auto":          "auto",
    "bmtc_bus":      "bmtc_bus",
    "heavy_vehicle": "heavy_vehicle",
    "ksrtc_bus":     "ksrtc_bus",
    "lcv":           "lcv",
    "others":        "others",
    "private_bus":   "private_bus",
    "private_car":   "private_car",
    "taxi":          "taxi",
    "truck":         "truck",
    "unknown":       "unknown",
}


def _normalize_nlp_result(result: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Normalize the vocabulary in an NLP parse result so it aligns with the
    prediction encoder expected label set.

    Any unrecognised label triggers a WARNING so the team is alerted --
    there is no silent degradation.

    Args:
        result: Raw dict from NLPIncidentParser.parse_description(), or None.

    Returns:
        Same dict with root_cause and vehicle_type remapped to encoder-valid
        values, or None if input was None.
    """
    if result is None:
        return None

    normalized = result.copy()

    # -- Normalize event cause ------------------------------------------------
    raw_cause = normalized.get("root_cause")
    if raw_cause is not None:
        mapped = NLP_CAUSE_MAP.get(raw_cause)
        if mapped is None:
            logger.warning(
                "NLP returned unrecognised root_cause=%r; mapping to 'others'. "
                "Add to NLP_CAUSE_MAP in routes/nlp.py to handle explicitly.",
                raw_cause,
            )
            mapped = "others"
        normalized["root_cause"] = mapped

    # -- Normalize vehicle type -----------------------------------------------
    raw_veh = normalized.get("vehicle_type")
    if raw_veh is not None:
        mapped = NLP_VEH_MAP.get(raw_veh)
        if mapped is None:
            logger.warning(
                "NLP returned unrecognised vehicle_type=%r; mapping to 'unknown'. "
                "Add to NLP_VEH_MAP in routes/nlp.py to handle explicitly.",
                raw_veh,
            )
            mapped = "unknown"
        normalized["vehicle_type"] = mapped

    return normalized


# ---------------------------------------------------------------------------
# Singleton -- initialised by main.py at startup
# ---------------------------------------------------------------------------
_nlp_parser: Optional[NLPIncidentParser] = None


def init_nlp_parser(parser: NLPIncidentParser) -> None:
    """Inject the NLPIncidentParser instance from main.py startup."""
    global _nlp_parser
    _nlp_parser = parser
    logger.info("NLP parse route initialised with NLPIncidentParser instance.")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class NLPParseRequest(BaseModel):
    description: str


class NLPParseResponse(BaseModel):
    root_cause: Optional[str] = None
    vehicle_type: Optional[str] = None
    severity: Optional[int] = None
    action_needed: Optional[bool] = None
    normalized_summary: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/nlp-parse",
    summary="Parse a free-text incident description into structured fields",
    tags=["NLP"],
)
async def nlp_parse(request: NLPParseRequest) -> Any:
    """
    Accepts a raw incident description in any language (Kannada, English,
    mixed / transliterated) and runs Agent 1 (NLPIncidentParser) to extract:

    - root_cause         -- remapped to encoder event_cause vocabulary
    - vehicle_type       -- remapped to encoder veh_type vocabulary, or null
    - severity           -- 1 (low) | 2 (medium) | 3 (high)
    - action_needed      -- boolean
    - normalized_summary -- one-sentence English summary

    The result is vocabulary-normalised via _normalize_nlp_result() so that
    downstream calls to POST /predict never receive an unseen label that
    silently maps to -1 in the encoder.

    Returns null (HTTP 200) if the description cannot be parsed.
    Frontend shows the parsed section in IncidentPanel; on null it falls
    through to the user typed structured fields.
    """
    if not request.description or not request.description.strip():
        return None

    if _nlp_parser is None:
        raise HTTPException(
            status_code=503,
            detail="NLP parser not initialised. Server may still be starting.",
        )

    try:
        raw_result = _nlp_parser.parse_description(request.description)
        # Normalize vocabulary so the frontend always sends encoder-compatible
        # labels to POST /predict.
        return _normalize_nlp_result(raw_result)
    except Exception as exc:
        logger.exception("NLP parse error: %s", exc)
        # Per spec: return null on failure, not an error status
        return None
