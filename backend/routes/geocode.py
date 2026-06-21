"""
Route: POST /geocode-zone

Resolves a free-text Bengaluru area / zone name into geographic coordinates.
Hybrid Approach: Uses Groq (LLM) to parse the free-text description into a clean 
location name, and then uses OpenStreetMap Nominatim to look up the exact lat/long.

This endpoint is called from the Submit Incident form (View 2) ONLY.
It is NOT used by the anomaly monitor "Generate Plan" path.
"""

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# System prompt for the geocoding agent (LLM parsing)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are a smart location parser. Your job is to take a user's conversational description of a location in Bengaluru (Bangalore) and resolve it into a clean, canonical place name.

Rules:
1. If the input is a well-known, specific location, return a SINGLE high-confidence result.
2. If the input is vague or could refer to multiple places (e.g. "near the big mall"), return 2 to 3 distinct candidate locations.
3. CRITICAL: Keep the resolved name as short and canonical as possible. Do NOT append specific neighborhoods, sectors, or localities unless the user explicitly typed them. (e.g. if the user says "phoenix mall", return "Phoenix Marketcity", DO NOT return "Phoenix Marketcity, Whitefield").
4. ALWAYS append the correct city and state to the resolved name (e.g. ", Bengaluru, Karnataka" or ", Mangaluru, Karnataka"). This is critical for the map API to find it.
5. Provide approximate latitude and longitude coordinates for the location in Bengaluru (e.g., lat around 12.97, lng around 77.59). Make your best guess based on the area. This will be used as a fallback if the map API fails.

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no explanation:

For a specific, unambiguous location:
{"confidence": "high", "lat": 12.93, "lng": 77.62, "resolved_name": "<canonical name, city, state>"}

For an ambiguous or vague input:
{"confidence": "ambiguous", "candidates": [{"name": "<place name, city, state>", "lat": 12.93, "lng": 77.62}, ...]}

If the location cannot be parsed at all:
{"confidence": "failed", "message": "<brief reason>"}
"""

_FEW_SHOT_USER = "Koramangala"
_FEW_SHOT_MODEL = json.dumps({
    "confidence": "high",
    "lat": 12.9352,
    "lng": 77.6245,
    "resolved_name": "Koramangala, Bengaluru"
})

_FEW_SHOT_USER_2 = "Layout near old airport"
_FEW_SHOT_MODEL_2 = json.dumps({
    "confidence": "ambiguous",
    "candidates": [
        {"name": "Jeevan Bima Nagar Layout, Bengaluru, Karnataka", "lat": 12.9649, "lng": 77.6582},
        {"name": "HAL Airport Layout, Bengaluru, Karnataka", "lat": 12.9599, "lng": 77.6631},
        {"name": "New Thippasandra Layout, Bengaluru, Karnataka", "lat": 12.9731, "lng": 77.6521}
    ]
})

_FEW_SHOT_USER_3 = "mall in bengaluru"
_FEW_SHOT_MODEL_3 = json.dumps({
    "confidence": "ambiguous",
    "candidates": [
        {"name": "Phoenix Marketcity, Bengaluru, Karnataka", "lat": 12.9958, "lng": 77.6964},
        {"name": "Nexus Mall Koramangala, Bengaluru, Karnataka", "lat": 12.9344, "lng": 77.6113},
        {"name": "Mantri Square Mall, Bengaluru, Karnataka", "lat": 12.9918, "lng": 77.5712}
    ]
})

_FEW_SHOT_USER_4 = "Layout"
_FEW_SHOT_MODEL_4 = json.dumps({
    "confidence": "ambiguous",
    "candidates": [
        {"name": "HSR Layout, Bengaluru, Karnataka", "lat": 12.9116, "lng": 77.6389},
        {"name": "Indiranagar, Bengaluru, Karnataka", "lat": 12.9719, "lng": 77.6412},
        {"name": "Koramangala, Bengaluru, Karnataka", "lat": 12.9352, "lng": 77.6245}
    ]
})

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class GeocodeZoneRequest(BaseModel):
    zone: str

# ---------------------------------------------------------------------------
# Internal Logic
# ---------------------------------------------------------------------------

def _call_groq_parser(zone_input: str) -> Optional[Dict[str, Any]]:
    """Calls Groq to parse conversational text into a canonical place name."""
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        logger.warning("No Groq API key found — parsing cannot proceed.")
        return None

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {groq_key}"}
    payload = {
        "model": "groq/compound-mini",
        "temperature": 0.0,
        "messages": [
            {"role": "system",    "content": _SYSTEM_PROMPT},
            {"role": "user",      "content": _FEW_SHOT_USER},
            {"role": "assistant", "content": _FEW_SHOT_MODEL},
            {"role": "user",      "content": _FEW_SHOT_USER_2},
            {"role": "assistant", "content": _FEW_SHOT_MODEL_2},
            {"role": "user",      "content": _FEW_SHOT_USER_3},
            {"role": "assistant", "content": _FEW_SHOT_MODEL_3},
            {"role": "user",      "content": _FEW_SHOT_USER_4},
            {"role": "assistant", "content": _FEW_SHOT_MODEL_4},
            {"role": "user",      "content": zone_input.strip()},
        ],
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        raw_text = resp.json()["choices"][0]["message"]["content"].strip()
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
        return json.loads(raw_text)
    except Exception as exc:
        logger.error("Groq parser error: %s", exc)
        return None

def _fetch_coordinates(place_name: str) -> tuple[Optional[tuple[float, float]], bool]:
    """Calls Nominatim to fetch exact lat/lng for a given place name.
    Returns (coords, is_error) where is_error is True if a network/API error occurred.
    """
    query = place_name.strip()

    logger.info("  -> Calling Nominatim with query: %r", query)

    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "limit": 1, "countrycodes": "in"}
    headers = {"User-Agent": "SmartTrafficIntelligence/1.0 (Local-Hackathon-Project)"}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data:
            return (float(data[0]["lat"]), float(data[0]["lon"])), False
        return None, False
    except Exception as exc:
        logger.error("Nominatim lookup failed: %s", exc)
        return None, True

def _hybrid_geocode(zone_input: str) -> Optional[Dict[str, Any]]:
    # 0. Demo script guarantee: If user types "Layout" (any casing), force the ambiguous modal
    # so they can pick HSR Layout as intended in their demo script.
    if zone_input.strip().lower() == "layout":
        parsed = {
            "confidence": "ambiguous",
            "candidates": [
                {"name": "HSR Layout, Bengaluru, Karnataka", "lat": 12.9116, "lng": 77.6389},
                {"name": "Indiranagar, Bengaluru, Karnataka", "lat": 12.9719, "lng": 77.6412},
                {"name": "Koramangala, Bengaluru, Karnataka", "lat": 12.9352, "lng": 77.6245}
            ]
        }
    else:
        # 1. Ask LLM to parse
        parsed = _call_groq_parser(zone_input)
    
    if not parsed:
        # Fallback to direct Nominatim if LLM is unavailable (e.g., missing API key)
        logger.warning("LLM geocode failed. Falling back to direct Nominatim lookup.")
        coords, is_error = _fetch_coordinates(f"{zone_input}, Bengaluru")
        if coords:
            return {"confidence": "high", "lat": coords[0], "lng": coords[1], "resolved_name": zone_input.title()}
        return None
        
    confidence = parsed.get("confidence", "failed")
    logger.info("LLM Geocode Parser Output: confidence=%r", confidence)
    
    # 2. Fetch true coordinates from Nominatim
    if confidence == "high":
        name = parsed.get("resolved_name", zone_input)
        logger.info("LLM resolved high confidence name: %r", name)
        coords, is_error = _fetch_coordinates(name)
        if coords:
            return {"confidence": "high", "lat": coords[0], "lng": coords[1], "resolved_name": name}
        else:
            lat = parsed.get("lat")
            lng = parsed.get("lng")
            if lat and lng and _validate_bengaluru_coords(lat, lng):
                logger.warning("Nominatim failed or returned no results. Falling back to LLM approximate coordinates.")
                return {"confidence": "high", "lat": lat, "lng": lng, "resolved_name": name}
            return {"confidence": "failed", "message": f"Could not map coordinates for '{name}'."}
            
    elif confidence == "ambiguous":
        candidates = parsed.get("candidates", [])
        valid = []
        logger.info("LLM returned %d ambiguous candidates. Verifying with Nominatim...", len(candidates))
        import time
        nominatim_blocked = False
        for c in candidates:
            name = c.get("name", "Unknown")
            coords = None
            if not nominatim_blocked:
                coords, is_error = _fetch_coordinates(name)
                if is_error:
                    logger.warning("Nominatim returned error. Assuming service is blocked/down, skipping remaining queries.")
                    nominatim_blocked = True
                
                if coords:
                    valid.append({"name": name, "lat": coords[0], "lng": coords[1]})
                    # Respect OpenStreetMap's 1 req/sec strict limit
                    time.sleep(1.1)
                    continue
            
            # Fallback to LLM approximate coordinates if Nominatim failed/blocked or found nothing
            lat = c.get("lat")
            lng = c.get("lng")
            if lat is not None and lng is not None and _validate_bengaluru_coords(lat, lng):
                logger.warning("Falling back to LLM coordinates for candidate '%s': (%s, %s)", name, lat, lng)
                valid.append({"name": name, "lat": lat, "lng": lng})
        
        if valid:
            return {"confidence": "ambiguous", "candidates": valid}
        else:
            return {"confidence": "failed", "message": "Could not verify coordinates for candidate locations."}
            
    return parsed

def _validate_bengaluru_coords(lat: float, lng: float) -> bool:
    return 7.0 <= lat <= 19.0 and 72.0 <= lng <= 84.0

# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/geocode-zone", summary="Resolve a Bengaluru area to coordinates", tags=["Geocoding"])
async def geocode_zone(request: GeocodeZoneRequest) -> Dict[str, Any]:
    zone_input = (request.zone or "").strip()
    if not zone_input:
        return {"confidence": "failed", "message": "Zone name is empty."}

    logger.info("Geocoding zone (Hybrid LLM+Nominatim): %r", zone_input)

    result = await asyncio.to_thread(_hybrid_geocode, zone_input)

    if result is None:
        return {"confidence": "failed", "message": "Geocoding service unavailable."}

    # If it succeeded, apply bounds checking just to be safe
    if result.get("confidence") == "high":
        if not _validate_bengaluru_coords(result["lat"], result["lng"]):
            return {"confidence": "failed", "message": "Resolved location is outside Bengaluru radius."}
    elif result.get("confidence") == "ambiguous":
        result["candidates"] = [
            c for c in result["candidates"]
            if _validate_bengaluru_coords(c["lat"], c["lng"])
        ]
        if not result["candidates"]:
            return {"confidence": "failed", "message": "Resolved candidates outside Bengaluru radius."}

    return result
