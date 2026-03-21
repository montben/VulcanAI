"""Call session lifecycle endpoints for live voice recording."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db import CallSession, DailyReportRecord
from backend.utils.status import transition_status

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/projects/{project_id}/reports/{report_id}/calls",
    tags=["calls"],
)


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(422, f"Invalid {label}: {value!r}")


def _get_report_for_project(db: Session, project_id: str, report_id: str) -> DailyReportRecord:
    pid = _parse_uuid(project_id, "project_id")
    rid = _parse_uuid(report_id, "report_id")
    report = (
        db.query(DailyReportRecord)
        .filter(DailyReportRecord.id == rid, DailyReportRecord.project_id == pid)
        .first()
    )
    if not report:
        raise HTTPException(404, "Report not found for this project")
    return report


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CallSessionOut(BaseModel):
    call_id: str
    status: str
    stream_url: str


class EndCallRequest(BaseModel):
    transcript: str | None = None  # Final transcript if not already saved via WS


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def start_call(
    project_id: str,
    report_id: str,
    db: Session = Depends(get_db),
):
    """Create a new call session for live voice recording."""
    report = _get_report_for_project(db, project_id, report_id)
    rid = _parse_uuid(report_id, "report_id")

    # Check for existing active session (partial unique index will also catch this)
    active = (
        db.query(CallSession)
        .filter(CallSession.report_id == rid, CallSession.status == "active")
        .first()
    )
    if active:
        raise HTTPException(409, "An active call session already exists for this report")

    # Transition report status to recording
    transition_status(report, "recording")

    session = CallSession(report_id=rid)
    db.add(session)
    db.commit()
    db.refresh(session)

    stream_url = f"/api/projects/{project_id}/reports/{report_id}/calls/{session.id}/stream"

    return CallSessionOut(
        call_id=str(session.id),
        status=session.status,
        stream_url=stream_url,
    )


@router.post("/{call_id}/end", status_code=202)
def end_call(
    project_id: str,
    report_id: str,
    call_id: str,
    body: EndCallRequest = EndCallRequest(),
    db: Session = Depends(get_db),
):
    """End a call session and trigger report generation."""
    report = _get_report_for_project(db, project_id, report_id)
    rid = _parse_uuid(report_id, "report_id")
    cid = _parse_uuid(call_id, "call_id")

    session = (
        db.query(CallSession)
        .filter(CallSession.id == cid, CallSession.report_id == rid)
        .first()
    )
    if not session:
        raise HTTPException(404, "Call session not found")
    if session.status != "active":
        raise HTTPException(409, f"Call session is already '{session.status}'")

    # End the session
    now = datetime.now(timezone.utc)
    session.status = "ended"
    session.ended_at = now
    if session.started_at:
        session.duration_seconds = int((now - session.started_at).total_seconds())

    # The WebSocket handler saves the transcript in its finally block, but that
    # runs asynchronously after disconnect. To avoid a race where the pipeline
    # starts before the transcript is persisted, the client MUST include the
    # final transcript in the end-call request body. If neither source has it,
    # we still proceed (photo-only reports are valid) but log a warning.
    if body.transcript:
        session.full_transcript = body.transcript
    elif not session.full_transcript:
        logger.warning(
            "End-call for %s has no transcript. Client should send transcript "
            "in the request body to avoid race with WebSocket save.",
            call_id,
        )

    # Transition report to processing
    transition_status(report, "processing")
    db.commit()

    # Set up progress queue and kick off pipeline
    from queue import Queue
    from backend.api.reports import report_progress_queues
    from backend.pipeline.orchestrator import run_report_pipeline

    progress_queue = Queue()
    report_progress_queues[report_id] = progress_queue

    worker = threading.Thread(
        target=run_report_pipeline,
        args=(uuid.UUID(report_id),),
        kwargs={"quality_mode": "standard", "progress_queue": progress_queue},
        daemon=True,
    )
    worker.start()

    return {"status": "processing", "call_id": call_id}


# ─── WebSocket Live Transcription ────────────────────────────────────────────


@router.websocket("/{call_id}/stream")
async def call_stream(
    websocket: WebSocket,
    project_id: str,
    report_id: str,
    call_id: str,
):
    """WebSocket for live audio transcription via Deepgram."""
    await websocket.accept()

    # Validate call session exists and is active
    db = next(get_db())
    try:
        rid = _parse_uuid(report_id, "report_id")
        cid = _parse_uuid(call_id, "call_id")
        session = (
            db.query(CallSession)
            .filter(
                CallSession.id == cid,
                CallSession.report_id == rid,
                CallSession.status == "active",
            )
            .first()
        )
        if not session:
            await websocket.send_json(
                {"type": "error", "message": "Call session not found or not active"}
            )
            await websocket.close(code=4004)
            return
    finally:
        db.close()

    transcript_parts: list[str] = []

    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not deepgram_api_key:
        await websocket.send_json(
            {"type": "error", "message": "DEEPGRAM_API_KEY not configured"}
        )
        await websocket.close(code=4003)
        return

    try:
        from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents

        dg_client = DeepgramClient(deepgram_api_key)
        dg_connection = dg_client.listen.asyncwebsocket.v("1")

        async def on_message(self, result, **kwargs):
            try:
                transcript = result.channel.alternatives[0].transcript
                is_final = result.is_final

                if transcript:
                    if is_final:
                        transcript_parts.append(transcript)
                        await websocket.send_json(
                            {"type": "final", "text": transcript}
                        )
                    else:
                        await websocket.send_json(
                            {"type": "partial", "text": transcript}
                        )
            except Exception as e:
                logger.warning("Error processing Deepgram result: %s", e)

        async def on_error(self, error, **kwargs):
            logger.error("Deepgram error: %s", error)

        dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
        dg_connection.on(LiveTranscriptionEvents.Error, on_error)

        # The browser MediaRecorder typically produces audio/webm (Opus codec).
        # Do NOT hardcode encoding/sample_rate — Deepgram auto-detects the
        # container format when those fields are omitted.
        options = LiveOptions(
            model="nova-2",
            language="en",
            smart_format=True,
            interim_results=True,
            utterance_end_ms="1000",
            vad_events=True,
        )

        if not await dg_connection.start(options):
            await websocket.send_json(
                {"type": "error", "message": "Failed to connect to Deepgram"}
            )
            await websocket.close(code=4002)
            return

        await websocket.send_json({"type": "ready", "message": "Transcription started"})

        try:
            while True:
                data = await websocket.receive_bytes()
                await dg_connection.send(data)
        except WebSocketDisconnect:
            logger.info("Client disconnected from call %s", call_id)
        finally:
            await dg_connection.finish()

    except ImportError:
        await websocket.send_json(
            {"type": "error", "message": "deepgram-sdk not installed"}
        )
        await websocket.close(code=4001)
        return
    except Exception as e:
        logger.exception("WebSocket error for call %s", call_id)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if transcript_parts:
            full_transcript = " ".join(transcript_parts)
            db = next(get_db())
            try:
                session = db.query(CallSession).filter(CallSession.id == cid).first()
                if session and not session.full_transcript:
                    session.full_transcript = full_transcript
                    db.commit()
            finally:
                db.close()
