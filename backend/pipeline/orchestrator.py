"""Pipeline orchestrator — coordinates the full report generation flow.

Synchronous by design. Run in a background thread from the API layer.
"""

import logging
from queue import Queue
from uuid import UUID

from sqlalchemy.orm import joinedload

from backend.database import SessionLocal
from backend.models.db import (
    DailyReportRecord,
    GeneratedReport,
    Project,
    ProjectMember,
)
from backend.utils.status import transition_status

from .agents import (
    analyze_photos_batch,
    analyze_transcript,
    review_report,
    synthesize_structured_report,
)
from .weather import get_weather

logger = logging.getLogger(__name__)


def _emit(queue: Queue | None, payload: dict) -> None:
    """Push a progress event to the SSE queue, if one is attached."""
    if queue is not None:
        queue.put(payload)
    logger.info("Pipeline progress: %s", payload.get("stage", "unknown"))


def _aggregate_transcript(report: DailyReportRecord) -> str:
    """Build a combined transcript string from call sessions and legacy transcripts.

    Priority:
      1. Latest CallSession with status='ended' and full_transcript IS NOT NULL
      2. CallTranscript rows sorted by prompt_number (legacy guided flow)

    Returns empty string if no transcript data exists.
    """
    parts: list[str] = []

    # Primary: call_sessions (newest first)
    ended_sessions = sorted(
        [cs for cs in report.call_sessions if cs.status == "ended" and cs.full_transcript],
        key=lambda cs: cs.started_at,
        reverse=True,
    )
    if ended_sessions:
        parts.append(ended_sessions[0].full_transcript)

    # Append: legacy guided transcripts sorted by prompt_number
    guided = sorted(
        report.transcripts,
        key=lambda t: (t.prompt_number or 0),
    )
    for t in guided:
        if t.raw_transcript:
            parts.append(t.raw_transcript)

    return "\n\n".join(parts)


def _get_project_members(db, project_id: UUID) -> list[str]:
    """Return member names for a project."""
    links = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .options(joinedload(ProjectMember.member))
        .all()
    )
    return [link.member.name for link in links if link.member]


def run_report_pipeline(
    report_id: UUID,
    quality_mode: str = "standard",
    progress_queue: Queue | None = None,
) -> None:
    """Execute the full report generation pipeline synchronously.

    Designed to be called from a background thread. Communicates progress
    through an optional Queue consumed by the SSE endpoint.

    Stages:
      1. Load data
      2. Aggregate transcript
      3. Resolve weather
      4. Analyze transcript (LLM)
      5. Analyze photos (vision LLM)
      6. Synthesize structured report (LLM)
      7. Optional review (LLM)
      8. Save generated report
      9. Transition status -> generated
    """
    db = SessionLocal()
    try:
        # ── 1. Load report + project + photos + transcripts ──────────────
        _emit(progress_queue, {"stage": "loading", "message": "Loading report data"})

        report = (
            db.query(DailyReportRecord)
            .options(
                joinedload(DailyReportRecord.photos),
                joinedload(DailyReportRecord.transcripts),
                joinedload(DailyReportRecord.call_sessions),
                joinedload(DailyReportRecord.project),
            )
            .filter(DailyReportRecord.id == report_id)
            .first()
        )

        if not report:
            _emit(progress_queue, {"stage": "error", "message": f"Report {report_id} not found"})
            return

        project: Project = report.project
        members = _get_project_members(db, project.id)

        # Note: the API layer has already transitioned the report to "processing"
        # before spawning this thread. Do NOT call transition_status("processing")
        # here — it would raise 409 (processing -> processing is invalid).

        # ── 2. Aggregate transcript ──────────────────────────────────────
        transcript = _aggregate_transcript(report)
        has_transcript = bool(transcript.strip())

        # ── 3. Resolve weather ───────────────────────────────────────────
        _emit(progress_queue, {"stage": "weather", "message": "Resolving weather data"})
        weather = get_weather(
            lat=project.location_lat,
            lng=project.location_lng,
            date_str=str(report.report_date),
            existing_summary=report.weather_summary,
            existing_temp=report.weather_temp_f,
            existing_conditions=report.weather_conditions,
        )

        # ── 4. Analyze transcript ────────────────────────────────────────
        transcript_analysis: dict = {}
        if has_transcript:
            _emit(progress_queue, {"stage": "analyzing_transcript", "message": "Analyzing voice transcript"})
            transcript_analysis = analyze_transcript(
                transcript=transcript,
                project_name=project.name,
                location=project.location_address or "",
                members=members,
            )
        else:
            _emit(progress_queue, {"stage": "analyzing_transcript", "message": "No transcript data — skipping"})

        # ── 5. Analyze photos ────────────────────────────────────────────
        photos = sorted(report.photos, key=lambda p: p.sort_order)
        photo_descriptions: list[dict] = []
        if photos:
            _emit(progress_queue, {
                "stage": "analyzing_photos",
                "message": f"Analyzing {len(photos)} photos",
                "photo": 0,
                "total": len(photos),
            })
            photo_descriptions = analyze_photos_batch(photos, db)
            db.commit()

            for i, _desc in enumerate(photo_descriptions, start=1):
                _emit(progress_queue, {
                    "stage": "analyzing_photos",
                    "photo": i,
                    "total": len(photos),
                })
        else:
            _emit(progress_queue, {"stage": "analyzing_photos", "message": "No photos attached — skipping"})

        # ── 6. Synthesize structured report ──────────────────────────────
        _emit(progress_queue, {"stage": "synthesizing", "message": "Generating structured report"})

        metadata = {
            "project_name": project.name,
            "report_date": str(report.report_date),
            "location": project.location_address or "",
            "prepared_by": "SiteScribe AI",
        }

        structured_report = synthesize_structured_report(
            transcript_analysis=transcript_analysis,
            photo_descriptions=photo_descriptions,
            weather=weather,
            metadata=metadata,
        )

        # ── 7. Conditional review ────────────────────────────────────────
        review_notes: list[str] = []
        needs_review = quality_mode == "high"

        if not needs_review:
            # Auto-detect quality issues
            if not structured_report.summary:
                needs_review = True
            elif not structured_report.work_completed and has_transcript:
                needs_review = True

        if needs_review:
            _emit(progress_queue, {"stage": "reviewing", "message": "Running quality review"})
            structured_report, review_notes = review_report(structured_report)
            if review_notes:
                logger.info("Review notes: %s", review_notes)

        # ── 8. Save GeneratedReport row ──────────────────────────────────
        _emit(progress_queue, {"stage": "saving", "message": "Saving generated report"})

        report_data = structured_report.model_dump()
        generated = GeneratedReport(
            report_id=report.id,
            report_json=report_data,
        )
        db.add(generated)

        # Persist weather to the report record if it was fetched externally
        if not report.weather_summary and weather.get("summary"):
            report.weather_summary = weather["summary"]
            report.weather_temp_f = weather.get("temp_f")
            report.weather_conditions = weather.get("conditions")

        # ── 9. Transition status -> generated ────────────────────────────
        transition_status(report, "generated")
        db.commit()

        # ── 10. Emit completion ──────────────────────────────────────────
        _emit(progress_queue, {
            "stage": "complete",
            "message": "Report generated successfully",
            "report": report_data,
            "review_notes": review_notes,
        })

    except Exception as exc:
        logger.exception("Pipeline failed for report %s", report_id)
        db.rollback()
        try:
            report = db.query(DailyReportRecord).filter(DailyReportRecord.id == report_id).first()
            if report:
                transition_status(report, "failed", error_message=str(exc))
                db.commit()
        except Exception:
            logger.exception("Failed to transition report to 'failed' status")

        _emit(progress_queue, {"stage": "error", "message": str(exc)})

    finally:
        db.close()
