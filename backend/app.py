"""SiteScribe AI backend API.

This module is the backend entrypoint. The frontend lives separately in
`frontend/` and should call the API routes documented here or in `/api/docs`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import threading
import time
import uuid
from datetime import date
from pathlib import Path
from queue import Empty, Queue

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.responses import StreamingResponse

from backend.pipeline import config
from backend.pipeline.analyzer import analyze_photo
from backend.pipeline.models import VoiceNoteData
from backend.pipeline.pdf_generator import generate_report_pdf
from backend.pipeline.synthesizer import synthesize_report
from backend.pipeline.transcriber import transcribe_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_FRONTEND_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:4173",
    "http://localhost:5173",
)
TEMPLATE_PATH = Path(__file__).resolve().parent / "pipeline" / "templates" / "default_template.json"
TEMPLATE_CONFIG = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))

jobs: dict[str, dict[str, object]] = {}


def _parse_cors_origins() -> list[str]:
    configured = os.getenv("FRONTEND_ORIGINS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    legacy_origin = os.getenv("FRONTEND_URL", "").strip()
    if legacy_origin:
        return [legacy_origin, *DEFAULT_FRONTEND_ORIGINS]

    return list(DEFAULT_FRONTEND_ORIGINS)


def _build_guided_voice_data(prompt_transcripts: dict[int, str]) -> VoiceNoteData:
    context_parts: list[str] = []
    voice_data: dict[str, str | list[str]] = {}

    if 1 in prompt_transcripts:
        context_parts.append(f"Crew: {prompt_transcripts[1]}")
    if 2 in prompt_transcripts:
        voice_data["deliveries"] = [prompt_transcripts[2]]
        context_parts.append(f"Deliveries: {prompt_transcripts[2]}")
    if 3 in prompt_transcripts:
        voice_data["delays"] = [prompt_transcripts[3]]
        context_parts.append(f"Delays: {prompt_transcripts[3]}")
    if 4 in prompt_transcripts:
        voice_data["safety_notes"] = prompt_transcripts[4]
        context_parts.append(f"Safety: {prompt_transcripts[4]}")
    if 5 in prompt_transcripts:
        voice_data["visitor_notes"] = prompt_transcripts[5]
        voice_data["decisions_made"] = [prompt_transcripts[5]]
        context_parts.append(f"Visitors/Decisions: {prompt_transcripts[5]}")
    if 6 in prompt_transcripts:
        voice_data["next_day_plan"] = prompt_transcripts[6]
        context_parts.append(f"Tomorrow's Plan: {prompt_transcripts[6]}")

    voice_data["additional_context"] = "\n".join(context_parts)
    return VoiceNoteData(**voice_data)


def _save_terminal_event(job_id: str, event: dict[str, object]) -> None:
    jobs[job_id]["terminal_event"] = event
    queue = jobs[job_id]["queue"]
    assert isinstance(queue, Queue)
    queue.put(event)


def _run_pipeline(
    job_id: str,
    photos_dir: str,
    photo_files: list[str],
    voice_path: str | None,
    guided_voice_paths: dict[int, str] | None,
    project_name: str,
    company_name: str,
) -> None:
    """Run the full report pipeline in a background thread."""
    queue = jobs[job_id]["queue"]
    assert isinstance(queue, Queue)
    today = date.today().strftime("%Y-%m-%d")

    try:
        voice_notes = None

        if guided_voice_paths:
            total_clips = len(guided_voice_paths)
            queue.put({"stage": "transcribing", "message": f"Transcribing voice notes (0/{total_clips})..."})

            prompt_transcripts: dict[int, str] = {}
            for transcribed, prompt_num in enumerate(sorted(guided_voice_paths), start=1):
                voice_file_path = guided_voice_paths[prompt_num]
                queue.put(
                    {
                        "stage": "transcribing",
                        "message": f"Transcribing voice notes ({transcribed}/{total_clips})...",
                    }
                )
                try:
                    prompt_transcripts[prompt_num] = transcribe_audio(voice_file_path)
                except Exception as exc:  # pragma: no cover - provider errors are runtime-specific
                    logger.warning("Transcription failed for prompt %d: %s", prompt_num, exc)

                if transcribed < total_clips and config.PROVIDER == "groq":
                    time.sleep(2)

            voice_notes = _build_guided_voice_data(prompt_transcripts)
            queue.put({"stage": "transcribing_done", "message": f"Transcribed {total_clips} voice note(s)."})

        elif voice_path:
            queue.put({"stage": "transcribing", "message": "Transcribing voice note..."})
            try:
                transcript = transcribe_audio(voice_path)
                voice_notes = VoiceNoteData(additional_context=transcript)
                queue.put({"stage": "transcribing_done", "message": "Voice note transcribed."})
            except Exception as exc:  # pragma: no cover - provider errors are runtime-specific
                logger.warning("Transcription failed: %s", exc)
                queue.put(
                    {
                        "stage": "transcribing_done",
                        "message": f"Transcription failed ({exc}), continuing without voice note.",
                    }
                )

        total_photos = len(photo_files)
        analyses = []
        for photo_number, photo_path in enumerate(photo_files, start=1):
            filename = os.path.basename(photo_path)
            queue.put(
                {
                    "stage": "analyzing",
                    "photo": photo_number,
                    "total": total_photos,
                    "filename": filename,
                    "message": f"Analyzing photo {photo_number}/{total_photos}...",
                }
            )
            try:
                analyses.append(analyze_photo(photo_path))
            except Exception as exc:  # pragma: no cover - provider errors are runtime-specific
                logger.warning("Photo analysis failed for %s: %s", filename, exc)

            if photo_number < total_photos and config.PROVIDER == "groq":
                time.sleep(2)

        if not analyses:
            _save_terminal_event(job_id, {"stage": "error", "message": "Error: No photos could be analyzed."})
            return

        queue.put({"stage": "synthesizing", "message": "Synthesizing report narrative..."})
        if config.PROVIDER == "groq":
            time.sleep(5)

        report = synthesize_report(analyses, voice_notes, project_name, company_name, today)

        queue.put({"stage": "generating_pdf", "message": "Generating PDF..."})
        safe_project_name = project_name.replace(" ", "_").replace("/", "_")
        pdf_filename = f"{today}_{safe_project_name}.pdf"
        pdf_path = os.path.join(photos_dir, pdf_filename)
        generate_report_pdf(report, photos_dir, pdf_path, TEMPLATE_CONFIG)

        jobs[job_id]["pdf_path"] = pdf_path
        jobs[job_id]["report"] = report

        _save_terminal_event(
            job_id,
            {
                "stage": "complete",
                "message": "Report ready!",
                "report": report.model_dump(),
                "pdf_url": f"/api/download/{job_id}",
            },
        )
    except Exception as exc:  # pragma: no cover - provider errors are runtime-specific
        logger.exception("Pipeline error for job %s", job_id)
        _save_terminal_event(job_id, {"stage": "error", "message": f"Error: {exc}"})


async def _write_upload(destination: Path, upload: UploadFile) -> None:
    destination.write_bytes(await upload.read())


app = FastAPI(
    title="SiteScribe AI Backend API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, object]:
    return {
        "service": "sitescribe-backend",
        "message": "Frontend assets live in ./frontend. Backend docs are available at /api/docs.",
        "docs_url": app.docs_url,
        "openapi_url": app.openapi_url,
    }


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "sitescribe-backend",
        "provider": config.PROVIDER,
        "docs_url": app.docs_url,
    }


@app.get("/api/endpoints")
async def endpoints_manifest() -> dict[str, object]:
    return {
        "docs_url": app.docs_url,
        "openapi_url": app.openapi_url,
        "frontend_config": {
            "apiBaseUrl": "http://localhost:8000",
            "endpoints": {
                "generateReport": "/api/generate",
                "reportProgress": "/api/progress",
                "reportDownload": "/api/download",
                "health": "/api/health",
                "endpointManifest": "/api/endpoints",
            },
        },
    }


@app.post("/api/generate")
async def generate_report(
    project_name: str = Form("Project"),
    company_name: str = Form("Construction Co."),
    photos: list[UploadFile] = File(...),
    voice_note: UploadFile | None = File(None),
    voice_prompt_1: UploadFile | None = File(None),
    voice_prompt_2: UploadFile | None = File(None),
    voice_prompt_3: UploadFile | None = File(None),
    voice_prompt_4: UploadFile | None = File(None),
    voice_prompt_5: UploadFile | None = File(None),
    voice_prompt_6: UploadFile | None = File(None),
) -> dict[str, str]:
    """Start report generation and return a job id for progress tracking."""
    job_id = str(uuid.uuid4())
    temp_dir = Path(tempfile.mkdtemp(prefix=f"sitescribe_{job_id[:8]}_"))

    photo_paths: list[str] = []
    for photo in photos:
        if photo.filename:
            destination = temp_dir / photo.filename
            await _write_upload(destination, photo)
            photo_paths.append(str(destination))

    guided_voice_paths: dict[int, str] = {}
    guided_uploads = [
        voice_prompt_1,
        voice_prompt_2,
        voice_prompt_3,
        voice_prompt_4,
        voice_prompt_5,
        voice_prompt_6,
    ]
    for index, clip in enumerate(guided_uploads, start=1):
        if clip and clip.filename:
            destination = temp_dir / f"voice_prompt_{index}.webm"
            await _write_upload(destination, clip)
            guided_voice_paths[index] = str(destination)

    voice_path = None
    if not guided_voice_paths and voice_note and voice_note.filename:
        destination = temp_dir / voice_note.filename
        await _write_upload(destination, voice_note)
        voice_path = str(destination)

    jobs[job_id] = {
        "queue": Queue(),
        "temp_dir": str(temp_dir),
        "pdf_path": None,
        "report": None,
        "terminal_event": None,
    }

    worker = threading.Thread(
        target=_run_pipeline,
        args=(
            job_id,
            str(temp_dir),
            photo_paths,
            voice_path,
            guided_voice_paths or None,
            project_name,
            company_name,
        ),
        daemon=True,
    )
    worker.start()

    return {"job_id": job_id}


@app.get("/api/progress/{job_id}")
async def progress_stream(job_id: str):
    """Server-sent events endpoint for job progress updates."""
    if job_id not in jobs:
        return JSONResponse({"error": "Job not found"}, status_code=404)

    async def event_generator():
        queue = jobs[job_id]["queue"]
        terminal_event = jobs[job_id]["terminal_event"]
        assert isinstance(queue, Queue)

        while True:
            try:
                event = queue.get(block=False)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("stage") in {"complete", "error"}:
                    break
            except Empty:
                if terminal_event:
                    yield f"data: {json.dumps(terminal_event)}\n\n"
                    break
                yield ": keepalive\n\n"
                await asyncio.sleep(1)
                terminal_event = jobs[job_id]["terminal_event"]

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/download/{job_id}")
async def download_pdf(job_id: str):
    """Download the PDF generated for a completed job."""
    if job_id not in jobs or not jobs[job_id].get("pdf_path"):
        return JSONResponse({"error": "PDF not found"}, status_code=404)

    pdf_path = jobs[job_id]["pdf_path"]
    assert isinstance(pdf_path, str)
    if not os.path.exists(pdf_path):
        return JSONResponse({"error": "PDF file missing"}, status_code=404)

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8000")),
        reload=False,
    )
