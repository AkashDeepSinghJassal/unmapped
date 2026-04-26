"""
Fetch World Bank WDI indicators for target countries.
API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581
No API key required — World Bank API is public.
"""

import logging
import time
import duckdb
import pandas as pd
import requests

logger = logging.getLogger(__name__)

WB_BASE = "https://api.worldbank.org/v2"

# Indicators we care about
INDICATORS = {
    "SL.GDP.PCAP.EM.KD": "gdp_per_worker_2017usd",
    "HD.HCI.OVRL": "human_capital_index",
    "SL.IND.EMPL.ZS": "industry_employment_pct",
    "SL.SRV.EMPL.ZS": "services_employment_pct",
    "SL.AGR.EMPL.ZS": "agriculture_employment_pct",
    "SL.UEM.TOTL.ZS": "unemployment_rate_pct",
    "SE.SEC.ENRR": "secondary_school_enrollment_pct",
}

TARGET_COUNTRIES = ["GHA", "BGD", "KEN", "NGA", "ETH", "IND", "PHL"]


def fetch_wb_indicator(country_code: str, indicator: str) -> list[dict]:
    url = f"{WB_BASE}/country/{country_code.lower()}/indicator/{indicator}"
    params = {"format": "json", "date": "2015:2024", "per_page": 50}
    try:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        if len(data) < 2 or data[1] is None:
            return []
        return data[1]
    except Exception as e:
        logger.warning("WB fetch failed for %s/%s: %s", country_code, indicator, e)
        return []


def load_wdi(db: duckdb.DuckDBPyConnection, countries: list[str] | None = None):
    """
    Fetch all WDI indicators for target countries and store in DuckDB.
    """
    countries = countries or TARGET_COUNTRIES
    rows = []
    for cc in countries:
        for ind_code, col_name in INDICATORS.items():
            records = fetch_wb_indicator(cc, ind_code)
            for rec in records:
                if rec.get("value") is not None:
                    rows.append(
                        {
                            "country_code": cc,
                            "indicator_code": ind_code,
                            "indicator_name": col_name,
                            "year": int(rec["date"]),
                            "value": float(rec["value"]),
                        }
                    )
            time.sleep(0.1)  # gentle rate limiting

    df = pd.DataFrame(rows)
    db.execute("CREATE OR REPLACE TABLE wdi_indicators AS SELECT * FROM df")
    logger.info("Loaded wdi_indicators: %d rows for %d countries", len(df), len(countries))

    # Also create a pivoted view for easy lookup
    db.execute("""
        CREATE OR REPLACE VIEW wdi_latest AS
        SELECT country_code, indicator_name, value, year
        FROM wdi_indicators w1
        WHERE year = (
            SELECT MAX(year) FROM wdi_indicators w2
            WHERE w2.country_code = w1.country_code
              AND w2.indicator_name = w1.indicator_name
        )
    """)
    logger.info("Created wdi_latest view")


def run(db: duckdb.DuckDBPyConnection, countries: list[str] | None = None):
    load_wdi(db, countries)
