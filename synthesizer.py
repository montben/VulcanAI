"""Report synthesis module — combines photo analyses + voice notes into a unified DailyReport."""

import json
import logging
from pathlib import Path

from openai import OpenAI

import config
from models import DailyReport, PhotoAnalysis, VoiceNoteData

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "report_synthesis.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text()


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response text."""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines)
    return json.loads(stripped)


def synthesize_report(
    analyses: list[PhotoAnalysis],
    voice_notes: VoiceNoteData | None,
    project_name: str,
    company_name: str,
    date: str,
) -> DailyReport:
    """Make ONE LLM call to produce the unified DailyReport from all photo analyses.

    Serializes all PhotoAnalysis objects and optional voice notes into the user
    message, calls GPT-4o, and parses the structured JSON response.
    Retries once on invalid JSON.
    """
    client = OpenAI(api_key=config.OPENAI_API_KEY)

    # Build user message content
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

    user_message = "\n".join(user_parts)

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
            # Inject metadata fields that the LLM doesn't produce
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
