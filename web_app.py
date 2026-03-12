"""SiteScribe AI — FastAPI web server for the construction daily report pipeline."""

import asyncio
import json
import logging
import os
import shutil
import tempfile
import threading
import time
import uuid
from datetime import date
from pathlib import Path
from queue import Queue, Empty

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import StreamingResponse

import config
from analyzer import analyze_photo
from models import DailyReport, VoiceNoteData
from pdf_generator import generate_report_pdf
from synthesizer import synthesize_report
from transcriber import transcribe_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SiteScribe AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs: dict[str, dict] = {}

# Load template config once
_TEMPLATE_PATH = Path(__file__).parent / "templates" / "default_template.json"
TEMPLATE_CONFIG = json.loads(_TEMPLATE_PATH.read_text())


def _run_pipeline(job_id: str, photos_dir: str, photo_files: list[str],
                  voice_path: str | None, project_name: str, company_name: str):
    """Run the full pipeline in a background thread, posting progress events."""
    q: Queue = jobs[job_id]["queue"]
    today = date.today().strftime("%Y-%m-%d")

    try:
        # Step 1: Transcribe voice note (if provided)
        voice_notes = None
        if voice_path:
            q.put({"stage": "transcribing", "message": "Transcribing voice note..."})
            try:
                transcript = transcribe_audio(voice_path)
                voice_notes = VoiceNoteData(additional_context=transcript)
                q.put({"stage": "transcribing_done", "message": "Voice note transcribed."})
            except Exception as exc:
                logger.warning("Transcription failed: %s", exc)
                q.put({"stage": "transcribing_done", "message": f"Transcription failed ({exc}), continuing without voice note."})

        # Step 2: Analyze photos one-by-one
        total = len(photo_files)
        analyses = []
        for idx, photo_file in enumerate(photo_files, start=1):
            filename = os.path.basename(photo_file)
            q.put({
                "stage": "analyzing",
                "photo": idx,
                "total": total,
                "filename": filename,
                "message": f"Analyzing photo {idx}/{total}..."
            })
            try:
                analysis = analyze_photo(photo_file)
                analyses.append(analysis)
            except Exception as exc:
                logger.warning("Photo analysis failed for %s: %s", filename, exc)
            # Brief pause between photos for Groq rate limits
            if idx < total and config.PROVIDER == "groq":
                time.sleep(2)

        if not analyses:
            q.put({"stage": "error", "message": "Error: No photos could be analyzed."})
            return

        # Step 3: Synthesize report
        q.put({"stage": "synthesizing", "message": "Synthesizing report narrative..."})
        # Pause before synthesis for Groq rate limits
        if config.PROVIDER == "groq":
            time.sleep(5)
        report = synthesize_report(analyses, voice_notes, project_name, company_name, today)

        # Step 4: Generate PDF
        q.put({"stage": "generating_pdf", "message": "Generating PDF..."})
        safe_name = project_name.replace(" ", "_").replace("/", "_")
        pdf_filename = f"{today}_{safe_name}.pdf"
        pdf_path = os.path.join(photos_dir, pdf_filename)
        generate_report_pdf(report, photos_dir, pdf_path, TEMPLATE_CONFIG)

        # Store results
        jobs[job_id]["pdf_path"] = pdf_path
        jobs[job_id]["report"] = report

        # Step 5: Complete
        q.put({
            "stage": "complete",
            "message": "Report ready!",
            "report": report.model_dump(),
            "pdf_url": f"/api/download/{job_id}"
        })

    except Exception as exc:
        logger.exception("Pipeline error for job %s", job_id)
        q.put({"stage": "error", "message": f"Error: {exc}"})


@app.post("/api/generate")
async def generate_report(
    project_name: str = Form("Project"),
    company_name: str = Form("Construction Co."),
    photos: list[UploadFile] = File(...),
    voice_note: UploadFile | None = File(None),
):
    """Start report generation. Returns a job_id for progress tracking."""
    job_id = str(uuid.uuid4())

    # Create temp directory for this job
    tmp_dir = tempfile.mkdtemp(prefix=f"sitescribe_{job_id[:8]}_")

    # Save photos
    photo_paths = []
    for photo in photos:
        if photo.filename:
            dest = os.path.join(tmp_dir, photo.filename)
            with open(dest, "wb") as f:
                content = await photo.read()
                f.write(content)
            photo_paths.append(dest)

    # Save voice note if provided
    voice_path = None
    if voice_note and voice_note.filename:
        voice_dest = os.path.join(tmp_dir, voice_note.filename)
        with open(voice_dest, "wb") as f:
            content = await voice_note.read()
            f.write(content)
        voice_path = voice_dest

    # Initialize job state
    jobs[job_id] = {
        "queue": Queue(),
        "tmp_dir": tmp_dir,
        "pdf_path": None,
        "report": None,
    }

    # Start pipeline in background thread
    thread = threading.Thread(
        target=_run_pipeline,
        args=(job_id, tmp_dir, photo_paths, voice_path, project_name, company_name),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/api/progress/{job_id}")
async def progress_stream(job_id: str):
    """SSE endpoint — streams progress events for a job."""
    if job_id not in jobs:
        return HTMLResponse("Job not found", status_code=404)

    async def event_generator():
        q: Queue = jobs[job_id]["queue"]
        while True:
            try:
                event = q.get(block=False)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("stage") in ("complete", "error"):
                    break
            except Empty:
                # Send keep-alive comment every second
                yield ": keepalive\n\n"
                await asyncio.sleep(1)

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
    """Download the generated PDF for a job."""
    if job_id not in jobs or not jobs[job_id].get("pdf_path"):
        return HTMLResponse("PDF not found", status_code=404)

    pdf_path = jobs[job_id]["pdf_path"]
    if not os.path.exists(pdf_path):
        return HTMLResponse("PDF file missing", status_code=404)

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path),
    )


# Serve static files and index
STATIC_DIR = Path(__file__).parent / "static"


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(index_path.read_text())


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
