#!/usr/bin/env python3
"""
UNMAPPED — quick start script.

Usage:
  python run.py ingest              # pull all data sources into DuckDB + ChromaDB
  python run.py ingest-no-esco      # ingest without ESCO CSV (if not downloaded yet)
  python run.py ingest-data360      # ingest ONLY Data360 indicators (~15 seconds)
  python run.py serve               # start FastAPI server on :8000

Data sources:
  - World Bank Data360 API  https://data360api.worldbank.org  (primary, no key)
  - World Bank WDI API      https://api.worldbank.org         (fallback, no key)
  - Frey-Osborne CSV        https://raw.githubusercontent.com/plotly/datasets/master/
  - ESCO skills_en.csv      download manually from esco.ec.europa.eu/en/use-esco/download
"""

import sys
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
)


def cmd_ingest(skip_esco: bool = False):
    from backend.ingestion import run_all
    run_all(skip_esco=skip_esco)


def cmd_ingest_data360():
    """Fast path: only pull Data360 labour market indicators (~15s for 10 countries)."""
    from backend.ingestion import get_db
    from backend.ingestion.fetch_data360 import run as d360_run
    db = get_db()
    d360_run(db)
    db.close()


def cmd_serve():
    import uvicorn
    uvicorn.run(
        "backend.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if cmd == "ingest":
        cmd_ingest(skip_esco=False)
    elif cmd == "ingest-no-esco":
        cmd_ingest(skip_esco=True)
    elif cmd == "ingest-data360":
        cmd_ingest_data360()
    elif cmd == "serve":
        cmd_serve()
    else:
        print(__doc__)
        sys.exit(1)
