"""
Conversational Chat Agent — guided intake for the Skills Signal pipeline.

Flow:
  1. Greets the user and asks about their background.
  2. Asks follow-up questions (education, work, informal skills, projects).
  3. After collecting enough signal (≥ MIN_TURNS exchanges), emits a structured
     READY marker which the endpoint uses to trigger the Skills + Opportunity agents.

Session history is stored in memory (dict keyed by session_id).
For production replace with Redis / DB.
"""

import json
import logging
import re
from collections import defaultdict

from backend.services.llm import generate_text

logger = logging.getLogger(__name__)

MIN_TURNS = 3          # minimum user messages before analysis is triggered
MAX_HISTORY = 20       # cap per session to avoid token bloat

# In-memory store: session_id -> list of {"role": "user"|"assistant", "content": str}
_sessions: dict[str, list[dict]] = defaultdict(list)

SYSTEM_PROMPT = """You are a warm, encouraging AI career advisor helping young people in
developing countries discover and map their real skills to economic opportunities.

Your goal is to have a short, friendly conversation (4-6 exchanges) to learn about:
1. Education background (level, field, year finished)
2. Formal work experience (jobs held, duration)
3. Informal / self-taught skills (repairs, trade, teaching, digital, creative, farming, etc.)
4. Projects, side hustles, or achievements they're proud of

Conversation rules:
- Start with a warm greeting and ONE open-ended question.
- Ask ONLY ONE focused follow-up question per reply — never ask multiple at once.
- Be specific and encouraging: acknowledge what the user shares before asking more.
- Use simple, plain language (no jargon).
- After {min_turns} or more user messages, when you have a solid picture, output EXACTLY
  this on the LAST line of your reply (nothing after it):
  READY::{{"education_level": "<level>", "experience_text": "<rich 3-4 sentence summary>"}}
  Where experience_text synthesises ALL skills and experience gathered in the conversation.
- Only output the READY line when you genuinely have enough information — never on the first reply.

Current conversation context:
- Country: {country}
- Messages so far from user: {turn_count}
""".strip()

_READY_RE = re.compile(r"READY::\s*(\{.+\})\s*$", re.MULTILINE | re.DOTALL)


def _build_messages(session_id: str, country: str, user_message: str) -> list[dict]:
    """Append the new user turn and return the full message list for the LLM."""
    history = _sessions[session_id]
    history.append({"role": "user", "content": user_message})
    # Trim oldest turns (keep system context fresh)
    if len(history) > MAX_HISTORY:
        history = history[-MAX_HISTORY:]
        _sessions[session_id] = history
    return history


def _format_prompt(session_id: str, country: str) -> str:
    """Build a single prompt string from history (for non-chat-style LLMs)."""
    history = _sessions[session_id]
    system = SYSTEM_PROMPT.format(
        min_turns=MIN_TURNS,
        country=country,
        turn_count=sum(1 for m in history if m["role"] == "user"),
    )
    lines = [f"[SYSTEM]\n{system}\n"]
    for msg in history:
        role = "User" if msg["role"] == "user" else "Assistant"
        lines.append(f"[{role}]\n{msg['content']}")
    lines.append("[Assistant]")
    return "\n\n".join(lines)


def _call_llm(session_id: str, country: str) -> str:
    """Call the LLM with the full conversation history."""
    from backend.services.llm import LLM_PROVIDER

    # Providers that natively support chat message arrays
    if LLM_PROVIDER in ("openai", "deepseek", "groq"):
        from backend.services.llm import _get_openai_client, active_model
        import os
        client = _get_openai_client(LLM_PROVIDER)
        turn_count = sum(1 for m in _sessions[session_id] if m["role"] == "user")
        system_content = SYSTEM_PROMPT.format(
            min_turns=MIN_TURNS,
            country=country,
            turn_count=turn_count,
        )
        messages = [{"role": "system", "content": system_content}] + list(_sessions[session_id])
        resp = client.chat.completions.create(
            model=active_model(),
            messages=messages,
        )
        return resp.choices[0].message.content.strip()

    # Gemini and others — flatten to a single prompt string
    prompt = _format_prompt(session_id, country)
    return generate_text(prompt)


def process_message(
    session_id: str,
    message: str,
    country: str = "GHA",
) -> dict:
    """
    Process one user message and return the bot's reply.

    Returns:
        {
          "reply":          str,     # bot message to show the user
          "is_complete":    bool,    # True when analysis should be triggered
          "education_level": str,   # set when is_complete=True
          "experience_text": str,   # set when is_complete=True
        }
    """
    # Append user turn
    _build_messages(session_id, country, message)

    # Call LLM
    try:
        raw_reply = _call_llm(session_id, country)
    except Exception as e:
        logger.error("Chat LLM failed: %s", e)
        raw_reply = (
            "Sorry, I'm having trouble connecting right now. "
            "Could you try again in a moment?"
        )

    # Check for READY signal
    match = _READY_RE.search(raw_reply)
    if match:
        try:
            extracted = json.loads(match.group(1))
        except json.JSONDecodeError:
            extracted = {}

        # Strip the READY line from the visible reply
        clean_reply = raw_reply[: match.start()].rstrip()

        # Store assistant turn (without the marker)
        _sessions[session_id].append({"role": "assistant", "content": clean_reply})

        return {
            "reply":            clean_reply,
            "is_complete":      True,
            "education_level":  extracted.get("education_level", "Secondary"),
            "experience_text":  extracted.get("experience_text", message),
        }

    # Normal conversational reply
    _sessions[session_id].append({"role": "assistant", "content": raw_reply})
    return {
        "reply":           raw_reply,
        "is_complete":     False,
        "education_level": "",
        "experience_text": "",
    }


def reset_session(session_id: str) -> None:
    """Clear conversation history for a session."""
    _sessions.pop(session_id, None)


def get_history(session_id: str) -> list[dict]:
    """Return the full conversation history for a session."""
    return list(_sessions.get(session_id, []))
