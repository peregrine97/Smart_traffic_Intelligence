"""
Route: POST /action-plan  (Server-Sent Events)

Agent 4 -- Action Planner.

Changed from GET+query-params to POST+JSON body for two reasons:
  1. GET query strings are capped at ~2048 chars by browsers and servers --
     long addresses, NLP summaries, or junction names can silently truncate.
  2. JSON body allows structured, typed fields with Pydantic validation,
     making the contract explicit and self-documenting.

The frontend must call this as a POST with Content-Type: application/json.
Streams the LLM action plan token-by-token as SSE events.
"""

import logging
from typing import Optional, Union

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.agents.action_planner import ActionPlannerAgent

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Singleton agent instance -- initialised by main.py at startup
# ---------------------------------------------------------------------------
_agent: Optional[ActionPlannerAgent] = None


def init_action_planner(agent: ActionPlannerAgent) -> None:
    """Inject the loaded ActionPlannerAgent singleton into this route module."""
    global _agent
    _agent = agent
    logger.info("Action plan route initialised with ActionPlannerAgent instance.")


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class ActionPlanRequest(BaseModel):
    """
    Full incident + prediction context required to generate an action plan.

    All fields are Optional so that partial submissions (e.g., from the
    anomaly monitor) still produce a valid plan. Defaults mirror the
    original query-param defaults to preserve backward-compatible behaviour.
    """
    event_type: Optional[str] = Field("unplanned", description="'planned' or 'unplanned'")
    event_cause: Optional[str] = Field("unknown", description="Dataset event_cause value")
    address: Optional[str] = Field("Unknown location", description="Human-readable location")
    junction: Optional[str] = Field("Unknown junction", description="Junction name")
    corridor: Optional[str] = Field("Non-corridor", description="Corridor label")
    police_station: Optional[str] = Field("Local station", description="Responsible police station")
    zone: Optional[str] = Field("Unknown zone", description="Traffic zone name")
    priority: Optional[str] = Field("High", description="Predicted priority: High or Low")
    confidence: Optional[Union[float, str]] = Field("0", description="Classifier confidence as a float or string")
    estimated_duration_minutes: Optional[Union[int, str]] = Field("60", description="Predicted duration in minutes")
    requires_road_closure: Optional[Union[bool, str]] = Field("false", description="Whether road closure is required")
    nlp_cause: Optional[str] = Field("", description="Root cause extracted by Agent 1, if ran")
    nlp_summary: Optional[str] = Field("", description="Normalized summary from Agent 1, if ran")
    is_zone_alert: Optional[Union[bool, str]] = Field(
        "false",
        description="'true' if this plan is triggered by an anomaly zone alert",
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/action-plan",
    summary="Stream an LLM action plan as Server-Sent Events",
    tags=["Action Plan"],
)
async def post_action_plan(
    request: Request,
    body: ActionPlanRequest,
) -> StreamingResponse:
    """
    Accepts the full incident + prediction context as a JSON body,
    calls Agent 4 (ActionPlannerAgent), and streams the response
    token-by-token as SSE events.

    The plan always contains exactly six labeled sections:
    Officers, Barricades, Diversion, Estimated Clearance,
    Escalation Trigger, Public Advisory.

    For planned events (event_type == 'planned'), the prompt instructs
    pre-emptive deployment before the event start time.
    For is_zone_alert == 'true', the plan is framed as a zone-wide
    pre-emptive response.
    """
    if _agent is None:
        raise HTTPException(
            status_code=503,
            detail="Action planner agent is not initialised.",
        )

    # Build params dict from the validated body, applying defaults where None.
    # Coerce union types (bool, float, int) to string as expected by the agent.
    params = {
        "event_type":                 body.event_type or "unplanned",
        "event_cause":                body.event_cause or "unknown",
        "address":                    body.address or "Unknown location",
        "junction":                   body.junction or "Unknown junction",
        "corridor":                   body.corridor or "Non-corridor",
        "police_station":             body.police_station or "Local station",
        "zone":                       body.zone or "Unknown zone",
        "priority":                   body.priority or "High",
        "confidence":                 str(body.confidence) if body.confidence is not None else "0",
        "estimated_duration_minutes": str(body.estimated_duration_minutes) if body.estimated_duration_minutes is not None else "60",
        "requires_road_closure":      str(body.requires_road_closure).lower() if body.requires_road_closure is not None else "false",
        "nlp_cause":                  body.nlp_cause or "",
        "nlp_summary":                body.nlp_summary or "",
        "is_zone_alert":              str(body.is_zone_alert).lower() if body.is_zone_alert is not None else "false",
    }

    return StreamingResponse(
        _agent.stream_plan(params),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
