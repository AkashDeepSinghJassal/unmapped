"""
Skills Signal Agent — Module 1.

Takes a youth user's free-text description of education + experience,
maps it to ESCO skill codes via ChromaDB vector search + an LLM,
and emits a portable Skills Passport JSON.
"""

import json
import logging

from backend.rag.chroma_store import search_skills
from backend.ingestion.embed_esco import search_esco_api
from backend.services.llm import generate_text, active_provider

logger = logging.getLogger(__name__)


SKILLS_PROMPT = """
You are an expert labour market analyst helping map informal youth skills to the ESCO taxonomy.

A young person has described their background:
---
Education level: {education_level}
Work experience and skills: {experience_text}
Country: {country}
---

Below are the top ESCO matches (skills and occupations) retrieved by semantic search:
{esco_matches}

Each entry is tagged [skill] or [occupation].

Your task:
1. Select the 5 most relevant ESCO *skills* from the list above that match this person's actual experience.
2. For each skill, assign a confidence score (0.0–1.0) and explain in ONE plain sentence why this skill applies.
3. Also suggest 2–3 "adjacent skills" the person could realistically develop next (can be from the occupation context).
4. Assign the person an ISCO-08 major group (1–9) that best represents their current work profile.

Respond ONLY in this exact JSON format (no markdown fences):
{{
  "isco_major_group": <int>,
  "isco_label": "<string>",
  "mapped_skills": [
    {{
      "uri": "<ESCO URI>",
      "label": "<skill label>",
      "confidence": <float 0-1>,
      "why": "<one sentence explanation>"
    }}
  ],
  "adjacent_skills": [
    {{
      "label": "<skill label>",
      "rationale": "<why this is a natural next step>"
    }}
  ],
  "profile_summary": "<2-3 sentence plain-language summary of this person's skills>"
}}
"""


def run(
    education_level: str,
    experience_text: str,
    country: str = "GHA",
) -> dict:
    """
    Run the Skills Signal Agent.

    Args:
        education_level: e.g. "Senior high school (SHS)"
        experience_text: free-text description of work + informal skills
        country: ISO3 country code

    Returns:
        Skills Passport dict with mapped skills, ISCO group, adjacent skills, summary.
    """
    # Step 1: Vector search ChromaDB — fetch skills and related occupations separately
    query = f"{education_level}. {experience_text}"
    skill_results = search_skills(query, n_results=10, uri_type="skill")
    occ_results   = search_skills(query, n_results=4,  uri_type="occupation")
    chroma_results = skill_results + occ_results

    # Step 2: Fallback to ESCO REST API if ChromaDB is empty
    if not chroma_results:
        logger.info("ChromaDB empty — falling back to ESCO REST API")
        api_results = search_esco_api(experience_text, limit=12)
        esco_matches_text = "\n".join(
            f"- [{r['uri']}] {r['label']}: {r['description'][:150]}"
            for r in api_results
        )
    else:
        esco_matches_text = "\n".join(
            f"- [{r['uri']}] [{r.get('uri_type','skill')}] {r['label']}: {r['description'][:150]}"
            for r in chroma_results
        )

    # Step 3: Call Gemini to map skills
    prompt = SKILLS_PROMPT.format(
        education_level=education_level,
        experience_text=experience_text,
        country=country,
        esco_matches=esco_matches_text,
    )

    try:
        raw = generate_text(prompt)
        # Strip potential markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        passport = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("LLM returned invalid JSON: %s\nRaw: %s", e, raw[:500])
        passport = _fallback_passport(education_level, experience_text, chroma_results)
    except Exception as e:
        logger.error("Skills agent LLM call failed: %s", e)
        passport = _fallback_passport(education_level, experience_text, chroma_results)

    # Enrich with input metadata
    passport["education_level"] = education_level
    passport["country"] = country
    passport["data_sources"] = ["ESCO v1.2.1", active_provider()]
    passport["limitations"] = (
        "Skill mapping is based on free-text description and may miss unlisted competencies. "
        "Confidence scores are model estimates, not verified assessments."
    )
    return passport


def _fallback_passport(education_level: str, experience_text: str, chroma_results: list) -> dict:
    """Return a minimal passport when LLM fails."""
    return {
        "isco_major_group": 9,
        "isco_label": "Elementary occupations",
        "mapped_skills": [
            {
                "uri": r["uri"],
                "label": r["label"],
                "confidence": round(1 - r["distance"], 2),
                "why": "Matched by semantic similarity to your description.",
            }
            for r in chroma_results[:5]
        ],
        "adjacent_skills": [],
        "profile_summary": f"Profile based on: {education_level}. {experience_text[:100]}",
    }
