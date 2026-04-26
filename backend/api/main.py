"""
FastAPI backend — UNMAPPED platform.

Endpoints:
  POST /api/profile          → runs Skills + Opportunity agents
  GET  /api/opportunities    → re-fetch for a saved profile (stub)
  GET  /api/dashboard        → runs Dashboard agent
  POST /api/ingest           → trigger data ingestion (admin)
  GET  /api/health           → health check
"""

import logging
import os
import uuid
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="UNMAPPED API",
    description="AI-native skills infrastructure for youth in LMICs",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory profile store (replace with DB in production)
_profiles: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ProfileRequest(BaseModel):
    education_level: str = Field(
        ...,
        description="ISCED education level label",
        example="Senior high school (SHS) / Secondary",
    )
    experience_text: str = Field(
        ...,
        description="Free-text description of work experience and informal skills",
        example="I have been repairing smartphones for 5 years and taught basic coding to 10 students.",
    )
    country_code: str = Field(default="GHA", description="ISO3 country code", example="GHA")


class ProfileResponse(BaseModel):
    profile_id: str
    passport: dict
    opportunities: dict
    error: Optional[str] = None


class DashboardResponse(BaseModel):
    country_code: str
    country_name: str
    narrative: str
    key_signals: list
    charts: dict
    data_sources: list


class IngestRequest(BaseModel):
    skip_esco: bool = False
    countries: Optional[list[str]] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "UNMAPPED API"}


@app.post("/api/profile", response_model=ProfileResponse)
def create_profile(req: ProfileRequest):
    """
    Main youth endpoint.
    Runs Skills Signal Agent → Opportunity Matching Agent.
    Returns Skills Passport + ranked opportunities with econometric signals.
    """
    from backend.orchestrator import run_profile_pipeline

    logger.info("Profile request: country=%s", req.country_code)

    result = run_profile_pipeline(
        education_level=req.education_level,
        experience_text=req.experience_text,
        country_code=req.country_code,
    )

    profile_id = str(uuid.uuid4())
    _profiles[profile_id] = result

    return ProfileResponse(
        profile_id=profile_id,
        passport=result.get("passport", {}),
        opportunities=result.get("opportunities", {}),
        error=result.get("error"),
    )


@app.get("/api/opportunities")
def get_opportunities(profile_id: str, country_code: Optional[str] = None):
    """Re-fetch opportunities for an existing profile (with optional country switch)."""
    if profile_id not in _profiles:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = _profiles[profile_id]

    if country_code and country_code.upper() != profile["passport"].get("country", "GHA"):
        # Re-run opportunity agent with new country config
        from backend.orchestrator import run_profile_pipeline
        result = run_profile_pipeline(
            education_level=profile["passport"].get("education_level", ""),
            experience_text=profile["passport"].get("profile_summary", ""),
            country_code=country_code,
        )
        return result.get("opportunities", {})

    return profile.get("opportunities", {})


@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(country_code: str = "GHA"):
    """
    Policymaker dashboard endpoint.
    Returns employment trends, wage data, automation risk + LLM narrative.
    """
    from backend.orchestrator import run_dashboard_pipeline

    logger.info("Dashboard request: country=%s", country_code)
    result = run_dashboard_pipeline(country_code=country_code.upper())
    return DashboardResponse(**result)


@app.post("/api/ingest")
def trigger_ingestion(req: IngestRequest, background_tasks: BackgroundTasks):
    """
    Admin endpoint to trigger the data ingestion pipeline.
    Runs in background so request returns immediately.
    """
    def _run_ingestion():
        from backend.ingestion import run_all, get_db
        from backend.ingestion import fetch_worldbank
        db = get_db()
        if req.countries:
            fetch_worldbank.run(db, countries=req.countries)
        else:
            run_all(skip_esco=req.skip_esco)
        db.close()

    background_tasks.add_task(_run_ingestion)
    return {"status": "ingestion started", "skip_esco": req.skip_esco}


@app.get("/api/configs")
def list_configs():
    """List available country configs."""
    import yaml
    config_dir = os.getenv("CONFIG_DIR", "./config")
    configs = []
    if os.path.exists(config_dir):
        for fname in os.listdir(config_dir):
            if fname.endswith(".yaml"):
                with open(os.path.join(config_dir, fname)) as f:
                    cfg = yaml.safe_load(f)
                    configs.append({
                        "country_code": cfg.get("country_code"),
                        "country_name": cfg.get("country_name"),
                        "region": cfg.get("region"),
                    })
    return {"configs": configs}
