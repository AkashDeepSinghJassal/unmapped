"""
Fetch labour market data from the World Bank Data360 API.

API base: https://data360api.worldbank.org
Docs:     https://data360api.worldbank.org/swagger

Endpoint used:
  GET /data360/data
    ?DATABASE_ID=<db>
    &INDICATOR=<id>
    &REF_AREA=<iso3>
    &timePeriodFrom=2015
    &timePeriodTo=2024
    &skip=<int>          (pagination, max 1000 per page)

All indicators below were verified live against GHA and BGD
via /data360/searchv2 before inclusion.
"""

import logging
import time
from typing import Optional
import duckdb
import pandas as pd
import requests

logger = logging.getLogger(__name__)

DATA360_BASE = "https://data360api.worldbank.org"
DATA_ENDPOINT = f"{DATA360_BASE}/data360/data"
SEARCH_ENDPOINT = f"{DATA360_BASE}/data360/searchv2"

# ---------------------------------------------------------------------------
# Confirmed indicator registry — verified against Data360 live API
# ---------------------------------------------------------------------------

INDICATORS = [
    # ── Youth Labour ─────────────────────────────────────────────────────────
    {
        "id": "WB_WDI_SL_UEM_1524_NE_ZS",
        "db": "WB_WDI",
        "label": "youth_unemployment_pct",
        "description": "Youth unemployment rate, total (% of youth labour force 15–24), national estimate",
        "category": "youth_labour",
    },
    {
        "id": "WB_WDI_SL_UEM_NEET_ZS",
        "db": "WB_WDI",
        "label": "neet_youth_pct",
        "description": "Share of youth not in education, employment or training (NEET), total %",
        "category": "youth_labour",
    },
    {
        "id": "WB_WDI_SL_UEM_NEET_FE_ZS",
        "db": "WB_WDI",
        "label": "neet_youth_female_pct",
        "description": "NEET, female (% of female youth population)",
        "category": "youth_labour",
    },
    # ── Employment structure ──────────────────────────────────────────────────
    {
        "id": "WB_WDI_SL_EMP_WORK_ZS",
        "db": "WB_WDI",
        "label": "wage_workers_pct",
        "description": "Wage and salaried workers, total (% of total employment), modelled ILO",
        "category": "employment",
    },
    {
        "id": "WB_GS_SL_EMP_WORK_ZS",
        "db": "WB_GS",
        "label": "wage_workers_pct_gs",
        "description": "Wage and salaried workers (% of employment), Global Statistics",
        "category": "employment",
    },
    {
        "id": "WB_GS_SL_ISV_IFRM_ZS",
        "db": "WB_GS",
        "label": "informal_employment_nonagriculture_pct",
        "description": "Informal employment (% of total non-agricultural employment)",
        "category": "employment",
    },
    {
        "id": "WB_INFECDB_INFEMP_P",
        "db": "WB_INFECDB",
        "label": "informal_employment_total_pct",
        "description": "Informal employment (% of total employment), ILO",
        "category": "employment",
    },
    {
        "id": "WB_WDI_SL_TLF_CACT_FE_ZS",
        "db": "WB_WDI",
        "label": "female_labour_participation_pct",
        "description": "Labour force participation rate, female (% ages 15+), modelled ILO",
        "category": "employment",
    },
    # ── Human Capital & Education ────────────────────────────────────────────
    {
        "id": "WB_HCI_HCI",
        "db": "WB_HCI",
        "label": "human_capital_index",
        "description": "Human Capital Index (scale 0–1)",
        "category": "human_capital",
    },
    {
        "id": "WB_WDI_SE_SEC_ENRR",
        "db": "WB_WDI",
        "label": "secondary_school_enrollment_pct",
        "description": "School enrolment, secondary (% gross)",
        "category": "education",
    },
    # ── Digital Readiness ────────────────────────────────────────────────────
    {
        "id": "WB_WDI_IT_NET_USER_ZS",
        "db": "WB_WDI",
        "label": "internet_users_pct",
        "description": "Individuals using the Internet (% of population)",
        "category": "digital",
    },
    {
        "id": "WB_WDI_IT_NET_BBND_P2",
        "db": "WB_WDI",
        "label": "fixed_broadband_per100",
        "description": "Fixed broadband subscriptions (per 100 people)",
        "category": "digital",
    },
    # ── Macro economy ─────────────────────────────────────────────────────────
    {
        "id": "WB_WDI_NY_GDP_PCAP_KD_ZG",
        "db": "WB_WDI",
        "label": "gdp_per_capita_growth_pct",
        "description": "GDP per capita growth (annual %)",
        "category": "macro",
    },
    {
        "id": "WB_WDI_NY_GDP_PCAP_CD",
        "db": "WB_WDI",
        "label": "gdp_per_capita_usd",
        "description": "GDP per capita (current USD)",
        "category": "macro",
    },
]

# Countries to ingest
DEFAULT_COUNTRIES = ["GHA", "BGD", "KEN", "NGA", "ETH", "IND", "PHL", "UGA", "TZA", "MOZ"]

PAGE_SIZE = 1000  # Data360 max per page


# ---------------------------------------------------------------------------
# Core fetch function
# ---------------------------------------------------------------------------

def fetch_data360(
    database_id: str,
    indicator_id: str,
    ref_area: str,
    time_from: str = "2015",
    time_to: str = "2024",
) -> list[dict]:
    """
    Fetch all records for one indicator + country, handling pagination.
    Returns raw Data360 value objects.
    """
    records = []
    skip = 0
    while True:
        params = {
            "DATABASE_ID": database_id,
            "INDICATOR": indicator_id,
            "REF_AREA": ref_area,
            "timePeriodFrom": time_from,
            "timePeriodTo": time_to,
            "skip": skip,
        }
        try:
            r = requests.get(DATA_ENDPOINT, params=params, timeout=30,
                             headers={"accept": "application/json"})
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.warning("Data360 fetch failed %s/%s/%s: %s", database_id, indicator_id, ref_area, e)
            break

        batch = data.get("value", [])
        records.extend(batch)
        total = data.get("count", 0)
        skip += PAGE_SIZE
        if skip >= total or not batch:
            break
        time.sleep(0.05)  # gentle rate limit

    return records


# ---------------------------------------------------------------------------
# Search helper (used during development to discover indicator IDs)
# ---------------------------------------------------------------------------

def search_indicators(query: str, top: int = 10) -> list[dict]:
    """
    Search Data360 for indicators matching a query.
    Returns list of {idno, name, database_id}.
    """
    body = {
        "count": True,
        "select": "series_description/idno,series_description/name,series_description/database_id",
        "search": query,
        "top": top,
        "skip": 0,
    }
    r = requests.post(SEARCH_ENDPOINT, json=body, timeout=20,
                      headers={"Content-Type": "application/json"})
    r.raise_for_status()
    return [
        {
            "idno": v["series_description"]["idno"],
            "name": v["series_description"]["name"],
            "database_id": v["series_description"]["database_id"],
        }
        for v in r.json().get("value", [])
    ]


# ---------------------------------------------------------------------------
# Ingestion — fetch all indicators × all countries, load into DuckDB
# ---------------------------------------------------------------------------

def load_data360(
    db: duckdb.DuckDBPyConnection,
    countries: Optional[list[str]] = None,
    time_from: str = "2015",
    time_to: str = "2024",
):
    """
    Fetch all INDICATORS for all countries and load into DuckDB table
    `data360_indicators` with schema:
      country_code, indicator_id, indicator_label, indicator_description,
      category, year, value, sex, age, urbanisation
    """
    countries = countries or DEFAULT_COUNTRIES
    rows = []

    total_calls = len(INDICATORS) * len(countries)
    done = 0

    for ind in INDICATORS:
        for cc in countries:
            records = fetch_data360(
                database_id=ind["db"],
                indicator_id=ind["id"],
                ref_area=cc,
                time_from=time_from,
                time_to=time_to,
            )
            for rec in records:
                val = rec.get("OBS_VALUE")
                if val is None:
                    continue
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    continue
                rows.append({
                    "country_code": cc,
                    "indicator_id": ind["id"],
                    "indicator_label": ind["label"],
                    "indicator_description": ind["description"],
                    "category": ind["category"],
                    "year": int(rec.get("TIME_PERIOD", 0)),
                    "value": val,
                    "sex": rec.get("SEX", "_T"),
                    "age": rec.get("AGE", "_T"),
                    "urbanisation": rec.get("URBANISATION", "_T"),
                    "database_id": ind["db"],
                })
            done += 1
            if done % 10 == 0:
                logger.info("Data360 progress: %d/%d calls done (%d rows so far)",
                            done, total_calls, len(rows))
            time.sleep(0.05)

    if not rows:
        logger.warning("No Data360 rows fetched — check connectivity and country codes")
        return

    df = pd.DataFrame(rows)

    # Create table if it doesn't exist, otherwise delete old rows for the
    # affected countries and re-insert — preserves data for other countries.
    existing = db.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name='data360_indicators'"
    ).fetchone()[0]

    if existing:
        affected = df["country_code"].unique().tolist()
        placeholders = ", ".join("?" * len(affected))
        db.execute(
            f"DELETE FROM data360_indicators WHERE country_code IN ({placeholders})",
            affected,
        )
        db.execute("INSERT INTO data360_indicators SELECT * FROM df")
    else:
        db.execute("CREATE TABLE data360_indicators AS SELECT * FROM df")

    total_rows = db.execute("SELECT count(*) FROM data360_indicators").fetchone()[0]
    logger.info(
        "Loaded data360_indicators: %d new rows (table total: %d), %d indicators",
        len(df), total_rows, df["indicator_id"].nunique(),
    )

    # Convenience view: latest value per indicator per country
    db.execute("""
        CREATE OR REPLACE VIEW data360_latest AS
        SELECT
            country_code,
            indicator_id,
            indicator_label,
            indicator_description,
            category,
            value,
            year
        FROM data360_indicators d1
        WHERE sex IN ('_T', '_Z', '')
          AND age IN ('_T', '_Z', '')
          AND year = (
              SELECT MAX(year)
              FROM data360_indicators d2
              WHERE d2.country_code = d1.country_code
                AND d2.indicator_id = d1.indicator_id
                AND d2.sex IN ('_T', '_Z', '')
          )
    """)

    # Convenience view: youth-specific indicators
    db.execute("""
        CREATE OR REPLACE VIEW data360_youth_signals AS
        SELECT
            country_code,
            indicator_label,
            indicator_description,
            value,
            year
        FROM data360_latest
        WHERE category IN ('youth_labour', 'human_capital', 'digital', 'education')
        ORDER BY country_code, category, indicator_label
    """)

    logger.info("Created data360_latest and data360_youth_signals views")


def get_country_signals(country_code: str, db: duckdb.DuckDBPyConnection) -> dict:
    """
    Return latest Data360 signals for a country as a flat dict.
    Used by opportunity and dashboard agents.
    """
    try:
        rows = db.execute("""
            SELECT indicator_label, value, year, indicator_description, category
            FROM data360_latest
            WHERE country_code = ?
            ORDER BY category, indicator_label
        """, [country_code]).fetchdf()
        return {
            row["indicator_label"]: {
                "value": row["value"],
                "year": row["year"],
                "description": row["indicator_description"],
                "category": row["category"],
            }
            for row in rows.to_dict(orient="records")
        }
    except Exception as e:
        logger.warning("data360_latest query failed: %s", e)
        return {}


def run(db: duckdb.DuckDBPyConnection, countries: Optional[list[str]] = None):
    load_data360(db, countries=countries)
