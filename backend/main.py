"""GardenAI backend — FastAPI application entrypoint.

Every endpoint is a thin route that delegates to one of the four independent
services in `services/`:

    1. ingredient_extraction  -> POST /api/analyze-food
    2. crop_scoring           -> POST /api/recommend-crops
    3. layout_generator       -> POST /api/generate-layout
    4. care_engine            -> GET  /api/garden-status
                                 GET  /api/care-recommendations

Location and climate (services/location.py, services/climate.py) are shared
inputs to systems 2 and 4, served on their own at GET /api/location.

Ingredient extraction upgrades itself to a real model when `IFM_API_KEY` is
set (see services/llm_client.py); everything else is still mocked. Each
LLM-backed path falls back to its offline implementation on any failure.

Run with:  uvicorn main:app --reload --port 8000
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env explicitly rather than relying on the working directory,
# and do it before the service modules are imported — they read their
# configuration from the environment at import time.
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from routes import care, food, garden, location, me, recommendations  # noqa: E402
from services import auth, llm_client, user_store  # noqa: E402

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="GardenAI API",
    version="0.1.0",
    description="Scaffold API for personalized household food gardening. All "
    "intelligence is currently mocked — see services/ for the swap points.",
)

# The Next.js dev server. Override with ALLOWED_ORIGINS="https://..." in prod.
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(food.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(garden.router, prefix="/api")
app.include_router(care.router, prefix="/api")
app.include_router(location.router, prefix="/api")
app.include_router(me.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """Also reports which steps are running on a real model vs. a mock."""
    llm_on = llm_client.is_available()
    return {
        "status": "ok",
        "version": app.version,
        "llm": {
            "configured": llm_on,
            "structured_model": llm_client.MODEL_STRUCTURED if llm_on else None,
            "prose_model": llm_client.MODEL_PROSE if llm_on else None,
        },
        "auth": {
            "configured": auth.configured(),
            "mode": auth.mode(),
        },
        "database": {
            "configured": user_store.is_configured(),
            "reachable": user_store.ping(),
        },
        "systems": {
            "ingredient_extraction": "llm" if llm_on else "mock-keywords",
            "crop_scoring": "mock-heuristic",
            "layout_generation": "mock-shelf-packing",
            "care_engine": "mock-rules",
            "location": "open-meteo-geocoding",
            "climate": "open-meteo-archive",
            "weather": "open-meteo-forecast",
        },
    }
