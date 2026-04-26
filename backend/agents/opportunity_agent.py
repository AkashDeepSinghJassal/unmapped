"""
Opportunity Matching Agent — Module 3 (youth view).

Takes a Skills Passport + country config, queries DuckDB for real
econometric signals, then calls an LLM to rank realistic opportunities.
Always surfaces ≥2 visible econometric signals per opportunity.
"""

import json
import logging

from backend.rag.duckdb_store import get_wage_by_sector, get_sector_growth, get_hci
from backend.services.llm import generate_text, active_provider

logger = logging.getLogger(__name__)

ISCO_LABELS = {
    1: "Managers",
    2: "Professionals",
    3: "Technicians and Associate Professionals",
    4: "Clerical Support Workers",
    5: "Service and Sales Workers",
    6: "Skilled Agricultural Workers",
    7: "Craft and Related Trades Workers",
    8: "Plant and Machine Operators",
    9: "Elementary Occupations",
}


OPPORTUNITY_PROMPT = """
You are a realistic labour market advisor for youth in low/middle-income countries.

== Skills Profile ==
ISCO Group: {isco_group} — {isco_label}
Top Skills: {skills_list}
Education: {education_level}
Country: {country_name} ({country_code})
Opportunity modes available: {opportunity_modes}

== Real Labour Market Data ==
Wages by sector (latest year, avg monthly earnings):
{wage_data}

Sector employment growth (year-over-year %):
{growth_data}

Country indicators:
{hci_data}

== Your Task ==
Based on the skills profile and the REAL economic data above, suggest 5 concrete, realistic opportunities.
These must be achievable without additional credentials (or with short upskilling).

For EACH opportunity, provide:
- title: specific job/gig/training title (not generic)
- type: one of formal_job / gig / self_employment / training
- sector: the sector this falls under
- wage_floor_signal: exact wage figure from the data above (with source + year)
- growth_signal: employment growth % from the data above (with source + year)
- fit_score: 0–10, how well it matches the skills profile
- gap: what single skill/credential is still needed (if any)
- plain_explanation: 2 sentences, plain language, why this fits this person

RULES:
- Do NOT invent wages. Use ONLY numbers from the data provided above.
- If wage data is unavailable for a sector, say "data not available" for that field.
- Always include at least 2 visible econometric signals (wage or growth) per opportunity.

Respond ONLY in this exact JSON (no markdown fences):
{{
  "opportunities": [
    {{
      "title": "<string>",
      "type": "<formal_job|gig|self_employment|training>",
      "sector": "<string>",
      "wage_floor_signal": {{
        "value": <number or null>,
        "currency": "<string>",
        "period": "monthly",
        "source": "ILOSTAT",
        "year": <int or null>
      }},
      "growth_signal": {{
        "value": <number or null>,
        "unit": "% year-over-year",
        "source": "ILOSTAT",
        "year": <int or null>
      }},
      "fit_score": <int 0-10>,
      "gap": "<string or null>",
      "plain_explanation": "<string>"
    }}
  ],
  "econometric_summary": "<2 sentences summarising the key labour market signals for this country>",
  "data_note": "<one sentence on what data is and isn't available>"
}}
"""


def _format_wage_data(wages: list[dict]) -> str:
    if not wages:
        return "No wage data available for this country."
    lines = []
    for w in wages[:8]:
        lines.append(
            f"  Sector {w.get('sector_code','?')}: "
            f"{w.get('avg_monthly_wage','N/A')} (year {w.get('year','?')})"
        )
    return "\n".join(lines)


def _format_growth_data(growth: list[dict]) -> str:
    if not growth:
        return "No employment growth data available."
    lines = []
    seen = set()
    for g in growth:
        sc = g.get("sector_code", "?")
        if sc in seen:
            continue
        seen.add(sc)
        lines.append(
            f"  Sector {sc}: {g.get('yoy_growth_pct','N/A')}% growth (year {g.get('year','?')})"
        )
        if len(lines) >= 8:
            break
    return "\n".join(lines)


def _format_hci(hci: dict) -> str:
    if not hci:
        return "No WDI indicator data available."
    lines = []
    for name, v in hci.items():
        lines.append(f"  {name}: {v['value']:.2f} (year {v['year']})")
    return "\n".join(lines)


def run(passport: dict, country_config: dict) -> dict:
    """
    Run the Opportunity Matching Agent.

    Args:
        passport: output of skills_agent.run()
        country_config: loaded from config/{country}.yaml

    Returns:
        Dict with opportunities list and econometric summary.
    """
    country_code = country_config.get("country_code", "GHA")
    country_name = country_config.get("country_name", "Ghana")
    opportunity_modes = country_config.get("opportunity_modes", ["formal_job", "gig", "training"])

    # Fetch real econometric data
    wages = get_wage_by_sector(country_code, top_n=10)
    growth = get_sector_growth(country_code)
    hci = get_hci(country_code)   # Data360 preferred, WDI fallback

    skills_list = ", ".join(
        s.get("label", "") for s in passport.get("mapped_skills", [])[:5]
    )
    isco_group = passport.get("isco_major_group", 9)
    isco_label = ISCO_LABELS.get(isco_group, "Unknown")

    # Format Data360 signals for prompt — highlight youth-specific data
    youth_signals = ""
    for k, v in hci.items():
        if any(x in k for x in ["neet", "youth", "human_capital", "internet", "informal"]):
            youth_signals += f"  {k}: {v.get('value', 'N/A'):.2f} ({v.get('year', '?')})\n"

    prompt = OPPORTUNITY_PROMPT.format(
        isco_group=isco_group,
        isco_label=isco_label,
        skills_list=skills_list or "General skills",
        education_level=passport.get("education_level", "Secondary"),
        country_code=country_code,
        country_name=country_name,
        opportunity_modes=", ".join(opportunity_modes),
        wage_data=_format_wage_data(wages),
        growth_data=_format_growth_data(growth),
        hci_data=_format_hci(hci) + (f"\nYouth-specific signals (Data360):\n{youth_signals}" if youth_signals else ""),
    )

    try:
        raw = generate_text(prompt)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
    except Exception as e:
        logger.error("Opportunity agent failed: %s", e)
        result = {
            "opportunities": [],
            "econometric_summary": "Data retrieval error — please try again.",
            "data_note": str(e),
        }

    # Attach raw signal data for frontend charts
    result["raw_signals"] = {
        "wages": wages[:5],
        "growth": growth[:5],
        "hci": hci,
    }
    result["country_code"] = country_code
    result["data_sources"] = ["ILOSTAT bulk download", "World Bank WDI API", active_provider()]
    return result
