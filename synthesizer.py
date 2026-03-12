"""Report synthesis module — combines photo analyses + voice notes into a unified DailyReport."""

import json
import logging
from pathlib import Path

import config
from models import DailyReport, PhotoAnalysis, VoiceNoteData

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "report_synthesis.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text()


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response text.

    Handles common LLM quirks:
    - Preamble text before the JSON/code fence
    - Markdown code fences (```json ... ``` or ``` ... ```)
    - Raw JSON without fences
    """
    stripped = text.strip()

    # If there's a code fence, extract content between fences
    if "```" in stripped:
        # Find the first code fence opening
        fence_start = stripped.index("```")
        after_fence = stripped[fence_start + 3:]
        # Skip the language tag line (e.g., 'json', 'JSON', or empty)
        if "\n" in after_fence:
            after_fence = after_fence.split("\n", 1)[1]
        # Find closing fence
        if "```" in after_fence:
            after_fence = after_fence[:after_fence.rindex("```")]
        stripped = after_fence.strip()

    # Try to find JSON object if still not valid
    if not stripped.startswith("{"):
        brace = stripped.find("{")
        if brace != -1:
            stripped = stripped[brace:]

    return json.loads(stripped)


def _build_user_message(
    analyses: list[PhotoAnalysis],
    voice_notes: VoiceNoteData | None,
    project_name: str,
    company_name: str,
    date: str,
) -> str:
    """Build the user message content for the synthesis call."""
    analyses_json = [a.model_dump() for a in analyses]
    user_parts = [
        f"Project: {project_name}",
        f"Company: {company_name}",
        f"Date: {date}",
        "",
        f"Photo analyses ({len(analyses)} photos):",
        json.dumps(analyses_json, indent=2),
    ]

    if voice_notes:
        user_parts.append("")
        user_parts.append("Site supervisor notes:")
        user_parts.append(json.dumps(voice_notes.model_dump(), indent=2))

    return "\n".join(user_parts)


# ---------------------------------------------------------------------------
# Google Gemini provider
# ---------------------------------------------------------------------------
def _synthesize_google(user_message: str, date: str, project_name: str, company_name: str) -> DailyReport:
    """Synthesize report using Google Gemini."""
    from google import genai

    client = genai.Client(api_key=config.GOOGLE_API_KEY)

    prompt = SYSTEM_PROMPT + "\n\n" + user_message

    last_error = None
    for attempt in range(2):
        response = client.models.generate_content(
            model=config.SYNTHESIS_MODEL,
            contents=prompt,
        )
        raw_text = response.text
        try:
            data = _parse_json_response(raw_text)
            data["date"] = date
            data["project_name"] = project_name
            data["company_name"] = company_name
            return DailyReport(**data)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            if attempt == 0:
                logger.warning("Bad JSON from Gemini synthesis, retrying... (%s)", exc)
            continue

    raise ValueError(f"Failed to parse synthesis response after 2 attempts: {last_error}")


# ---------------------------------------------------------------------------
# OpenAI provider
# ---------------------------------------------------------------------------
def _synthesize_openai(user_message: str, date: str, project_name: str, company_name: str) -> DailyReport:
    """Synthesize report using OpenAI."""
    from openai import OpenAI

    client = OpenAI(api_key=config.OPENAI_API_KEY)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    last_error = None
    for attempt in range(2):
        response = client.chat.completions.create(
            model=config.SYNTHESIS_MODEL,
            messages=messages,
            max_tokens=4096,
            temperature=0.3,
        )
        raw_text = response.choices[0].message.content
        try:
            data = _parse_json_response(raw_text)
            data["date"] = date
            data["project_name"] = project_name
            data["company_name"] = company_name
            return DailyReport(**data)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            if attempt == 0:
                logger.warning("Bad JSON from synthesis API, retrying... (%s)", exc)
            continue

    raise ValueError(f"Failed to parse synthesis response after 2 attempts: {last_error}")


# ---------------------------------------------------------------------------
# Groq provider (OpenAI-compatible API)
# ---------------------------------------------------------------------------
def _synthesize_groq(user_message: str, date: str, project_name: str, company_name: str) -> DailyReport:
    """Synthesize report using Groq (Llama 4 Scout)."""
    from groq import Groq

    client = Groq(api_key=config.GROQ_API_KEY)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    import time

    last_error = None
    for attempt in range(3):
        if attempt > 0:
            time.sleep(5)  # Brief pause before retry
        try:
            response = client.chat.completions.create(
                model=config.SYNTHESIS_MODEL,
                messages=messages,
                max_tokens=4096,
                temperature=0.3,
            )
        except Exception as api_exc:
            last_error = api_exc
            logger.warning("Groq synthesis API error (attempt %d): %s", attempt + 1, api_exc)
            continue

        raw_text = response.choices[0].message.content
        if not raw_text:
            last_error = ValueError("Empty response from API")
            logger.warning("Empty response from Groq synthesis, retrying (attempt %d)...", attempt + 1)
            continue

        try:
            data = _parse_json_response(raw_text)
            data["date"] = date
            data["project_name"] = project_name
            data["company_name"] = company_name
            return DailyReport(**data)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            logger.warning("Bad JSON from Groq synthesis (attempt %d): %s", attempt + 1, exc)
            continue

    raise ValueError(f"Failed to parse synthesis response after 3 attempts: {last_error}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def synthesize_report(
    analyses: list[PhotoAnalysis],
    voice_notes: VoiceNoteData | None,
    project_name: str,
    company_name: str,
    date: str,
) -> DailyReport:
    """Make ONE LLM call to produce the unified DailyReport from all photo analyses.

    Serializes all PhotoAnalysis objects and optional voice notes into the user
    message, calls the configured LLM, and parses the structured JSON response.
    Retries once on invalid JSON.
    """
    user_message = _build_user_message(analyses, voice_notes, project_name, company_name, date)

    if config.PROVIDER == "groq":
        return _synthesize_groq(user_message, date, project_name, company_name)
    elif config.PROVIDER == "google":
        return _synthesize_google(user_message, date, project_name, company_name)
    else:
        return _synthesize_openai(user_message, date, project_name, company_name)
