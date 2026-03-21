"""AI-powered edit suggestions for generated reports."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db import (
    CallSession,
    CallTranscript,
    DailyReportRecord,
    GeneratedReport,
    ReportPhoto,
)
from backend.pipeline.schemas import StructuredDailyReport

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/projects/{project_id}/reports/{report_id}",
    tags=["edits"],
)


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(422, f"Invalid {label}: {value!r}")


class EditSuggestion(BaseModel):
    field: str
    current: str
    suggested: str
    reason: str


class SuggestEditsRequest(BaseModel):
    report_json: dict


class SuggestEditsResponse(BaseModel):
    suggestions: list[EditSuggestion]
    revised_report: dict


@router.post("/suggest-edits")
def suggest_edits(
    project_id: str,
    report_id: str,
    body: SuggestEditsRequest,
    db: Session = Depends(get_db),
):
    """AI suggests edits to the current draft report."""
    pid = _parse_uuid(project_id, "project_id")
    rid = _parse_uuid(report_id, "report_id")
    report = (
        db.query(DailyReportRecord)
        .filter(DailyReportRecord.id == rid, DailyReportRecord.project_id == pid)
        .first()
    )
    if not report:
        raise HTTPException(404, "Report not found")

    try:
        StructuredDailyReport.model_validate(body.report_json)
    except Exception as e:
        raise HTTPException(422, f"Invalid report JSON: {e}")

    # Load context: transcript + photo analyses
    transcript_text = ""
    latest_session = (
        db.query(CallSession)
        .filter(
            CallSession.report_id == rid,
            CallSession.status == "ended",
            CallSession.full_transcript.isnot(None),
        )
        .order_by(CallSession.ended_at.desc())
        .first()
    )
    if latest_session:
        transcript_text = latest_session.full_transcript or ""

    if not transcript_text:
        transcripts = (
            db.query(CallTranscript)
            .filter(CallTranscript.report_id == rid)
            .order_by(CallTranscript.prompt_number.asc().nulls_last())
            .all()
        )
        transcript_text = " ".join(t.raw_transcript for t in transcripts)

    photos = (
        db.query(ReportPhoto)
        .filter(ReportPhoto.report_id == rid)
        .order_by(ReportPhoto.sort_order)
        .all()
    )
    photo_context = [
        {
            "filename": p.original_filename or "",
            "caption": p.caption or "",
            "ai_description": p.ai_description or "",
        }
        for p in photos
    ]

    # Load system prompt
    from pathlib import Path

    prompt_path = (
        Path(__file__).resolve().parent.parent
        / "pipeline"
        / "prompts"
        / "edit_suggestions.txt"
    )
    system_prompt = prompt_path.read_text(encoding="utf-8")

    user_prompt = f"""Current report JSON:
{json.dumps(body.report_json, indent=2)}

Original transcript:
{transcript_text or "(no transcript available)"}

Photo analyses:
{json.dumps(photo_context, indent=2)}

Analyze the report and suggest improvements. Return JSON with "suggestions" and "revised_report"."""

    from backend.pipeline import config

    try:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        if config.PROVIDER == "google":
            from google import genai

            client = genai.Client(api_key=config.GOOGLE_API_KEY)
            response = client.models.generate_content(
                model=config.SYNTHESIS_MODEL,
                contents=f"{system_prompt}\n\n{user_prompt}",
            )
            result_text = response.text
        elif config.PROVIDER == "groq":
            from groq import Groq

            client = Groq(api_key=config.GROQ_API_KEY)
            response = client.chat.completions.create(
                model=config.SYNTHESIS_MODEL,
                messages=messages,
                temperature=0.3,
            )
            result_text = response.choices[0].message.content
        elif config.PROVIDER == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=config.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model=config.SYNTHESIS_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            result_text = response.choices[0].message.content
        else:
            raise HTTPException(500, f"Unsupported provider: {config.PROVIDER}")

        from backend.pipeline.agents import _parse_json_response

        result = _parse_json_response(result_text)
        suggestions = result.get("suggestions", [])
        revised = result.get("revised_report", body.report_json)

        return SuggestEditsResponse(
            suggestions=[EditSuggestion(**s) for s in suggestions],
            revised_report=revised,
        )

    except json.JSONDecodeError as e:
        raise HTTPException(502, f"AI returned invalid JSON: {e}")
    except Exception as e:
        logger.exception("Edit suggestion failed")
        raise HTTPException(502, f"AI suggestion failed: {e}")
