"""
Smart Traffic Intelligence System — FastAPI Entry Point
"""

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Load .env (if present) before anything else reads os.environ
# ---------------------------------------------------------------------------
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
    logging.getLogger(__name__).info("Loaded .env from %s", _env_path)
else:
    # Try .env in the backend/ directory itself
    _alt_env = Path(__file__).parent / ".env"
    if _alt_env.exists():
        load_dotenv(_alt_env)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent imports (agents/ is owned by another team — read-only)
# ---------------------------------------------------------------------------
from backend.agents.anomaly_detector import TrafficAnomalyDetector
from backend.agents.nlp_parser import NLPIncidentParser
from backend.agents.prediction_agent import PredictionAgent
from backend.agents.action_planner import ActionPlannerAgent

# ---------------------------------------------------------------------------
# Data loader
# ---------------------------------------------------------------------------
from backend.data.loader import load_dataset, get_dataframe

# ---------------------------------------------------------------------------
# Route modules
# ---------------------------------------------------------------------------
from backend.routes.predict import router as predict_router, init_prediction_agent
from backend.routes.nlp import router as nlp_router, init_nlp_parser
from backend.routes.anomaly import (
    router as anomaly_router,
    init_anomaly_detector,
    anomaly_replay_loop,
)
from backend.routes.heatmap import router as heatmap_router
from backend.routes.incidents import router as incidents_router
from backend.routes.analytics import router as analytics_router
from backend.routes.action_plan import router as action_plan_router, init_action_planner
from backend.routes.feedback import router as feedback_router

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Smart Traffic Intelligence API",
    description=(
        "Bengaluru traffic incident prediction, anomaly detection, "
        "NLP parsing, and LLM action planning."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow the frontend dev server (Next.js on :3000) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup: load data + agents, start background tasks
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event() -> None:
    """
    Runs once when the server starts.

    Order of operations:
    1. Load the CSV dataset into memory + build caches.
    2. Initialise Agent 1 (NLP Parser).
    3. Initialise Agent 2 (Prediction Agent) + load .joblib models.
    4. Initialise Agent 3 (Anomaly Detector) + load .joblib model.
    5. Initialise Agent 4 (Action Planner).
    6. Inject agents into route modules.
    7. Start the anomaly replay background task.
    """
    logger.info("=== Smart Traffic Intelligence — starting up ===")

    # ── 1. Dataset ─────────────────────────────────────────────────────────
    logger.info("Loading dataset …")
    try:
        load_dataset()
        logger.info("Dataset ready.")
    except FileNotFoundError as exc:
        logger.critical("Dataset CSV not found: %s — check backend/data/ directory.", exc)
        raise

    # ── 2. Agent 1: NLP Parser ─────────────────────────────────────────────
    logger.info("Initialising Agent 1 (NLP Parser) …")
    nlp_parser = NLPIncidentParser()  # reads GEMINI_API_KEY / GOOGLE_API_KEY from env
    init_nlp_parser(nlp_parser)
    logger.info("Agent 1 ready. Gemini key present: %s", bool(
        os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    ))

    # ── 3. Agent 2: Prediction Agent ────────────────────────────────────────
    logger.info("Initialising Agent 2 (Prediction Agent) …")
    prediction_agent = PredictionAgent(
        classifier_path="backend/models/priority_model.joblib",
        regressor_path="backend/models/duration_model.joblib",
        junction_lookup_path="backend/models/junction_lookup.joblib",
        zone_encoder_path="backend/models/encoders.joblib",
    )
    prediction_agent.load_models()  # logs WARNING if files absent (placeholder mode)
    init_prediction_agent(prediction_agent)
    logger.info("Agent 2 ready.")

    # ── 4. Agent 3: Anomaly Detector ────────────────────────────────────────
    logger.info("Initialising Agent 3 (Anomaly Detector) …")
    anomaly_model_path = "backend/models/anomaly_detector.joblib"
    anomaly_detector = TrafficAnomalyDetector(model_path=anomaly_model_path)

    if Path(anomaly_model_path).exists():
        try:
            anomaly_detector.load(anomaly_model_path)
            logger.info("Anomaly detector loaded from %s.", anomaly_model_path)
        except Exception as exc:
            logger.warning(
                "WARNING: Could not load anomaly detector from disk (%s). "
                "Model is not loaded. Please train the model first.",
                exc,
            )
    else:
        logger.warning(
            "WARNING: anomaly_detector.joblib not found at %s. "
            "Model is not loaded. Please train the model first.",
            anomaly_model_path,
        )

    init_anomaly_detector(anomaly_detector)
    logger.info("Agent 3 ready.")

    # ── 5. Agent 4: Action Planner ──────────────────────────────────────────
    logger.info("Initialising Agent 4 (Action Planner) …")
    action_planner = ActionPlannerAgent()
    init_action_planner(action_planner)
    logger.info("Agent 4 ready.")

    # ── 6. Start anomaly replay background task ─────────────────────────────
    logger.info("Starting anomaly replay background task …")
    df = get_dataframe()
    asyncio.create_task(anomaly_replay_loop(df))
    logger.info("Anomaly replay task started (interval: 5 s).")

    logger.info("=== All agents initialised — server ready ===")





# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health_check():
    """Quick liveness probe — returns 200 OK with server status."""
    return {
        "status": "ok",
        "service": "Smart Traffic Intelligence API",
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# Mount all routers
# ---------------------------------------------------------------------------
app.include_router(predict_router,      prefix="", tags=["Prediction"])
app.include_router(nlp_router,          prefix="", tags=["NLP"])
app.include_router(anomaly_router,      prefix="", tags=["Anomaly"])
app.include_router(heatmap_router,      prefix="", tags=["Map Data"])
app.include_router(incidents_router,    prefix="", tags=["Map Data"])
app.include_router(analytics_router,    prefix="", tags=["Analytics"])
app.include_router(action_plan_router,  prefix="", tags=["Action Plan"])
app.include_router(feedback_router,     prefix="", tags=["Feedback"])
