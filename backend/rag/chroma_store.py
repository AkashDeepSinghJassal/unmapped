"""
ChromaDB vector store for ESCO skill search.

Embedding backend is selected via EMBEDDING_PROVIDER env var:
  - "sentence_transformers" (default) — local, no API key needed
  - "gemini"                          — requires GEMINI_API_KEY + credits
  - "openai"                          — requires OPENAI_API_KEY
"""

import logging
import os
import chromadb

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")
COLLECTION_NAME = "esco_skills"
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "sentence_transformers")
ST_MODEL = os.getenv("ST_MODEL", "all-MiniLM-L6-v2")

_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None
_st_model = None


def _get_chroma() -> chromadb.Collection:
    global _client, _collection
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
    col = _get_chroma()
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
