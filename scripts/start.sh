#!/usr/bin/env bash
# Render startup script — runs before the web server starts.
set -e

echo "=== UNMAPPED startup ==="

# Re-fetch labour market data if DuckDB is missing (edge case: Render disk mount)
if [ ! -f "${DUCKDB_PATH:-./data/unmapped.duckdb}" ]; then
  echo "DuckDB not found — running ingestion (no ESCO)..."
  python run.py ingest-no-esco
else
  echo "DuckDB found at ${DUCKDB_PATH:-./data/unmapped.duckdb} ✓"
fi

echo "Starting FastAPI server on port ${PORT:-8000}..."
exec uvicorn backend.api.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
