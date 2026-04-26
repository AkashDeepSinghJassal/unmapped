"""
Centralised LLM service — single entry point for all text generation.

Provider is selected via the LLM_PROVIDER env var:
  gemini    (default) — Google Gemini, needs GEMINI_API_KEY
  openai              — OpenAI, needs OPENAI_API_KEY
  deepseek            — DeepSeek (OpenAI-compatible), needs DEEPSEEK_API_KEY
  groq                — Groq (free tier, very fast), needs GROQ_API_KEY
  ollama              — local models via Ollama, no key needed

Override the default model per provider with LLM_MODEL.

Usage:
    from backend.services.llm import generate_text
    text = generate_text(prompt)
"""

import logging
import os

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
LLM_MODEL = os.getenv("LLM_MODEL", "")

# Default model for each provider
_DEFAULT_MODELS: dict[str, str] = {
    "gemini":   "gemini-2.0-flash",
    "openai":   "gpt-4o-mini",
    "deepseek": "deepseek-chat",
    "groq":     "llama-3.3-70b-versatile",
    "ollama":   "llama3.2",
}

# OpenAI-compatible base URLs (deepseek + groq use the openai SDK)
_BASE_URLS: dict[str, str] = {
    "deepseek": "https://api.deepseek.com/v1",
    "groq":     "https://api.groq.com/openai/v1",
}

# Env var name that holds the API key per provider
_API_KEY_ENV: dict[str, str] = {
    "gemini":   "GEMINI_API_KEY",
    "openai":   "OPENAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "groq":     "GROQ_API_KEY",
}

# Singleton clients
_gemini_client = None
_openai_clients: dict[str, object] = {}


def active_model() -> str:
    """Return the model name that will be used for the current provider."""
    return LLM_MODEL or _DEFAULT_MODELS.get(LLM_PROVIDER, "gemini-2.0-flash")


def active_provider() -> str:
    return LLM_PROVIDER


def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client()
    return _gemini_client


def _get_openai_client(provider: str):
    """Return a (cached) openai.OpenAI client for openai / deepseek / groq."""
    if provider not in _openai_clients:
        import openai
        kwargs: dict = {"api_key": os.getenv(_API_KEY_ENV.get(provider, "OPENAI_API_KEY"))}
        if provider in _BASE_URLS:
            kwargs["base_url"] = _BASE_URLS[provider]
        _openai_clients[provider] = openai.OpenAI(**kwargs)
    return _openai_clients[provider]


def generate_text(prompt: str) -> str:
    """
    Send *prompt* to the configured LLM and return the raw text response.

    Raises:
        ValueError  — unknown LLM_PROVIDER
        Exception   — propagated from the underlying SDK on API errors
    """
    model = active_model()
    logger.debug("generate_text via %s / %s", LLM_PROVIDER, model)

    if LLM_PROVIDER == "gemini":
        client = _get_gemini()
        resp = client.models.generate_content(model=model, contents=prompt)
        return resp.text.strip()

    if LLM_PROVIDER in ("openai", "deepseek", "groq"):
        client = _get_openai_client(LLM_PROVIDER)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content.strip()

    if LLM_PROVIDER == "ollama":
        import requests as _requests
        url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        resp = _requests.post(
            f"{url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["response"].strip()

    raise ValueError(
        f"Unknown LLM_PROVIDER={LLM_PROVIDER!r}. "
        "Choose one of: gemini, openai, deepseek, groq, ollama"
    )
