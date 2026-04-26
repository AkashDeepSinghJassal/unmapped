"""
LangGraph orchestrator — wires the three agents into a StateGraph.

Flow:
  profile_form → skills_node → opportunity_node → END
  dashboard_node runs independently (triggered by GET /api/dashboard)
"""

import logging
import os
from typing import TypedDict, Any

import yaml
from langgraph.graph import StateGraph, END

from backend.agents import skills_agent, opportunity_agent, dashboard_agent

logger = logging.getLogger(__name__)

CONFIG_DIR = os.getenv("CONFIG_DIR", "./config")


# ---------------------------------------------------------------------------
# Shared state schema
# ---------------------------------------------------------------------------

class AgentState(TypedDict):
    # Inputs
    education_level: str
    experience_text: str
    country_code: str

    # Intermediate
    country_config: dict[str, Any]
    passport: dict[str, Any]

    # Outputs
    opportunities: dict[str, Any]
    error: str | None


# ---------------------------------------------------------------------------
# Node functions
# ---------------------------------------------------------------------------

def load_config_node(state: AgentState) -> AgentState:
    """Load country YAML config based on country_code."""
    country_code = state.get("country_code", "GHA").upper()
    config_path = os.path.join(CONFIG_DIR, f"{country_code.lower()}.yaml")
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = yaml.safe_load(f)
    else:
        logger.warning("No config for %s — using defaults", country_code)
        config = {
            "country_code": country_code,
            "country_name": country_code,
            "opportunity_modes": ["formal_job", "gig", "training"],
        }
    return {**state, "country_config": config}


def skills_node(state: AgentState) -> AgentState:
    """Run Skills Signal Agent → produce Skills Passport."""
    logger.info("Running Skills Signal Agent for country=%s", state.get("country_code"))
    try:
        passport = skills_agent.run(
            education_level=state["education_level"],
            experience_text=state["experience_text"],
            country=state.get("country_code", "GHA"),
        )
        return {**state, "passport": passport, "error": None}
    except Exception as e:
        logger.error("Skills node failed: %s", e)
        return {**state, "passport": {}, "error": str(e)}


def opportunity_node(state: AgentState) -> AgentState:
    """Run Opportunity Matching Agent → produce ranked opportunities."""
    logger.info("Running Opportunity Matching Agent")
    if state.get("error") or not state.get("passport"):
        return {**state, "opportunities": {}}
    try:
        opps = opportunity_agent.run(
            passport=state["passport"],
            country_config=state["country_config"],
        )
        return {**state, "opportunities": opps}
    except Exception as e:
        logger.error("Opportunity node failed: %s", e)
        return {**state, "opportunities": {}, "error": str(e)}


# ---------------------------------------------------------------------------
# Build the profile graph
# ---------------------------------------------------------------------------

def build_profile_graph() -> Any:
    """Build and compile the profile → opportunities graph."""
    graph = StateGraph(AgentState)

    graph.add_node("load_config", load_config_node)
    graph.add_node("skills", skills_node)
    graph.add_node("opportunity", opportunity_node)

    graph.set_entry_point("load_config")
    graph.add_edge("load_config", "skills")
    graph.add_edge("skills", "opportunity")
    graph.add_edge("opportunity", END)

    return graph.compile()


# Singleton compiled graph
_profile_graph = None


def get_profile_graph():
    global _profile_graph
    if _profile_graph is None:
        _profile_graph = build_profile_graph()
    return _profile_graph


# ---------------------------------------------------------------------------
# Public runner functions
# ---------------------------------------------------------------------------

def run_profile_pipeline(
    education_level: str,
    experience_text: str,
    country_code: str = "GHA",
) -> dict:
    """
    Run the full profile pipeline: config → skills → opportunities.
    Returns combined result dict.
    """
    graph = get_profile_graph()
    initial_state: AgentState = {
        "education_level": education_level,
        "experience_text": experience_text,
        "country_code": country_code.upper(),
        "country_config": {},
        "passport": {},
        "opportunities": {},
        "error": None,
    }
    final_state = graph.invoke(initial_state)
    return {
        "passport": final_state.get("passport", {}),
        "opportunities": final_state.get("opportunities", {}),
        "error": final_state.get("error"),
    }


def run_dashboard_pipeline(country_code: str) -> dict:
    """
    Run the Dashboard Agent independently.
    """
    config_path = os.path.join(CONFIG_DIR, f"{country_code.lower()}.yaml")
    country_name = country_code
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = yaml.safe_load(f)
            country_name = config.get("country_name", country_code)

    return dashboard_agent.run(
        country_code=country_code.upper(),
        country_name=country_name,
    )
