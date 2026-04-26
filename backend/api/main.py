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
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
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


class ChatMessageRequest(BaseModel):
    session_id: str = Field(..., description="Client-generated UUID for this conversation")
    message: str    = Field(..., description="User's message")
    country_code: str = Field(default="GHA", description="ISO3 country code")


class ChatMessageResponse(BaseModel):
    reply: str
    is_complete: bool
    profile_id: Optional[str] = None
    passport: Optional[dict] = None
    opportunities: Optional[dict] = None
    error: Optional[str] = None


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


@app.post("/api/chat", response_model=ChatMessageResponse)
def chat_message(req: ChatMessageRequest):
    """
    Conversational intake endpoint.
    Maintains multi-turn conversation history per session_id.
    When the chat agent has gathered enough information, it triggers the full
    Skills + Opportunity pipeline and returns the analysis in the same response.
    """
    from backend.agents import chat_agent
    from backend.orchestrator import run_profile_pipeline

    logger.info("Chat message: session=%s country=%s", req.session_id, req.country_code)

    chat_result = chat_agent.process_message(
        session_id=req.session_id,
        message=req.message,
        country=req.country_code,
    )

    if not chat_result["is_complete"]:
        return ChatMessageResponse(
            reply=chat_result["reply"],
            is_complete=False,
        )

    # Chat collected enough info — run the full pipeline
    try:
        pipeline_result = run_profile_pipeline(
            education_level=chat_result["education_level"],
            experience_text=chat_result["experience_text"],
            country_code=req.country_code,
        )
        profile_id = str(uuid.uuid4())
        _profiles[profile_id] = pipeline_result

        return ChatMessageResponse(
            reply=chat_result["reply"],
            is_complete=True,
            profile_id=profile_id,
            passport=pipeline_result.get("passport", {}),
            opportunities=pipeline_result.get("opportunities", {}),
            error=pipeline_result.get("error"),
        )
    except Exception as e:
        logger.error("Chat pipeline failed: %s", e)
        return ChatMessageResponse(
            reply=chat_result["reply"],
            is_complete=True,
            error=str(e),
        )


@app.post("/api/parse-cv")
async def parse_cv_endpoint(file: UploadFile = File(...)):
    """
    Upload a CV (PDF / DOCX / TXT) and extract education_level + experience_text.
    Uses the configured LLM provider.
    """
    from backend.services.cv_parser import extract_text_from_file, parse_cv

    ALLOWED_TYPES = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
    }
    MAX_SIZE_MB = 5

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {MAX_SIZE_MB} MB)")

    filename = file.filename or "upload.txt"
    cv_text  = extract_text_from_file(content, filename)
    if not cv_text:
        raise HTTPException(422, "Could not extract text from CV. Supported: PDF, DOCX, TXT")

    result = parse_cv(cv_text)
    return {
        "education_level":  result.get("education_level", ""),
        "experience_text":  result.get("experience_text", ""),
        "chars_extracted":  len(cv_text),
        "filename":         filename,
    }


@app.delete("/api/chat/{session_id}")
def reset_chat(session_id: str):
    """Clear conversation history for a session (start over)."""
    from backend.agents import chat_agent
    chat_agent.reset_session(session_id)
    return {"status": "cleared", "session_id": session_id}


@app.post("/api/ingest")
def trigger_ingestion(req: IngestRequest, background_tasks: BackgroundTasks):
    """
    Admin endpoint to trigger the data ingestion pipeline.
    Runs in background so request returns immediately.
    """
    def _run_ingestion():
        from backend.ingestion import run_all, get_db
        from backend.ingestion import fetch_worldbank, fetch_data360
        db = get_db()
        if req.countries:
            logger.info("Ingesting Data360 + WDI for countries: %s", req.countries)
            fetch_data360.run(db, countries=req.countries)
            fetch_worldbank.run(db, countries=req.countries)
        else:
            run_all(skip_esco=req.skip_esco)
        db.close()

    background_tasks.add_task(_run_ingestion)
    return {"status": "ingestion started", "skip_esco": req.skip_esco}


@app.get("/api/signals")
def get_signals(country_code: str = "GHA"):
    """
    Return all Data360 indicator signals for a country as a flat dict.
    Used by the Regional Compare tab.
    Schema: { indicator_label: { value, year, description, category } }
    """
    from backend.ingestion import get_db
    from backend.ingestion.fetch_data360 import get_country_signals

    db = get_db()
    try:
        signals = get_country_signals(country_code.upper(), db)
    finally:
        pass  # connection is shared/cached — don't close

    return {"country_code": country_code.upper(), "signals": signals}


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
