"""Pipeline agent functions — each wraps a single LLM call for one stage of report generation."""

import json
import logging
import time
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from . import config
from .analyzer import analyze_photo
from .models import PhotoAnalysis
from .schemas import StructuredDailyReport

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_TRANSCRIPT_PROMPT = (_PROMPTS_DIR / "transcript_analysis.txt").read_text()
_SYNTHESIS_V2_PROMPT = (_PROMPTS_DIR / "report_synthesis_v2.txt").read_text()
_REVIEW_PROMPT = (_PROMPTS_DIR / "report_review.txt").read_text()

_WORK_STATUS_ALIASES = {
    "complete": "completed",
    "completed": "completed",
    "done": "completed",
    "finished": "completed",
    "in_progress": "in_progress",
    "in progress": "in_progress",
    "inprogress": "in_progress",
    "ongoing": "in_progress",
    "started": "started",
    "starting": "started",
    "beginning": "started",
}

_SEVERITY_ALIASES = {
    "low": "low",
    "minor": "low",
    "medium": "medium",
    "moderate": "medium",
    "high": "high",
    "severe": "high",
    "critical": "high",
}

_PRIORITY_ALIASES = {
    "low": "low",
    "medium": "medium",
    "med": "medium",
    "normal": "medium",
    "high": "high",
    "urgent": "high",
}


# ---------------------------------------------------------------------------
# Shared LLM call helper — mirrors the provider pattern from synthesizer.py
# ---------------------------------------------------------------------------

def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response, handling code fences and preamble."""
    stripped = text.strip()

    if "```" in stripped:
        fence_start = stripped.index("```")
        after_fence = stripped[fence_start + 3:]
        if "\n" in after_fence:
            after_fence = after_fence.split("\n", 1)[1]
        if "```" in after_fence:
            after_fence = after_fence[:after_fence.rindex("```")]
        stripped = after_fence.strip()

    if not stripped.startswith("{"):
        brace = stripped.find("{")
        if brace != -1:
            stripped = stripped[brace:]

    return json.loads(stripped)


def _string(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        value = value.strip()
        return value or default
    text = str(value).strip()
    return text or default


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_string(item) for item in value if _string(item)]
    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",")]
        return [part for part in parts if part]
    text = _string(value)
    return [text] if text else []


def _choice(value: Any, aliases: dict[str, str], default: str) -> str:
    normalized = _string(value).lower().replace("-", "_")
    return aliases.get(normalized, default)


def _normalize_photo_descriptions(raw_items: Any, fallback_items: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    raw_list = raw_items if isinstance(raw_items, list) else []
    max_items = max(len(raw_list), len(fallback_items))

    for index in range(max_items):
        raw = raw_list[index] if index < len(raw_list) and isinstance(raw_list[index], dict) else {}
        fallback = fallback_items[index] if index < len(fallback_items) and isinstance(fallback_items[index], dict) else {}
        normalized.append(
            {
                "filename": _string(raw.get("filename") or fallback.get("filename"), f"photo_{index + 1}.jpg"),
                "caption": _string(raw.get("caption") or fallback.get("caption"), ""),
                "ai_description": _string(
                    raw.get("ai_description") or raw.get("description") or fallback.get("ai_description"),
                    "",
                ),
            }
        )

    return normalized


def _normalize_structured_report_data(
    data: dict,
    *,
    metadata: dict,
    weather: dict,
    photo_descriptions: list[dict],
) -> dict:
    raw_metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    normalized: dict[str, Any] = {
        "metadata": {
            "project_name": _string(raw_metadata.get("project_name") or metadata.get("project_name"), "Untitled Project"),
            "report_date": _string(raw_metadata.get("report_date") or metadata.get("report_date"), ""),
            "location": _string(raw_metadata.get("location") or metadata.get("location"), ""),
            "weather": _string(
                raw_metadata.get("weather")
                or metadata.get("weather")
                or weather.get("summary")
                or "Weather data unavailable"
            ),
            "prepared_by": _string(raw_metadata.get("prepared_by") or metadata.get("prepared_by"), "SiteScribe AI"),
        },
        "summary": _string(data.get("summary"), ""),
        "progress_update": _string(data.get("progress_update"), ""),
        "additional_notes": _string(data.get("additional_notes"), ""),
    }

    work_completed: list[dict[str, str]] = []
    for item in data.get("work_completed", []) if isinstance(data.get("work_completed"), list) else []:
        record = item if isinstance(item, dict) else {"task": item}
        task = _string(record.get("task") or record.get("description") or record.get("work") or record.get("item"))
        if not task:
            continue
        work_completed.append(
            {
                "area": _string(record.get("area") or record.get("location") or record.get("zone"), "General"),
                "task": task,
                "status": _choice(record.get("status") or record.get("progress") or record.get("state"), _WORK_STATUS_ALIASES, "completed"),
            }
        )
    normalized["work_completed"] = work_completed

    issues_delays: list[dict[str, str]] = []
    for item in data.get("issues_delays", []) if isinstance(data.get("issues_delays"), list) else []:
        record = item if isinstance(item, dict) else {"issue": item}
        issue = _string(record.get("issue") or record.get("title") or record.get("problem"))
        if not issue:
            continue
        issues_delays.append(
            {
                "issue": issue,
                "impact": _string(record.get("impact") or record.get("details") or record.get("note"), "Impact not specified"),
                "severity": _choice(record.get("severity") or record.get("priority"), _SEVERITY_ALIASES, "medium"),
            }
        )
    normalized["issues_delays"] = issues_delays

    safety_notes: list[dict[str, str]] = []
    for item in data.get("safety_notes", []) if isinstance(data.get("safety_notes"), list) else []:
        record = item if isinstance(item, dict) else {"observation": item}
        observation = _string(record.get("observation") or record.get("note") or record.get("hazard"))
        if not observation:
            continue
        safety_notes.append(
            {
                "observation": observation,
                "action_required": _string(
                    record.get("action_required") or record.get("action") or record.get("mitigation"),
                    "Follow up on site.",
                ),
            }
        )
    normalized["safety_notes"] = safety_notes

    next_steps: list[dict[str, str]] = []
    for item in data.get("next_steps", []) if isinstance(data.get("next_steps"), list) else []:
        record = item if isinstance(item, dict) else {"task": item}
        task = _string(record.get("task") or record.get("step") or record.get("description"))
        if not task:
            continue
        next_steps.append(
            {
                "task": task,
                "priority": _choice(record.get("priority"), _PRIORITY_ALIASES, "medium"),
            }
        )
    normalized["next_steps"] = next_steps

    raw_resources = data.get("resources_mentioned") if isinstance(data.get("resources_mentioned"), dict) else {}
    normalized["resources_mentioned"] = {
        "crew_summary": _string(
            raw_resources.get("crew_summary") or raw_resources.get("crew") or raw_resources.get("personnel"),
            "Crew not specified.",
        ),
        "equipment": _string_list(raw_resources.get("equipment")),
        "materials": _string_list(raw_resources.get("materials")),
    }

    normalized["photo_descriptions"] = _normalize_photo_descriptions(
        data.get("photo_descriptions"),
        photo_descriptions,
    )

    return normalized


def _llm_call(system_prompt: str, user_message: str, *, max_tokens: int = 4096, temperature: float = 0.3) -> dict:
    """Make a single LLM call using the configured provider and return parsed JSON.

    Retries up to 3 times on parse errors or API failures.
    """
    if config.PROVIDER == "groq":
        return _llm_call_groq(system_prompt, user_message, max_tokens=max_tokens, temperature=temperature)
    elif config.PROVIDER == "google":
        return _llm_call_google(system_prompt, user_message, max_tokens=max_tokens, temperature=temperature)
    else:
        return _llm_call_openai(system_prompt, user_message, max_tokens=max_tokens, temperature=temperature)


def _llm_call_groq(system_prompt: str, user_message: str, *, max_tokens: int, temperature: float) -> dict:
    from groq import Groq

    client = Groq(api_key=config.GROQ_API_KEY)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    last_error = None
    for attempt in range(3):
        if attempt > 0:
            time.sleep(5)
        try:
            response = client.chat.completions.create(
                model=config.SYNTHESIS_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as api_exc:
            last_error = api_exc
            logger.warning("Groq API error (attempt %d): %s", attempt + 1, api_exc)
            continue

        raw_text = response.choices[0].message.content
        if not raw_text:
            last_error = ValueError("Empty response from API")
            logger.warning("Empty Groq response, retrying (attempt %d)...", attempt + 1)
            continue

        try:
            return _parse_json_response(raw_text)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            logger.warning("Bad JSON from Groq (attempt %d): %s", attempt + 1, exc)
            continue

    raise ValueError(f"LLM call failed after 3 attempts: {last_error}")


def _llm_call_google(system_prompt: str, user_message: str, *, max_tokens: int, temperature: float) -> dict:
    from google import genai

    client = genai.Client(api_key=config.GOOGLE_API_KEY)
    prompt = system_prompt + "\n\n" + user_message

    last_error = None
    for attempt in range(2):
        response = client.models.generate_content(
            model=config.SYNTHESIS_MODEL,
            contents=prompt,
        )
        raw_text = response.text
        try:
            return _parse_json_response(raw_text)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            if attempt == 0:
                logger.warning("Bad JSON from Gemini, retrying... (%s)", exc)
            continue

    raise ValueError(f"LLM call failed after 2 attempts: {last_error}")


def _llm_call_openai(system_prompt: str, user_message: str, *, max_tokens: int, temperature: float) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=config.OPENAI_API_KEY)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    last_error = None
    for attempt in range(2):
        response = client.chat.completions.create(
            model=config.SYNTHESIS_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        raw_text = response.choices[0].message.content
        try:
            return _parse_json_response(raw_text)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            if attempt == 0:
                logger.warning("Bad JSON from OpenAI, retrying... (%s)", exc)
            continue

    raise ValueError(f"LLM call failed after 2 attempts: {last_error}")


# ---------------------------------------------------------------------------
# Agent 1: Transcript Analysis
# ---------------------------------------------------------------------------

def analyze_transcript(
    transcript: str,
    project_name: str,
    location: str,
    members: list[str],
) -> dict:
    """Extract structured report data from a voice transcript.

    Returns a dict with keys matching partial StructuredDailyReport fields:
    summary, work_completed, progress_update, issues_delays, safety_notes,
    next_steps, crew_summary, equipment, materials, additional_notes.
    """
    user_message_parts = [
        f"Project: {project_name}",
        f"Location: {location}",
        f"Team members: {', '.join(members) if members else 'Not specified'}",
        "",
        "Transcript:",
        transcript,
    ]
    user_message = "\n".join(user_message_parts)

    logger.info("Analyzing transcript (%d chars) for project %s", len(transcript), project_name)
    return _llm_call(_TRANSCRIPT_PROMPT, user_message)


# ---------------------------------------------------------------------------
# Agent 2: Photo Batch Analysis
# ---------------------------------------------------------------------------

def analyze_photos_batch(photos: list, db_session: Session) -> list[dict]:
    """Analyze each photo using the vision model and persist AI descriptions.

    Args:
        photos: list of ReportPhoto ORM objects
        db_session: active SQLAlchemy session for saving ai_description

    Returns:
        List of dicts with filename, caption, ai_description for each photo.
    """
    results = []
    for idx, photo in enumerate(photos, start=1):
        filename = photo.original_filename or Path(photo.file_path).name
        logger.info("[%d/%d] Analyzing photo %s", idx, len(photos), filename)

        try:
            analysis: PhotoAnalysis = analyze_photo(photo.file_path)
            ai_desc_parts = []
            if analysis.work_identified:
                ai_desc_parts.append(f"Work: {'; '.join(analysis.work_identified)}")
            if analysis.materials_visible:
                ai_desc_parts.append(f"Materials: {'; '.join(analysis.materials_visible)}")
            if analysis.equipment_visible:
                ai_desc_parts.append(f"Equipment: {'; '.join(analysis.equipment_visible)}")
            if analysis.progress_notes:
                ai_desc_parts.append(f"Progress: {analysis.progress_notes}")
            if analysis.safety_observations:
                ai_desc_parts.append(f"Safety: {'; '.join(analysis.safety_observations)}")
            if analysis.issues_or_concerns:
                ai_desc_parts.append(f"Issues: {'; '.join(analysis.issues_or_concerns)}")
            ai_description = ". ".join(ai_desc_parts) if ai_desc_parts else analysis.progress_notes or "No details extracted"
        except Exception as exc:
            logger.warning("Photo analysis failed for %s: %s", filename, exc)
            ai_description = f"Analysis failed: {exc}"

        if photo.caption:
            ai_description = f"{photo.caption} — {ai_description}"

        photo.ai_description = ai_description
        db_session.add(photo)

        results.append({
            "filename": filename,
            "caption": photo.caption or "",
            "ai_description": ai_description,
        })

    db_session.flush()
    return results


# ---------------------------------------------------------------------------
# Agent 3: Structured Report Synthesis
# ---------------------------------------------------------------------------

def synthesize_structured_report(
    transcript_analysis: dict,
    photo_descriptions: list[dict],
    weather: dict,
    metadata: dict,
) -> StructuredDailyReport:
    """Merge all analysis data into a final StructuredDailyReport via LLM.

    Args:
        transcript_analysis: output from analyze_transcript()
        photo_descriptions: output from analyze_photos_batch()
        weather: output from get_weather()
        metadata: dict with project_name, report_date, location, prepared_by
    """
    user_parts = [
        "=== METADATA ===",
        json.dumps(metadata, indent=2),
        "",
        "=== WEATHER ===",
        json.dumps(weather, indent=2),
        "",
        "=== TRANSCRIPT ANALYSIS ===",
        json.dumps(transcript_analysis, indent=2) if transcript_analysis else "No transcript data available.",
        "",
        f"=== PHOTO DESCRIPTIONS ({len(photo_descriptions)} photos) ===",
        json.dumps(photo_descriptions, indent=2) if photo_descriptions else "No photos available.",
    ]
    user_message = "\n".join(user_parts)

    logger.info("Synthesizing structured report for %s", metadata.get("project_name", "unknown"))
    data = _llm_call(_SYNTHESIS_V2_PROMPT, user_message, max_tokens=8192)
    normalized_data = _normalize_structured_report_data(
        data,
        metadata=metadata,
        weather=weather,
        photo_descriptions=photo_descriptions,
    )

    return StructuredDailyReport(**normalized_data)


# ---------------------------------------------------------------------------
# Agent 4: Report Review (conditional)
# ---------------------------------------------------------------------------

def review_report(report: StructuredDailyReport) -> tuple[StructuredDailyReport, list[str]]:
    """Review a structured report for completeness and quality.

    Returns (corrected_report, review_notes). Only called when
    quality_mode='high' or validation issues are detected.
    """
    user_message = json.dumps(report.model_dump(), indent=2)

    logger.info("Running quality review on report")
    data = _llm_call(_REVIEW_PROMPT, user_message, max_tokens=8192, temperature=0.2)

    corrected_data = data.get("corrected_report", data)
    review_notes = data.get("review_notes", [])

    corrected_report = StructuredDailyReport(**corrected_data)
    return corrected_report, review_notes
