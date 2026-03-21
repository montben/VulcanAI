"""Call session lifecycle endpoints for live voice recording."""

from __future__ import annotations

import asyncio
import base64
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
_CALL_TTS_MODEL = os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-thalia-en")
_CALL_UTTERANCE_END_MS = os.getenv("DEEPGRAM_UTTERANCE_END_MS", "1800")

_CALL_FALLBACK_PROMPTS = [
    "Tell me what got done on site today.",
    "How many people were on site, and which trades were working?",
    "Did any deliveries, inspections, delays, or blockers come up?",
    "Were there any safety observations or issues to note?",
    "What is planned for tomorrow?",
]

_CALL_INTERVIEWER_PROMPT = """You are SiteScribe AI, a concise construction daily report intake assistant speaking to a site superintendent.

Goal: gather enough information to fill a construction daily report with these categories:
- work completed
- crew and trades on site
- deliveries, inspections, delays, blockers
- safety observations and corrective actions
- next steps / tomorrow plan

Rules:
- Ask exactly one short follow-up question at a time.
- Keep questions conversational and under 20 words.
- Do not repeat questions already answered.
- Prioritize missing information over polishing.
- If you already have enough information for the categories above, set done=true and question to a short closing line.

Return ONLY valid JSON:
{
  "done": false,
  "question": "short follow-up question"
}
"""

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


_interviewer_client = None


def _get_interviewer_client():
    global _interviewer_client
    if _interviewer_client is None:
        from groq import Groq
        from backend.pipeline import config
        _interviewer_client = Groq(api_key=config.GROQ_API_KEY)
    return _interviewer_client


_MAX_USER_TURNS = 8


def _generate_next_question(conversation: list[dict[str, str]]) -> dict[str, object]:
    if not conversation:
        return {"done": False, "question": _CALL_FALLBACK_PROMPTS[0]}

    user_turns = sum(1 for turn in conversation if turn["speaker"] == "user")
    if user_turns >= _MAX_USER_TURNS:
        return {"done": True, "question": "That covers everything I need. Thanks!"}

    from backend.pipeline import config

    if config.PROVIDER != "groq" or not config.GROQ_API_KEY:
        if user_turns < len(_CALL_FALLBACK_PROMPTS):
            return {"done": False, "question": _CALL_FALLBACK_PROMPTS[user_turns]}
        return {"done": True, "question": "I have what I need for the report."}

    try:
        from backend.pipeline.json_utils import parse_json_response

        client = _get_interviewer_client()
        formatted_conversation = "\n".join(
            f"{turn['speaker'].capitalize()}: {turn['text']}" for turn in conversation
        )
        response = client.chat.completions.create(
            model=config.SYNTHESIS_MODEL,
            messages=[
                {"role": "system", "content": _CALL_INTERVIEWER_PROMPT},
                {"role": "user", "content": f"Conversation so far:\n{formatted_conversation}"},
            ],
            max_tokens=200,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        raw_text = response.choices[0].message.content or ""
        parsed = parse_json_response(raw_text)
        question = str(parsed.get("question", "")).strip()
        done = bool(parsed.get("done", False))
        if not question:
            raise ValueError("Empty question from Groq")
        return {"done": done, "question": question}
    except Exception as exc:
        logger.warning("Falling back to scripted interviewer prompt: %s", exc)
        if user_turns < len(_CALL_FALLBACK_PROMPTS):
            return {"done": False, "question": _CALL_FALLBACK_PROMPTS[user_turns]}
        return {"done": True, "question": "I have what I need for the report."}


def _format_conversation_transcript(conversation: list[dict[str, str]]) -> str:
    return "\n".join(
        f"{turn['speaker'].capitalize()}: {turn['text']}" for turn in conversation if turn.get("text")
    )


async def _synthesize_assistant_audio(dg_client, text: str) -> str | None:
    if not text:
        return None

    audio_chunks: list[bytes] = []
    async for chunk in dg_client.speak.v1.audio.generate(
        text=text,
        model=_CALL_TTS_MODEL,
        encoding="mp3",
    ):
        if chunk:
            audio_chunks.append(chunk)

    if not audio_chunks:
        return None

    return base64.b64encode(b"".join(audio_chunks)).decode("ascii")


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

    final_transcript = (body.transcript or "").strip() or (session.full_transcript or "").strip()
    if not final_transcript:
        raise HTTPException(
            409,
            "Transcript not ready yet. Retry after the websocket finishes saving it, "
            "or send the final transcript in the end-call request body.",
        )

    # End the session only after we know we have durable transcript input.
    now = datetime.now(timezone.utc)
    session.status = "ended"
    session.ended_at = now
    if session.started_at:
        session.duration_seconds = int((now - session.started_at).total_seconds())
    session.full_transcript = final_transcript

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

    conversation_turns: list[dict[str, str]] = []
    pending_user_segments: list[str] = []

    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not deepgram_api_key:
        await websocket.send_json(
            {"type": "error", "message": "DEEPGRAM_API_KEY not configured"}
        )
        await websocket.close(code=4003)
        return

    try:
        from deepgram import AsyncDeepgramClient
        from deepgram.core.events import EventType

        dg_client = AsyncDeepgramClient(api_key=deepgram_api_key)
        send_lock = asyncio.Lock()
        assistant_audio_tasks: set[asyncio.Task] = set()

        async with dg_client.listen.v1.connect(
            model="nova-3",
            language="en",
            smart_format="true",
            interim_results="true",
            utterance_end_ms=_CALL_UTTERANCE_END_MS,
            vad_events="true",
        ) as dg_connection:
            async def send_event(payload: dict) -> None:
                async with send_lock:
                    await websocket.send_json(payload)

            async def send_assistant_audio(text: str, done: bool) -> None:
                try:
                    audio_base64 = await _synthesize_assistant_audio(dg_client, text)
                    if not audio_base64:
                        return
                    await send_event(
                        {
                            "type": "assistant_audio",
                            "text": text,
                            "audio_base64": audio_base64,
                            "mime_type": "audio/mpeg",
                            "done": done,
                        }
                    )
                except Exception as exc:
                    logger.warning("Assistant audio generation failed: %s", exc)

            async def emit_assistant_turn(text: str, done: bool) -> None:
                if not text:
                    return
                conversation_turns.append({"speaker": "agent", "text": text})
                await send_event({"type": "assistant_text", "text": text, "done": done})
                task = asyncio.create_task(send_assistant_audio(text, done))
                assistant_audio_tasks.add(task)
                task.add_done_callback(assistant_audio_tasks.discard)

            async def maybe_advance_interviewer():
                utterance = " ".join(segment.strip() for segment in pending_user_segments if segment.strip()).strip()
                pending_user_segments.clear()
                if not utterance:
                    return

                conversation_turns.append({"speaker": "user", "text": utterance})
                next_turn = await asyncio.to_thread(_generate_next_question, list(conversation_turns))
                assistant_text = str(next_turn.get("question", "")).strip()
                if assistant_text:
                    await emit_assistant_turn(assistant_text, bool(next_turn.get("done", False)))

            async def on_message(result):
                try:
                    result_type = getattr(result, "type", None)
                    if result_type == "UtteranceEnd":
                        await maybe_advance_interviewer()
                        return

                    if result_type != "Results":
                        return

                    channel = getattr(result, "channel", None)
                    alternatives = getattr(channel, "alternatives", None) or []
                    if not alternatives:
                        return

                    transcript = getattr(alternatives[0], "transcript", "")
                    is_final = bool(getattr(result, "is_final", False))
                    if not transcript:
                        return

                    if is_final:
                        pending_user_segments.append(transcript)
                        await send_event({"type": "final", "text": transcript})
                    else:
                        await send_event({"type": "partial", "text": transcript})
                except Exception as e:
                    logger.warning("Error processing Deepgram result: %s", e)

            async def on_error(error):
                logger.error("Deepgram error: %s", error)
                try:
                    await send_event(
                        {"type": "error", "message": "Deepgram transcription failed"}
                    )
                except Exception:
                    pass

            dg_connection.on(EventType.MESSAGE, on_message)
            dg_connection.on(EventType.ERROR, on_error)

            listening_task = asyncio.create_task(dg_connection.start_listening())
            await send_event({"type": "ready", "message": "Transcription started"})
            initial_turn = await asyncio.to_thread(_generate_next_question, list(conversation_turns))
            initial_text = str(initial_turn.get("question", "")).strip()
            if initial_text:
                await emit_assistant_turn(initial_text, bool(initial_turn.get("done", False)))

            try:
                while True:
                    data = await websocket.receive_bytes()
                    await dg_connection.send_media(data)
            except WebSocketDisconnect:
                logger.info("Client disconnected from call %s", call_id)
            finally:
                try:
                    await dg_connection.send_finalize()
                except Exception:
                    pass
                try:
                    await dg_connection.send_close_stream()
                except Exception:
                    pass
                listening_task.cancel()
                try:
                    await listening_task
                except asyncio.CancelledError:
                    pass
                if assistant_audio_tasks:
                    for task in list(assistant_audio_tasks):
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*assistant_audio_tasks, return_exceptions=True)

    except ImportError as e:
        logger.error("Deepgram SDK import failed: %s", e)
        await websocket.send_json(
            {"type": "error", "message": f"Deepgram SDK import failed: {e}"}
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
        if pending_user_segments:
            utterance = " ".join(segment.strip() for segment in pending_user_segments if segment.strip()).strip()
            if utterance:
                conversation_turns.append({"speaker": "user", "text": utterance})
        if conversation_turns:
            full_transcript = _format_conversation_transcript(conversation_turns)
            db = next(get_db())
            try:
                session = db.query(CallSession).filter(CallSession.id == cid).first()
                if session and not session.full_transcript:
                    session.full_transcript = full_transcript
                    db.commit()
            finally:
                db.close()
