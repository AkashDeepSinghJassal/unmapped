# UNMAPPED — AI Skills Infrastructure for Youth

> Closing the distance between real skills and economic opportunity in LMICs.
> World Bank Youth Summit · HackNation 5

#### tech video - https://youtu.be/EMvrc_ccMWU
#### demo video - https://www.youtube.com/watch?v=D8FYljYJSU4
---

## Architecture

```
User (Web) → Next.js Frontend → FastAPI → LangGraph Orchestrator
                                              ├── Skills Signal Agent   ← ChromaDB (ESCO embeddings)
                                              ├── Opportunity Agent     ← DuckDB (ILOSTAT + WDI)
                                              └── Dashboard Agent       ← DuckDB (aggregates)
```

**AI model:** Gemini 2.0 Flash + Gemini Embedding 2 (Google Gen AI SDK)

**Data sources:**
- [World Bank WDI API](https://api.worldbank.org/v2/) — HCI, GDP per worker, sector employment %
- [Frey-Osborne (2013)](https://raw.githubusercontent.com/plotly/datasets/master/job-automation-probability.csv) — automation probability by occupation
- [ESCO v1.2.1](https://esco.ec.europa.eu/en/use-esco/download) — skills taxonomy (13k skills)

---

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd hacknation5

# Backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

### 2. Set your Gemini API key

```bash
cp .env.example .env
# Edit .env and set: GEMINI_API_KEY=your_key_here
```

Get a free key at: https://aistudio.google.com/app/apikey

### 3. Download ESCO skills CSV (one-time)

1. Go to https://esco.ec.europa.eu/en/use-esco/download
2. Choose: **ESCO v1.2.1 → CSV → Skills → English**
3. Save the file as `data/skills_en.csv`

### 4. Run data ingestion

```bash
# Pull ILOSTAT + World Bank + Frey-Osborne + embed ESCO
python run.py ingest

# If ESCO CSV not downloaded yet, skip it:
python run.py ingest-no-esco
```

This populates `data/unmapped.duckdb` and `data/chroma/`.

### 5. Start the backend

```bash
python run.py serve
# API running at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 6. Start the frontend

```bash
cd frontend
npm run dev
# App at http://localhost:3000
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/profile` | Submit youth profile → Skills Passport + Opportunities |
| `GET`  | `/api/opportunities` | Re-fetch opportunities for saved profile |
| `GET`  | `/api/dashboard?country_code=GHA` | Policymaker econometric dashboard |
| `POST` | `/api/ingest` | Trigger data ingestion (admin) |
| `GET`  | `/api/configs` | List available country configs |
| `GET`  | `/api/health` | Health check |

### Example: Submit profile

```bash
curl -X POST http://localhost:8000/api/profile \
  -H "Content-Type: application/json" \
  -d '{
    "education_level": "Senior high school (SHS) / Secondary",
    "experience_text": "I have repaired smartphones for 5 years and taught basic coding to students.",
    "country_code": "GHA"
  }'
```

---

## Country config

Country contexts live in `config/`. Switch countries without changing code:

```yaml
# config/ghana.yaml
country_code: GHA
country_name: Ghana
automation_calibration:
  digital_adjustment_factor: 0.65
opportunity_modes: [formal_job, self_employment, gig, training]
```

Add a new country by creating `config/xyz.yaml` and re-running ingestion.

---

## Project structure

```
hacknation5/
├── config/
│   ├── ghana.yaml
│   └── bangladesh.yaml
├── data/               ← created by ingestion (gitignored)
│   ├── unmapped.duckdb
│   ├── chroma/
│   └── skills_en.csv   ← download manually
├── backend/
│   ├── agents/
│   │   ├── skills_agent.py
│   │   ├── opportunity_agent.py
│   │   └── dashboard_agent.py
│   ├── rag/
│   │   ├── chroma_store.py
│   │   └── duckdb_store.py
│   ├── ingestion/
│   │   ├── fetch_ilostat.py
│   │   ├── fetch_worldbank.py
│   │   ├── load_frey_osborne.py
│   │   └── embed_esco.py
│   ├── orchestrator.py
│   └── api/main.py
├── frontend/
│   ├── app/
│   │   ├── page.tsx            ← youth form
│   │   ├── results/page.tsx    ← skills passport + opportunities
│   │   └── dashboard/page.tsx  ← policymaker view
│   └── lib/api.ts
├── requirements.txt
├── run.py
└── .env.example
```

---

## Demo: Country-agnostic requirement

Run the same profile with Ghana then Bangladesh:

```bash
# Ghana
curl -X POST http://localhost:8000/api/profile \
  -d '{"education_level":"Secondary","experience_text":"phone repair, 5 years","country_code":"GHA"}'

# Bangladesh — same profile, different wage signals + opportunity ranking
curl -X POST http://localhost:8000/api/profile \
  -d '{"education_level":"Secondary","experience_text":"phone repair, 5 years","country_code":"BGD"}'
```

No code changes — only `country_code` differs.

---

## Deployment

### Frontend — Vercel

Push to `develop` branch. Vercel's Git integration deploys automatically.
Set `NEXT_PUBLIC_API_URL` to your backend URL in Vercel project settings.

### Backend — Azure App Service (B1, ~$13/mo)

#### One-time Azure setup

```bash
# 1. Login
az login

# 2. Register required providers (skip if already done)
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.Storage

# 3. Create resource group in West Europe
az group create --name unmapped-rg --location westeurope

# 4. Create App Service Plan (B1, Linux)
az appservice plan create \
  --name unmapped-plan \
  --resource-group unmapped-rg \
  --sku B1 \
  --is-linux

# 5. Create Web App with Python 3.12 runtime
az webapp create \
  --name unmapped-api \
  --resource-group unmapped-rg \
  --plan unmapped-plan \
  --runtime "PYTHON:3.12"

# 6. Set startup command
az webapp config set \
  --name unmapped-api \
  --resource-group unmapped-rg \
  --startup-file "bash scripts/start.sh"

# 7. Set environment variables
az webapp config appsettings set \
  --name unmapped-api \
  --resource-group unmapped-rg \
  --settings \
    LLM_PROVIDER=groq \
    GROQ_API_KEY=<your_key> \
    EMBEDDING_PROVIDER=sentence_transformers \
    ST_MODEL=all-MiniLM-L6-v2 \
    DUCKDB_PATH=/home/data/unmapped.duckdb \
    CHROMA_PATH=/home/data/chroma \
    CONFIG_DIR=/home/site/wwwroot/config
```

#### GitHub Secrets required

| Secret | How to get it |
|---|---|
| `AZURE_WEBAPP_NAME` | The app name chosen above (e.g. `unmapped-api`) |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Azure Portal → App Service → **Get publish profile** → paste full XML |

#### Continuous deployment

The workflow at [`.github/workflows/deploy-appservice.yml`](.github/workflows/deploy-appservice.yml) triggers on every push to `develop` that touches backend files. It:

1. Installs Python 3.12 dependencies
2. Pre-downloads the sentence-transformers model
3. Zips the source (excluding `frontend/`, `data/`, `.git`)
4. Deploys the zip to App Service via publish profile

#### Data persistence

App Service persists `/home` across restarts and deploys via Azure Files.
`DUCKDB_PATH=/home/data/unmapped.duckdb` and `CHROMA_PATH=/home/data/chroma`
ensure DuckDB and ChromaDB survive updates.

To run initial ingestion after first deploy:

```bash
az webapp ssh --name unmapped-api --resource-group unmapped-rg
# Inside the SSH session:
cd /home/site/wwwroot
python run.py ingest-no-esco
```
