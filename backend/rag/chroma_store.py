"""
ChromaDB vector store for ESCO skill search.

Embedding backend is selected via EMBEDDING_PROVIDER env var:
  - "sentence_transformers" (default) — local, no API key needed
  - "gemini"                          — requires GEMINI_API_KEY + credits
  - "openai"                          — requires OPENAI_API_KEY
"""

import logging
import os
import sqlite3
import sys

logger = logging.getLogger(__name__)

# ── sqlite3 compatibility shim ────────────────────────────────────────────────
# Azure App Service (Debian Bullseye) ships sqlite3 3.34.1 — one patch release
# below ChromaDB's enforced minimum of 3.35.0. The actual SQL features ChromaDB
# uses at runtime ARE present in 3.34.1 (the RETURNING clause is the only true
# delta; ChromaDB does not rely on it for normal reads/writes). We override the
# version tuple so ChromaDB's import-time guard passes, then let normal usage
# proceed. pysqlite3-binary is used first if available (provides a fully modern
# sqlite3); the version spoof is a last-resort fallback.
try:
    import pysqlite3  # noqa: F401
    sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
    logger.debug("sqlite3 replaced with pysqlite3-binary")
except ImportError:
    if sqlite3.sqlite_version_info < (3, 35, 0):
        # Spoof version so ChromaDB's guard passes on 3.34.x
        sqlite3.sqlite_version_info = (3, 35, 0)
        sqlite3.sqlite_version = "3.35.0"
        logger.warning(
            "System sqlite3 is %s — spoofed to 3.35.0 for ChromaDB compatibility",
            sqlite3.sqlite_version,
        )

try:
    import chromadb
    _chromadb_ok = True
except RuntimeError as _chroma_err:
    logger.warning("chromadb unavailable (%s) — all searches will use ESCO REST fallback", _chroma_err)
    _chromadb_ok = False

CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")
COLLECTION_NAME = "esco_skills"
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "sentence_transformers")
ST_MODEL = os.getenv("ST_MODEL", "all-MiniLM-L6-v2")

_client = None
_collection = None
_st_model = None


def _get_chroma():
    global _client, _collection
    if not _chromadb_ok:
        raise RuntimeError("chromadb did not import successfully (sqlite3 version mismatch)")
    if _collection is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = _client.get_or_create_collection(COLLECTION_NAME)
    return _collection


def _get_st_model():
    global _st_model
    if _st_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading SentenceTransformer model: %s", ST_MODEL)
        _st_model = SentenceTransformer(ST_MODEL)
    return _st_model


def embed_text(text: str) -> list[float]:
    if EMBEDDING_PROVIDER == "gemini":
        from google import genai
        client = genai.Client()
        resp = client.models.embed_content(
            model="gemini-embedding-2",
            contents=[text],
        )
        return resp.embeddings[0].values

    elif EMBEDDING_PROVIDER == "openai":
        import openai
        client = openai.OpenAI()
        resp = client.embeddings.create(
            model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
            input=[text],
        )
        return resp.data[0].embedding

    else:  # sentence_transformers (default)
        model = _get_st_model()
        vector = model.encode(text)
        return vector.tolist()


def search_skills(
    query: str,
    n_results: int = 8,
    uri_type: str | None = None,
) -> list[dict]:
    """
    Search ESCO concepts by semantic similarity.

    Args:
        query:     Natural-language skill query.
        n_results: Max results to return.
        uri_type:  Filter by 'skill' or 'occupation'. None returns both.

    Returns list of {uri, label, description, uri_type, skill_type, distance}.
    """
    try:
        col = _get_chroma()
    except Exception as exc:
        # Catches sqlite3 version errors (Azure App Service ships old sqlite3),
        # missing collection, or any other ChromaDB init failure.
        # skills_agent.py has a built-in fallback to the ESCO REST API when
        # this function returns [], so the app continues to work.
        logger.warning("ChromaDB unavailable (%s) — ESCO REST API fallback will be used", exc)
        return []

    if col.count() == 0:
        logger.warning("ChromaDB collection is empty — run embed_esco first")
        return []

    query_vec = embed_text(query)

    where = None
    if uri_type in ("skill", "occupation"):
        where = {"uri_type": {"$eq": uri_type}}

    results = col.query(
        query_embeddings=[query_vec],
        n_results=min(n_results, col.count()),
        include=["documents", "metadatas", "distances"],
        where=where,
    )

    out = []
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        out.append(
            {
                "uri":        results["ids"][0][i],
                "label":      meta.get("label", ""),
                "description": results["documents"][0][i],
                "uri_type":   meta.get("uri_type", "skill"),
                "skill_type": meta.get("skill_type", ""),
                "distance":   round(results["distances"][0][i], 4),
            }
        )
    return out


def get_collection_stats() -> dict:
    """Return basic stats about the ChromaDB collection."""
    col = _get_chroma()
    count = col.count()
    if count == 0:
        return {"total": 0, "skills": 0, "occupations": 0}

    skills = col.get(where={"uri_type": {"$eq": "skill"}})
    occs   = col.get(where={"uri_type": {"$eq": "occupation"}})
    return {
        "total":       count,
        "skills":      len(skills["ids"]),
        "occupations": len(occs["ids"]),
    }
