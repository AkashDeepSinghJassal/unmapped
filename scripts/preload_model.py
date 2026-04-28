"""
Pre-download the sentence-transformers model during the build step.
Run once at build time so the first request doesn't have to wait.
"""
import os

model_name = os.getenv("ST_MODEL", "all-MiniLM-L6-v2")
print(f"Pre-loading embedding model: {model_name}")

from sentence_transformers import SentenceTransformer
model = SentenceTransformer(model_name)
_ = model.encode(["warmup"], show_progress_bar=False)
print(f"Model '{model_name}' loaded and cached successfully.")
