"""
Route: POST /predict

Consumes PredictionAgent (Agent 2) to classify an incident priority and
estimate its resolution duration. This endpoint is called from three places
in the frontend:

1. When the user clicks a map marker -> historical incident fields are sent.
2. When the user submits the incident form (View 2) -> user-supplied fields.
3. When "Generate Plan" is clicked on an anomaly zone card -> zone-level
   context is sent.

Request body matches the raw incident dict expected by
PredictionAgent.build_feature_vector().

Response body:
{
    "priority": "High" | "Low",
    "confidence": float,
    "estimated_duration_minutes": int,
    "estimated_resolution_time": str  (ISO 8601)
}
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.agents.prediction_agent import PredictionAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter()

# ---------------------------------------------------------------------------
# Request schema -- mirrors the incident fields documented in AGENTS.md section 6
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    """
    Incident payload accepted by POST /predict.

    All fields are optional because different callers supply different
    subsets (map markers have full data; form submissions may omit zone;
    anomaly cards have no junction). The PredictionAgent handles defaults
    internally.

    lat / lng are included so that live-submitted incidents land at the
    correct coordinates on the heatmap and map markers, not pinned to the
    city centre (which was the previous behaviour when these were absent).
    """

    event_type: Optional[str] = Field(
        None,
        description="'planned' or 'unplanned'",
        examples=["unplanned"],
    )
    event_cause: Optional[str] = Field(
        None,
        description="One of the dataset event_cause categories.",
        examples=["vehicle_breakdown"],
    )
    veh_type: Optional[str] = Field(
        None,
        description="Vehicle type involved, or null if unknown.",
        examples=["bmtc_bus"],
    )
    requires_road_closure: Optional[bool] = Field(
        False,
        description="Whether the incident requires closing the road.",
    )
    start_datetime: Optional[str] = Field(
        None,
        description="ISO 8601 start time of the incident.",
        examples=["2025-06-15T08:30:00"],
    )
    zone: Optional[str] = Field(
        None,
        description="Traffic zone name. Null for ~57% of records.",
    )
    junction: Optional[str] = Field(
        None,
        description="Junction name. Null for ~69% of records.",
    )
    corridor: Optional[str] = Field(
        None,
        description="Corridor name from the dataset.",
        examples=["ORR East 1"],
    )
    planned_duration_minutes: Optional[float] = Field(
        None,
        description=(
            "For planned events only: duration in minutes derived from "
            "end_datetime - start_datetime. Null/0 for unplanned."
        ),
    )
    # Location fields -- used to pin live-submitted incidents at the correct
    # map coordinates. When absent, the incident is placed at the city centre.
    lat: Optional[float] = Field(
        None,
        description="Latitude of the incident location.",
        examples=[12.9352],
    )
    lng: Optional[float] = Field(
        None,
        description="Longitude of the incident location.",
        examples=[77.6245],
    )
    # Display-only fields -- passed through to add_live_incident() so the
    # Incident Panel can show the correct address and responsible station.
    address: Optional[str] = Field(
        None,
        description="Human-readable address of the incident location.",
    )
    police_station: Optional[str] = Field(
        None,
        description="Responsible police station for this area.",
    )


class PredictResponse(BaseModel):
    """
    Standard prediction response -- matches the API contract in AGENTS.md section 7.
    """

    priority: str = Field(
        ...,
        description="Predicted priority: 'High' or 'Low'.",
    )
    confidence: float = Field(
        ...,
        description="Classifier probability for the predicted class (0-1).",
    )
    estimated_duration_minutes: int = Field(
        ...,
        description="Estimated resolution time in minutes.",
    )
    estimated_resolution_time: str = Field(
        ...,
        description="ISO 8601 timestamp: now + estimated_duration_minutes.",
    )


# ---------------------------------------------------------------------------
# Singleton agent instance -- initialised by main.py at startup
# ---------------------------------------------------------------------------
_agent: Optional[PredictionAgent] = None


def init_prediction_agent(agent: PredictionAgent) -> None:
    """
    Called once from main.py during application startup to inject the
    loaded PredictionAgent singleton into this route module.
    """
    global _agent
    _agent = agent
    logger.info("Prediction route initialised with PredictionAgent instance.")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/predict",
    response_model=PredictResponse,
    summary="Predict incident priority and resolution time",
    tags=["Prediction"],
)
async def predict_incident(request: PredictRequest) -> PredictResponse:
    """
    Accepts incident fields, runs Agent 2 (priority classifier + duration
    regressor), and returns the prediction result.
    """
    if _agent is None:
        raise HTTPException(
            status_code=503,
            detail="Prediction agent is not initialised. Server may still be starting.",
        )

    try:
        # Convert Pydantic model -> plain dict for the agent
        incident_data = request.model_dump(exclude_none=False)

        result = _agent.predict_incident(incident_data)

        return PredictResponse(**result)

    except RuntimeError as exc:
        logger.error("PredictionAgent runtime error: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected error in /predict")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")
