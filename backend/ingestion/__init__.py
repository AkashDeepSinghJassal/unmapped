"""Data ingestion pipeline — populates DuckDB + ChromaDB.

Sources:
  - World Bank Data360 API  (data360api.worldbank.org)  — primary labour signals
  - World Bank WDI API      (api.worldbank.org)         — legacy fallback
  - Frey-Osborne CSV        (plotly/datasets GitHub)    — automation risk
  - ESCO skills_en.csv      (manual download)           — skills taxonomy embeddings

ILOSTAT bulk download has been removed (rplumber.ilo.org not accessible).
"""

import logging
import os
import duckdb

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DUCKDB_PATH", "./data/unmapped.duckdb")


def get_db() -> duckdb.DuckDBPyConnection:
    os.makedirs("data", exist_ok=True)
    return duckdb.connect(DB_PATH)


def run_all(skip_esco: bool = False, countries: list[str] | None = None):
    """
    Run full ingestion pipeline.
    Set skip_esco=True if ESCO CSV not yet downloaded.
    """
    from . import fetch_worldbank, fetch_data360, load_frey_osborne, embed_esco

    db = get_db()
    # logger.info("=== Starting data ingestion pipeline ===")

    # logger.info("--- Data360 labour + HCI + digital + youth signals ---")
    # fetch_data360.run(db, countries=countries)

    # logger.info("--- World Bank WDI indicators (legacy fallback) ---")
    # fetch_worldbank.run(db, countries=countries)

    # logger.info("--- Frey-Osborne automation risk ---")
    # load_frey_osborne.run(db)

    if not skip_esco:
        logger.info("--- ESCO skills embedding ---")
        embed_esco.run()
    else:
        logger.info("--- Skipping ESCO embedding (skip_esco=True) ---")

    db.close()
    logger.info("=== Ingestion complete ===")
