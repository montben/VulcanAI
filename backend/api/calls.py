"""Call session lifecycle endpoints using Deepgram Voice Agent API."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import struct
import threading
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db import CallSession, DailyReportRecord
from backend.utils.status import transition_status

logger = logging.getLogger(__name__)

_AGENT_LISTEN_MODEL = os.getenv("DEEPGRAM_AGENT_LISTEN_MODEL", "nova-2")
_AGENT_LISTEN_VERSION = os.getenv(
    "DEEPGRAM_AGENT_LISTEN_VERSION",
    "v2" if _AGENT_LISTEN_MODEL.startswith("flux") else "v1",
)
_AGENT_TTS_MODEL = os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-orpheus-en")
_AGENT_SAMPLE_RATE = int(os.getenv("DEEPGRAM_AGENT_SAMPLE_RATE", "16000"))
_AGENT_THINK_TEMPERATURE = float(os.getenv("DEEPGRAM_AGENT_THINK_TEMPERATURE", "0.3"))
_AGENT_THINK_CONTEXT_LENGTH = os.getenv("DEEPGRAM_AGENT_THINK_CONTEXT_LENGTH", "max")
_DEEPGRAM_AGENT_WS_URL = os.getenv(
    "DEEPGRAM_AGENT_WS_URL",
    "wss://agent.deepgram.com/v1/agent/converse",
)
_GROQ_OPENAI_BASE_URL = os.getenv(
    "GROQ_OPENAI_BASE_URL",
    "https://api.groq.com/openai/v1/chat/completions",
)

_AGENT_THINK_PROMPT = """\
You are Vulcan AI, a practical construction colleague doing a quick end-of-day \
check-in with a site superintendent.

Your job is to gather enough detail for the daily report while sounding natural, \
brief, and useful, never like a form or checklist.

You should naturally learn about these topics without naming them explicitly:
- What work got done today
- Who was on site (crew, trades, headcount)
- Any deliveries, inspections, delays, or blockers
- Safety observations or concerns
- What's planned for tomorrow

Conversation rules:
- The greeting already asked the opening question. Do not ask another opener until the superintendent answers.
- They may cover multiple topics in one answer. Notice that and do not repeat covered ground.
- After each answer, acknowledge briefly and ask at most one follow-up.
- Ask follow-ups that build from what they just said instead of hopping category-to-category.
- If details are still missing, combine them naturally in one question when possible, for example: "Who all was out there, and did anything hold you up?"
- If their answer is vague or too short, ask one grounded follow-up tied to the last thing they mentioned.
- Do not turn the call into a checklist of work, crew, logistics, safety, and tomorrow asked one by one.
- Do not ask empty filler questions like "Anything else?", "That's it?", or "What's next then?" unless you already have the core report details.
- Keep responses jobsite-appropriate, conversational, and under 24 words.
- Once you have enough detail for the report, wrap up briefly with something like "Alright, I have what I need. End the call whenever you're ready."
"""

_AGENT_GREETING = "How'd today go out there?"

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


def _format_conversation_transcript(conversation: list[dict[str, str]]) -> str:
    return "\n".join(
        f"{turn['speaker'].capitalize()}: {turn['text']}" for turn in conversation if turn.get("text")
    )


def _make_wav(pcm_data: bytes, sample_rate: int = 16000) -> bytes:
    """Wrap raw linear16 PCM in a WAV header."""
    data_size = len(pcm_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 16, 1, 1, sample_rate,
        sample_rate * 2, 2, 16,
        b"data", data_size,
    )
    return header + pcm_data


def _append_conversation_turn(
    conversation: list[dict[str, str]],
    speaker: str,
    text: str,
) -> bool:
    """Append a normalized turn, ignoring blanks and exact consecutive duplicates."""
    normalized = str(text).strip()
    if not normalized:
        return False

    if conversation and conversation[-1]["speaker"] == speaker and conversation[-1]["text"] == normalized:
        return False

    conversation.append({"speaker": speaker, "text": normalized})
    return True


def _normalize_llm_endpoint_url(url: str) -> str:
    """Return a full LLM endpoint URL for providers that need one.

    Deepgram calls the configured URL directly. Groq's OpenAI-compatible
    documentation often shows a base URL (`.../openai/v1`) for SDK clients,
    but Voice Agent needs the full chat completions path.
    """
    normalized = url.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.netloc == "api.groq.com" and parsed.path == "/openai/v1":
        return f"{normalized}/chat/completions"
    return normalized


def _build_agent_think_config(model: str, groq_api_key: str) -> dict[str, Any]:
    if not groq_api_key:
        raise RuntimeError("GROQ_API_KEY not configured for the Deepgram Voice Agent think stage")

    return {
        "provider": {
            "type": "open_ai",
            "model": model,
            "temperature": _AGENT_THINK_TEMPERATURE,
        },
        "endpoint": {
            "url": _normalize_llm_endpoint_url(_GROQ_OPENAI_BASE_URL),
            "headers": {"authorization": f"Bearer {groq_api_key}"},
        },
        "prompt": _AGENT_THINK_PROMPT,
        "context_length": _AGENT_THINK_CONTEXT_LENGTH,
    }


def _build_agent_settings(model: str, groq_api_key: str) -> dict[str, Any]:
    listen_provider: dict[str, Any] = {
        "type": "deepgram",
        "model": _AGENT_LISTEN_MODEL,
        "version": _AGENT_LISTEN_VERSION,
    }
    if not _AGENT_LISTEN_MODEL.startswith("flux"):
        listen_provider["smart_format"] = True

    return {
        "type": "Settings",
        "audio": {
            "input": {
                "encoding": "linear16",
                "sample_rate": _AGENT_SAMPLE_RATE,
            },
            "output": {
                "encoding": "linear16",
                "sample_rate": _AGENT_SAMPLE_RATE,
            },
        },
        "agent": {
            "listen": {"provider": listen_provider},
            "think": _build_agent_think_config(model, groq_api_key),
            "speak": {
                "provider": {"type": "deepgram", "model": _AGENT_TTS_MODEL},
            },
            "greeting": _AGENT_GREETING,
        },
    }


async def _await_settings_applied(agent_ws, timeout: float = 10.0) -> list[str | bytes]:
    """Wait for SettingsApplied and return any messages received before it."""
    pending_messages: list[str | bytes] = []

    while True:
        raw_message = await asyncio.wait_for(agent_ws.recv(), timeout=timeout)
        if isinstance(raw_message, bytes):
            pending_messages.append(raw_message)
            continue

        try:
            payload = json.loads(raw_message)
        except json.JSONDecodeError:
            logger.warning("Ignoring non-JSON agent message before settings applied")
            continue

        event_type = payload.get("type")
        if event_type == "SettingsApplied":
            return pending_messages
        if event_type == "Error":
            description = payload.get("description", payload.get("message", "Voice Agent settings failed"))
            raise RuntimeError(description)

        pending_messages.append(raw_message)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CallSessionOut(BaseModel):
    call_id: str
    status: str
    stream_url: str


class EndCallRequest(BaseModel):
    transcript: str | None = None


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

    active = (
        db.query(CallSession)
        .filter(CallSession.report_id == rid, CallSession.status == "active")
        .first()
    )
    if active:
        raise HTTPException(409, "An active call session already exists for this report")

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

    now = datetime.now(timezone.utc)
    session.status = "ended"
    session.ended_at = now
    if session.started_at:
        session.duration_seconds = int((now - session.started_at).total_seconds())
    session.full_transcript = final_transcript

    transition_status(report, "processing")
    db.commit()

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


# ─── WebSocket Voice Agent ───────────────────────────────────────────────────


@router.websocket("/{call_id}/stream")
async def call_stream(
    websocket: WebSocket,
    project_id: str,
    report_id: str,
    call_id: str,
):
    """WebSocket proxy to Deepgram Voice Agent API.

    Browser sends raw linear16 PCM audio.
    Backend forwards to Deepgram Agent, which handles STT + LLM + TTS.
    Agent responses are forwarded back to the browser.
    """
    await websocket.accept()

    # Validate call session
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

    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not deepgram_api_key:
        await websocket.send_json({"type": "error", "message": "DEEPGRAM_API_KEY not configured"})
        await websocket.close(code=4003)
        return

    from backend.pipeline import config
    groq_api_key = config.GROQ_API_KEY or ""
    if not groq_api_key:
        await websocket.send_json(
            {"type": "error", "message": "GROQ_API_KEY not configured for voice agent analysis"}
        )
        await websocket.close(code=4003)
        return

    conversation_turns: list[dict[str, str]] = []
    audio_buffer = bytearray()
    send_lock = asyncio.Lock()
    last_assistant_text = ""

    async def send_event(payload: dict) -> None:
        async with send_lock:
            try:
                await websocket.send_json(payload)
            except Exception:
                pass

    try:
        import websockets

        agent_url = _DEEPGRAM_AGENT_WS_URL
        agent_headers = {"Authorization": f"Token {deepgram_api_key}"}

        async with websockets.connect(agent_url, additional_headers=agent_headers) as agent_ws:
            welcome_raw = await asyncio.wait_for(agent_ws.recv(), timeout=10)
            if not isinstance(welcome_raw, str):
                raise RuntimeError("Voice Agent connection did not return a Welcome payload")

            welcome = json.loads(welcome_raw)
            if welcome.get("type") != "Welcome":
                raise RuntimeError(f"Unexpected initial Voice Agent event: {welcome.get('type')!r}")

            settings = _build_agent_settings(config.SYNTHESIS_MODEL, groq_api_key)
            await agent_ws.send(json.dumps(settings))
            pending_agent_messages = await _await_settings_applied(agent_ws)

            await send_event({"type": "ready", "message": "Voice agent connected"})

            async def handle_agent_message(msg: str | bytes) -> None:
                nonlocal audio_buffer, last_assistant_text
                if isinstance(msg, bytes):
                    audio_buffer.extend(msg)
                    return

                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    logger.warning("Ignoring non-JSON agent message")
                    return

                event_type = data.get("type", "")

                if event_type == "ConversationText":
                    role = data.get("role", "")
                    content = data.get("content", "")
                    if role == "assistant":
                        if _append_conversation_turn(conversation_turns, "agent", content):
                            last_assistant_text = content.strip()
                            await send_event({"type": "assistant_text", "text": last_assistant_text})
                    elif role == "user":
                        if _append_conversation_turn(conversation_turns, "user", content):
                            await send_event({"type": "final", "text": content.strip()})
                    return

                if event_type == "AgentStartedSpeaking":
                    audio_buffer.clear()
                    return

                if event_type == "AgentAudioDone":
                    if audio_buffer:
                        wav_data = _make_wav(bytes(audio_buffer), _AGENT_SAMPLE_RATE)
                        b64 = base64.b64encode(wav_data).decode("ascii")
                        await send_event({
                            "type": "assistant_audio",
                            "text": last_assistant_text,
                            "audio_base64": b64,
                            "mime_type": "audio/wav",
                        })
                        audio_buffer.clear()
                    return

                if event_type == "UserStartedSpeaking":
                    audio_buffer.clear()
                    await send_event({"type": "user_speaking"})
                    return

                if event_type in ("Error", "Warning"):
                    desc = data.get("description", data.get("message", "Agent error"))
                    logger.warning("Agent %s: %s", event_type, desc)
                    if event_type == "Error":
                        await send_event({"type": "error", "message": desc})

            async def agent_to_browser():
                try:
                    for pending_message in pending_agent_messages:
                        await handle_agent_message(pending_message)

                    async for msg in agent_ws:
                        await handle_agent_message(msg)
                except websockets.ConnectionClosed:
                    logger.info("Agent WebSocket closed")

            # ── Forward browser audio → agent ──
            async def browser_to_agent():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await agent_ws.send(data)
                except WebSocketDisconnect:
                    logger.info("Client disconnected from call %s", call_id)
                except Exception as e:
                    logger.warning("Browser→agent forward error: %s", e)

            # Run both directions concurrently
            tasks = [
                asyncio.create_task(agent_to_browser()),
                asyncio.create_task(browser_to_agent()),
            ]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, asyncio.CancelledError):
                    raise exc
            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    except ImportError as e:
        logger.error("websockets import failed: %s", e)
        await websocket.send_json({"type": "error", "message": f"Missing dependency: {e}"})
        await websocket.close(code=4001)
        return
    except Exception as e:
        logger.exception("WebSocket error for call %s", call_id)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Save transcript
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
