"""
Econometric Dashboard Agent — Module 3 (policymaker view).

Queries DuckDB for aggregate labour market signals and returns
chart-ready data + an LLM-generated insight narrative.
"""

import json
import logging

from backend.rag.duckdb_store import (
    get_employment_trends,
    get_automation_risk_by_group,
    get_wage_trends,
    get_digital_trends,
    get_hci,
)
from backend.services.llm import generate_text

logger = logging.getLogger(__name__)

ISCO_LABELS = {
    1: "Managers", 2: "Professionals", 3: "Technicians",
    4: "Clerical Workers", 5: "Service & Sales", 6: "Agricultural",
    7: "Craft & Trades", 8: "Operators", 9: "Elementary",
}

NARRATIVE_PROMPT = """
You are a labour market economist advising a government minister in {country_name}.

Here is the current economic data for {country_name}:

== Employment trends (sector, year, thousands employed) ==
{employment_trends}

== Wage trends by sector (avg monthly earnings) ==
{wage_trends}

== Automation risk by ISCO occupational group ==
{automation_risk}

== Key macro indicators ==
{hci_data}

Write a concise policymaker briefing (4–6 sentences) covering:
1. Which sectors are growing in employment
2. Where wages are highest vs lowest
3. Which worker groups face the highest automation risk
4. One concrete policy recommendation for youth workforce development

Be specific — cite actual numbers from the data. Do NOT use generic statements.
Respond with plain text only (no JSON, no headers).
"""


def run(country_code: str, country_name: str | None = None) -> dict:
    """
    Run the Econometric Dashboard Agent.

    Returns:
        Dict with chart data arrays and LLM narrative.
    """
    country_name = country_name or country_code

    # Fetch all data (Data360 + Frey-Osborne; ILOSTAT removed)
    emp_trends = get_employment_trends(country_code, years=8)
    wage_trends = get_wage_trends(country_code, years=8)
    digital_trends = get_digital_trends(country_code, years=8)
    automation = get_automation_risk_by_group()
    hci = get_hci(country_code)

    # Format for LLM prompt
    def fmt_list(rows: list[dict], max_rows: int = 15) -> str:
        if not rows:
            return "No data available."
        return "\n".join(str(r) for r in rows[:max_rows])

    hci_str = "\n".join(
        f"  {k} ({v.get('year','?')}): {float(v['value']):.2f}"
        for k, v in hci.items()
        if v.get("value") is not None
    ) if hci else "No data available."

    automation_str = "\n".join(
        f"  ISCO group {r['isco_major_group']} ({ISCO_LABELS.get(r['isco_major_group'], '?')}): "
        f"avg automation prob = {r['avg_automation_prob']}"
        for r in automation
    ) if automation else "No data available."

    prompt = NARRATIVE_PROMPT.format(
        country_name=country_name,
        employment_trends=fmt_list(emp_trends),
        wage_trends=fmt_list(wage_trends) + "\nDigital trends:\n" + fmt_list(digital_trends, 8),
        automation_risk=automation_str,
        hci_data=hci_str,
    )

    try:
        narrative = generate_text(prompt)
    except Exception as e:
        logger.error("Dashboard agent LLM failed: %s", e)
        narrative = "Narrative generation failed. See raw data below."

    # Build chart-ready payloads
    # Employment chart: [{year, indicator_label, value}] — Data360 time series
    employment_chart = emp_trends

    # Income/GDP chart: [{year, indicator_label, value}] — Data360 time series
    wage_chart = wage_trends + digital_trends

    # Automation risk chart: [{label, avg_automation_prob}]
    automation_chart = [
        {
            "label": ISCO_LABELS.get(r["isco_major_group"], f"Group {r['isco_major_group']}"),
            "isco_group": r["isco_major_group"],
            "avg_automation_prob": r["avg_automation_prob"],
        }
        for r in automation
    ]

    # Key signals for top-of-dashboard callouts
    # Prefer Data360 indicators (labelled by their indicator_label key)
    key_signals = []

    DATA360_CALLOUTS = [
        ("human_capital_index",      "Human Capital Index",          None,  "WB_HCI (Data360)"),
        ("neet_youth_pct",           "Youth NEET Rate",              "%",   "WB_WDI (Data360)"),
        ("youth_unemployment_pct",   "Youth Unemployment",           "%",   "WB_WDI (Data360)"),
        ("internet_users_pct",       "Internet Users",               "%",   "WB_WDI (Data360)"),
        ("informal_employment_total_pct", "Informal Employment",     "%",   "WB_INFECDB (Data360)"),
    ]

    for label_key, display_label, unit, source in DATA360_CALLOUTS:
        if label_key in hci and len(key_signals) < 4:
            v = hci[label_key]
            key_signals.append({
                "label": display_label,
                "value": round(float(v["value"]), 2) if v["value"] is not None else None,
                "unit": unit,
                "year": v.get("year"),
                "source": source,
            })

    # Fill remaining slots with ILOSTAT/Frey-Osborne if Data360 didn't provide 4
    if wage_trends and len(key_signals) < 4:
        max_wage = max(wage_trends, key=lambda x: x.get("avg_monthly_wage") or 0)
        key_signals.append({
            "label": f"Highest Avg Wage ({max_wage['sector_code']})",
            "value": max_wage.get("avg_monthly_wage"),
            "year": max_wage.get("year"),
            "source": "ILOSTAT",
        })
    if automation and len(key_signals) < 4:
        max_risk = max(automation, key=lambda x: x["avg_automation_prob"])
        key_signals.append({
            "label": f"Peak Automation Risk (ISCO {max_risk['isco_major_group']})",
            "value": round(max_risk["avg_automation_prob"] * 100, 1),
            "unit": "%",
            "source": "Frey & Osborne (2013)",
        })

    return {
        "country_code": country_code,
        "country_name": country_name,
        "narrative": narrative,
        "key_signals": key_signals,
        "charts": {
            "employment_trends": employment_chart,
            "wage_trends": wage_chart,
            "automation_risk": automation_chart,
        },
        "data_sources": [
            "World Bank Data360 API (data360api.worldbank.org)",
            "World Bank HCI database (WB_HCI via Data360)",
            "World Bank WDI API (api.worldbank.org)",
            "Frey & Osborne (2013) via plotly/datasets",
        ],
    }
