"""
Embed ESCO skills and occupations from data/delta.csv into ChromaDB.

The delta.csv is the ESCO v1.2.1 changelog file with columns:
  concept URI, concept prefLabel, field, old value, new value, action, language

Parse strategy:
  - Keep: English text fields + language-neutral fields (skillType, etc.)
  - Skip: action == 'Removed', non-English text rows
  - Aggregate per URI: prefLabel + altLabels + description/definition/scopeNote
  - Embed: skills (/skill/) and occupations (/occupation/) as separate collections
  - Build rich text: "{label}. {alt_labels}. {description}"

Also supports the full skills_en.csv format as fallback.

Embedding backend is selected via EMBEDDING_PROVIDER env var:
  - "sentence_transformers" (default) — local, no API key needed
  - "gemini"                          — requires GEMINI_API_KEY + credits
  - "openai"                          — requires OPENAI_API_KEY
"""

import csv
import logging
import os
import time
from collections import defaultdict
import chromadb
import requests

logger = logging.getLogger(__name__)

ESCO_SEARCH_URL = "https://ec.europa.eu/esco/api/search"
CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")
COLLECTION_NAME = "esco_skills"
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "sentence_transformers")
ST_MODEL = os.getenv("ST_MODEL", "all-MiniLM-L6-v2")

CSV_CANDIDATES = [
    "data/delta.csv",
    "data/skills_en.csv",
]

# Fields that carry English descriptive text
TEXT_FIELDS = {"prefLabel", "altLabel", "description", "definition", "scopeNote"}
# Fields that are language-neutral
NEUTRAL_FIELDS = {"skillType", "hasNACECode", "notation"}

_st_model = None


def _get_st_model():
    global _st_model
    if _st_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading SentenceTransformer model: %s", ST_MODEL)
        _st_model = SentenceTransformer(ST_MODEL)
    return _st_model


def embed_batch(texts: list[str]) -> list[list[float]]:
    if EMBEDDING_PROVIDER == "gemini":
        from google import genai
        client = genai.Client()
        embeddings = []
        for text in texts:
            resp = client.models.embed_content(
                model="gemini-embedding-2",
                contents=text,
            )
            embeddings.append(resp.embeddings[0].values)
        return embeddings

    elif EMBEDDING_PROVIDER == "openai":
        import openai
        client = openai.OpenAI()
        resp = client.embeddings.create(
            model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
            input=texts,
        )
        return [item.embedding for item in resp.data]

    else:  # sentence_transformers (default)
        model = _get_st_model()
        vectors = model.encode(texts, show_progress_bar=False)
        return [v.tolist() for v in vectors]


# ---------------------------------------------------------------------------
# Delta CSV parser — aggregates all fields per URI
# ---------------------------------------------------------------------------

def _parse_delta_csv(csv_path: str) -> list[dict]:
    """
    Aggregate delta.csv into one record per URI.

    For each URI collects:
      - label       : concept prefLabel (from column, always present)
      - alt_labels  : list of English altLabel values
      - description : first of description / definition / scopeNote (English)
      - skill_type  : e.g. 'skill/competence', 'knowledge' (language-neutral)
      - uri_type    : 'skill' or 'occupation'

    Skips action='Removed' rows.
    Returns list of {uri, label, desc, uri_type} ready for embedding.
    """
    # Accumulator: uri -> field_name -> list[value]
    data: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            action = row.get("action", "").strip()
            if action == "Removed":
                continue

            uri = row.get("concept URI", "").strip()
            if not uri:
                continue

            field = row.get("field", "").strip()
            lang = row.get("language", "").strip()
            new_val = row.get("new value", "").strip()
            pref_col = row.get("concept prefLabel", "").strip()

            # Always record the concept prefLabel column value
            if pref_col and "prefLabel_col" not in data[uri]:
                data[uri]["prefLabel_col"] = [pref_col]

            # English text fields
            if field in TEXT_FIELDS and lang == "en" and new_val and new_val != "None":
                data[uri][field].append(new_val)

            # Language-neutral fields
            if field in NEUTRAL_FIELDS and new_val and new_val != "None":
                data[uri][field] = [new_val]

    # Build output rows
    rows = []
    for uri, fields in data.items():
        # Label: prefer prefLabel field, fall back to concept prefLabel column
        label_vals = fields.get("prefLabel") or fields.get("prefLabel_col") or []
        label = label_vals[0] if label_vals else ""
        if not label:
            continue

        # Description: first non-empty of description > definition > scopeNote > altLabel
        desc = ""
        for field_name in ("description", "definition", "scopeNote"):
            vals = fields.get(field_name, [])
            if vals:
                desc = vals[0]
                break
        if not desc:
            alt_labels = fields.get("altLabel", [])
            desc = "; ".join(alt_labels[:3]) if alt_labels else label

        # Enrich text with alt labels
        alt_labels = fields.get("altLabel", [])
        rich_text = label
        if alt_labels:
            rich_text += ". Also known as: " + "; ".join(alt_labels[:5])
        if desc and desc != label:
            rich_text += ". " + desc

        uri_type = "skill" if "/skill/" in uri else "occupation"

        rows.append({
            "uri": uri,
            "label": label,
            "desc": rich_text,
            "uri_type": uri_type,
            "skill_type": (fields.get("skillType") or [""])[0],
        })

    skills = sum(1 for r in rows if r["uri_type"] == "skill")
    occs   = sum(1 for r in rows if r["uri_type"] == "occupation")
    logger.info("Parsed delta CSV: %d skills, %d occupations (total %d)", skills, occs, len(rows))
    return rows


def _parse_full_csv(csv_path: str) -> list[dict]:
    """Parse ESCO full skills_en.csv format."""
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            uri   = row.get("conceptUri", "").strip()
            label = row.get("preferredLabel", "").strip()
            desc  = row.get("description", "").strip() or label
            if uri and label:
                rows.append({
                    "uri": uri,
                    "label": label,
                    "desc": f"{label}. {desc}",
                    "uri_type": "skill" if "/skill/" in uri else "occupation",
                    "skill_type": "",
                })
    logger.info("Parsed full skills CSV: %d rows", len(rows))
    return rows


def _detect_and_parse(csv_path: str) -> list[dict]:
    with open(csv_path, encoding="utf-8") as f:
        header = f.readline().lower()
    if "concept uri" in header and "field" in header:
        logger.info("Detected ESCO delta CSV format")
        return _parse_delta_csv(csv_path)
    else:
        logger.info("Detected ESCO full skills CSV format")
        return _parse_full_csv(csv_path)


# ---------------------------------------------------------------------------
# Main loader
# ---------------------------------------------------------------------------

def load_esco_from_csv(csv_path: str | None = None, batch_size: int = 50):
    """
    Parse ESCO delta (or full) CSV, embed with Gemini, store in ChromaDB.
    """
    if csv_path is None:
        for candidate in CSV_CANDIDATES:
            if os.path.exists(candidate):
                csv_path = candidate
                break

    if not csv_path or not os.path.exists(csv_path):
        raise FileNotFoundError(
            "ESCO CSV not found. Tried: " + ", ".join(CSV_CANDIDATES) + "\n"
            "Place the delta CSV at data/delta.csv  or  full CSV at data/skills_en.csv"
        )

    logger.info("Loading ESCO from: %s", csv_path)
    rows = _detect_and_parse(csv_path)

    if not rows:
        logger.error("No rows parsed from ESCO CSV — check file format")
        return

    chroma = chromadb.PersistentClient(path=CHROMA_PATH)
    col = chroma.get_or_create_collection(COLLECTION_NAME)

    # Skip already embedded
    existing_ids = set(col.get()["ids"])
    rows = [r for r in rows if r["uri"] not in existing_ids]
    logger.info("%d concepts to embed (%d already in ChromaDB)", len(rows), len(existing_ids))

    if not rows:
        logger.info("All concepts already embedded")
        return

    total_batches = (len(rows) + batch_size - 1) // batch_size
    embedded = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i: i + batch_size]
        texts = [r["desc"] for r in batch]
        try:
            vectors = embed_batch(texts)
            col.add(
                ids=[r["uri"] for r in batch],
                embeddings=vectors,
                documents=texts,
                metadatas=[
                    {
                        "label":      r["label"],
                        "uri":        r["uri"],
                        "uri_type":   r["uri_type"],
                        "skill_type": r.get("skill_type", ""),
                    }
                    for r in batch
                ],
            )
            embedded += len(batch)
            batch_num = i // batch_size + 1
            if batch_num % 20 == 0 or batch_num == total_batches:
                logger.info("Batch %d/%d — %d/%d concepts embedded",
                            batch_num, total_batches, embedded, len(rows))
        except Exception as e:
            logger.error("Embedding failed for batch %d: %s", i // batch_size + 1, e)
        time.sleep(0.3)

    logger.info("ESCO embedding complete. Total in ChromaDB: %d", col.count())


# ---------------------------------------------------------------------------
# ESCO REST API fallback (query-time)
# ---------------------------------------------------------------------------

def search_esco_api(query: str, limit: int = 10) -> list[dict]:
    """Live ESCO REST API — fallback when ChromaDB is empty or confidence is low."""
    try:
        r = requests.get(
            ESCO_SEARCH_URL,
            params={"text": query, "language": "en", "type": "skill", "limit": limit},
            timeout=10,
        )
        r.raise_for_status()
        items = r.json().get("_embedded", {}).get("results", [])
        return [
            {
                "uri": item.get("uri", ""),
                "label": item.get("title", ""),
                "description": item.get("description", {}).get("en", {}).get("literal", ""),
            }
            for item in items
        ]
    except Exception as e:
        logger.warning("ESCO API search failed: %s", e)
        return []


def run(csv_path: str | None = None):
    load_esco_from_csv(csv_path)
