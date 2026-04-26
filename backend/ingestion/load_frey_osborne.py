"""
Load Frey & Osborne (2013) automation probability scores by occupation.
Source: plotly/datasets GitHub (public CSV mirror of the original paper data).
URL: https://raw.githubusercontent.com/plotly/datasets/master/job-automation-probability.csv
Columns: rank, code (SOC), prob, average_ann_wage, education, occupation, ...
"""

import logging
import duckdb
import pandas as pd
import requests

logger = logging.getLogger(__name__)

FO_URL = (
    "https://raw.githubusercontent.com/plotly/datasets"
    "/master/job-automation-probability.csv"
)

# BLS SOC to ISCO-08 broad group mapping (hand-mapped top-level groups)
# SOC major group prefix -> ISCO-08 major group
SOC_TO_ISCO_BROAD = {
    "11": 1,  # Management -> Managers
    "13": 2,  # Business/Financial -> Professionals
    "15": 2,  # Computer/Math -> Professionals
    "17": 2,  # Architecture/Engineering -> Professionals
    "19": 2,  # Life/Physical/Social Science -> Professionals
    "21": 2,  # Community/Social Service -> Professionals
    "23": 2,  # Legal -> Professionals
    "25": 2,  # Education -> Professionals
    "27": 2,  # Arts/Design/Media -> Professionals
    "29": 2,  # Healthcare Practitioner -> Professionals
    "31": 3,  # Healthcare Support -> Technicians
    "33": 3,  # Protective Service -> Technicians
    "35": 5,  # Food Prep/Serving -> Service workers
    "37": 5,  # Building/Grounds -> Service workers
    "39": 5,  # Personal Care -> Service workers
    "41": 4,  # Sales -> Clerical/Sales
    "43": 4,  # Office/Admin -> Clerical/Sales
    "45": 6,  # Farming/Fishing -> Agricultural
    "47": 7,  # Construction/Extraction -> Craft
    "49": 7,  # Installation/Maintenance -> Craft
    "51": 8,  # Production -> Operators
    "53": 9,  # Transportation -> Elementary
}


def load_frey_osborne(db: duckdb.DuckDBPyConnection):
    logger.info("Fetching Frey-Osborne data from %s", FO_URL)
    r = requests.get(FO_URL, timeout=30)
    r.raise_for_status()
    df = pd.read_csv(pd.io.common.BytesIO(r.content))

    # Normalize column names (the CSV has a few naming variants)
    # Actual CSV columns (verified live):
    #   '_ - rank', '_ - code', 'prob', 'Average annual wage',
    #   'occupation', 'probability', 'average_ann_wage', ...
    df = df.rename(columns={
        "_ - code":         "soc_code",
        "prob":             "automation_prob",
        "occupation":       "occupation",
        "average_ann_wage": "avg_annual_wage_usd",
    })

    needed = [c for c in ["soc_code", "automation_prob", "occupation", "avg_annual_wage_usd"]
              if c in df.columns]
    df = df[needed].dropna(subset=["soc_code", "automation_prob"])
    df["soc_code"] = df["soc_code"].astype(str).str.strip()
    df["automation_prob"] = pd.to_numeric(df["automation_prob"], errors="coerce")
    df = df.dropna(subset=["automation_prob"])

    # Add ISCO-08 broad group
    def soc_to_isco(soc: str) -> int:
        prefix = soc.replace("-", "")[:2]
        return SOC_TO_ISCO_BROAD.get(prefix, 9)

    df["isco_major_group"] = df["soc_code"].apply(soc_to_isco)

    db.execute("CREATE OR REPLACE TABLE automation_risk AS SELECT * FROM df")
    logger.info("Loaded automation_risk: %d occupations", len(df))

    # Create a view: average automation risk per ISCO major group
    db.execute("""
        CREATE OR REPLACE VIEW automation_by_isco AS
        SELECT
            isco_major_group,
            ROUND(AVG(automation_prob), 3) AS avg_automation_prob,
            COUNT(*) AS occupation_count
        FROM automation_risk
        GROUP BY isco_major_group
        ORDER BY isco_major_group
    """)
    logger.info("Created automation_by_isco view")


def run(db: duckdb.DuckDBPyConnection):
    load_frey_osborne(db)
