"""
DuckDB structured store — econometric data queries.

All data comes from:
  - data360_indicators  (World Bank Data360 API)
  - automation_risk     (Frey-Osborne via plotly/datasets)
  - wdi_indicators      (World Bank WDI legacy — optional fallback)

ILOSTAT bulk tables (wage_by_sector, sector_employment) have been removed
because the rplumber.ilo.org bulk download endpoint is inaccessible.
"""

import logging
import os
import duckdb

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DUCKDB_PATH", "./data/unmapped.duckdb")

_conn: duckdb.DuckDBPyConnection | None = None


def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        os.makedirs("data", exist_ok=True)
        _conn = duckdb.connect(DB_PATH, read_only=True)
    return _conn


# ---------------------------------------------------------------------------
# Core Data360 queries
# ---------------------------------------------------------------------------

def get_hci(country_code: str) -> dict:
    """
    Latest Data360 indicators for a country as a flat dict.
    Falls back to wdi_indicators table if data360_latest is empty.
    """
    db = get_conn()
    try:
        rows = db.execute("""
            SELECT indicator_label, value, year, indicator_description
            FROM data360_latest
            WHERE country_code = ?
        """, [country_code]).fetchdf()
        if not rows.empty:
            return {
                r["indicator_label"]: {
                    "value": r["value"],
                    "year": int(r["year"]),
                    "description": r["indicator_description"],
                }
                for r in rows.to_dict(orient="records")
            }
    except Exception:
        pass

    # WDI fallback
    try:
        rows = db.execute("""
            SELECT indicator_name, value, year
            FROM wdi_latest
            WHERE country_code = ?
        """, [country_code]).fetchdf()
        return {
            r["indicator_name"]: {"value": r["value"], "year": int(r["year"])}
            for r in rows.to_dict(orient="records")
        }
    except Exception as e:
        logger.warning("get_hci failed for %s: %s", country_code, e)
        return {}


def get_data360_timeseries(
    country_code: str,
    indicator_label: str,
    years: int = 8,
) -> list[dict]:
    """
    Year-by-year values for a single Data360 indicator.
    Returns [{year, value, indicator_label}]
    """
    db = get_conn()
    try:
        rows = db.execute("""
            SELECT year, value, indicator_label
            FROM data360_indicators
            WHERE country_code = ?
              AND indicator_label = ?
              AND sex IN ('_T', '_Z', '')
              AND age IN ('_T', '_Z', '')
            ORDER BY year DESC
            LIMIT ?
        """, [country_code, indicator_label, years]).fetchdf()
        return rows.sort_values("year").to_dict(orient="records")
    except Exception as e:
        logger.warning("timeseries query failed: %s", e)
        return []


def get_multi_indicator_trends(
    country_code: str,
    indicator_labels: list[str],
    years: int = 8,
) -> list[dict]:
    """
    Fetch multiple indicators' time series for chart rendering.
    Returns [{year, indicator_label, value}] sorted by indicator + year.
    """
    db = get_conn()
    if not indicator_labels:
        return []
    placeholders = ", ".join("?" for _ in indicator_labels)
    try:
        rows = db.execute(f"""
            SELECT year, indicator_label, value
            FROM data360_indicators
            WHERE country_code = ?
              AND indicator_label IN ({placeholders})
              AND sex IN ('_T', '_Z', '')
              AND age IN ('_T', '_Z', '')
            ORDER BY indicator_label, year
        """, [country_code, *indicator_labels]).fetchdf()
        return rows.to_dict(orient="records")
    except Exception as e:
        logger.warning("multi_indicator_trends failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Opportunity Matching Agent queries
# (ILOSTAT sector tables removed — return empty, agents handle gracefully)
# ---------------------------------------------------------------------------

def get_wage_by_sector(country_code: str, top_n: int = 10) -> list[dict]:
    """
    Sector-level wage data is not available (ILOSTAT removed).
    Returns empty list — agents will note 'data not available' for this signal.
    """
    return []


def get_sector_growth(country_code: str) -> list[dict]:
    """
    Sector-level employment growth is not available (ILOSTAT removed).
    Returns empty list.
    """
    return []


# ---------------------------------------------------------------------------
# Dashboard Agent queries
# ---------------------------------------------------------------------------

def get_employment_trends(country_code: str, years: int = 8) -> list[dict]:
    """
    Employment-related trends from Data360:
    - wage_workers_pct (formal employment proxy)
    - neet_youth_pct
    - female_labour_participation_pct

    Returns [{year, indicator_label, value}] suitable for line chart.
    """
    indicators = [
        "wage_workers_pct",
        "neet_youth_pct",
        "female_labour_participation_pct",
        "youth_unemployment_pct",
    ]
    return get_multi_indicator_trends(country_code, indicators, years=years)


def get_automation_risk_by_group() -> list[dict]:
    """Average automation risk by ISCO major group (Frey-Osborne)."""
    db = get_conn()
    try:
        rows = db.execute("""
            SELECT isco_major_group, avg_automation_prob, occupation_count
            FROM automation_by_isco
            ORDER BY isco_major_group
        """).fetchdf()
        return rows.to_dict(orient="records")
    except Exception as e:
        logger.warning("automation_by_isco query failed: %s", e)
        return []


def get_wage_trends(country_code: str, years: int = 8) -> list[dict]:
    """
    Wage/income proxies from Data360 over time:
    - gdp_per_capita_usd  (income level proxy)
    - gdp_per_capita_growth_pct  (growth trend)

    Returns [{year, indicator_label, value}].
    """
    indicators = ["gdp_per_capita_usd", "gdp_per_capita_growth_pct"]
    return get_multi_indicator_trends(country_code, indicators, years=years)


def get_digital_trends(country_code: str, years: int = 8) -> list[dict]:
    """Internet penetration trends — proxy for digital readiness."""
    return get_multi_indicator_trends(
        country_code,
        ["internet_users_pct", "fixed_broadband_per100"],
        years=years,
    )
