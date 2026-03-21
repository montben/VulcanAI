"""CRUD routes for daily reports, photos, transcripts, and generated reports."""

from __future__ import annotations

import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db  # load_dotenv runs here
from backend.models.db import (
    CallTranscript,
    DailyReportRecord,
    GeneratedReport,
    ReportPhoto,
)

router = APIRouter(prefix="/api/projects/{project_id}/reports", tags=["reports"])


def _get_upload_dir() -> str:
    return os.getenv("UPLOAD_DIR", "./uploads")


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(422, f"Invalid {label}: {value!r}")


def _get_report_for_project(db: Session, project_id: str, report_id: str) -> DailyReportRecord:
    """Fetch a report and verify it belongs to the given project."""
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


class ReportCreate(BaseModel):
    report_date: date
    weather_summary: str | None = None
    weather_temp_f: float | None = None
    weather_conditions: str | None = None
    created_by: str | None = None


class ReportOut(BaseModel):
    id: str
    project_id: str
    report_date: date
    weather_summary: str | None
    weather_temp_f: float | None
    weather_conditions: str | None
    status: str
    photo_count: int = 0
    transcript_count: int = 0
    has_generated_report: bool = False

    model_config = {"from_attributes": True}


class PhotoOut(BaseModel):
    id: str
    file_path: str
    original_filename: str | None
    caption: str | None
    sort_order: int


class TranscriptOut(BaseModel):
    id: str
    raw_transcript: str
    duration_seconds: int | None
    prompt_number: int | None


class GeneratedReportOut(BaseModel):
    id: str
    report_json: dict
    pdf_path: str | None


class ReportDetail(BaseModel):
    id: str
    project_id: str
    report_date: date
    weather_summary: str | None
    weather_temp_f: float | None
    weather_conditions: str | None
    status: str
    photos: list[PhotoOut] = Field(default_factory=list)
    transcripts: list[TranscriptOut] = Field(default_factory=list)
    generated_reports: list[GeneratedReportOut] = Field(default_factory=list)


# ─── Routes ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ReportOut])
def list_reports(project_id: str, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    reports = (
        db.query(DailyReportRecord)
        .filter(DailyReportRecord.project_id == pid)
        .order_by(DailyReportRecord.report_date.desc())
        .all()
    )
    return [
        ReportOut(
            id=str(r.id), project_id=str(r.project_id), report_date=r.report_date,
            weather_summary=r.weather_summary, weather_temp_f=r.weather_temp_f,
            weather_conditions=r.weather_conditions, status=r.status,
            photo_count=len(r.photos), transcript_count=len(r.transcripts),
            has_generated_report=len(r.generated_reports) > 0,
        )
        for r in reports
    ]


@router.post("", response_model=ReportOut, status_code=201)
def create_report(project_id: str, body: ReportCreate, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")

    from backend.models.db import Member, Project
    if not db.query(Project).filter(Project.id == pid).first():
        raise HTTPException(404, "Project not found")

    created_by_id = None
    if body.created_by:
        created_by_id = _parse_uuid(body.created_by, "created_by")
        if not db.query(Member).filter(Member.id == created_by_id).first():
            raise HTTPException(404, "Member not found for created_by")

    report = DailyReportRecord(
        project_id=pid,
        report_date=body.report_date,
        weather_summary=body.weather_summary,
        weather_temp_f=body.weather_temp_f,
        weather_conditions=body.weather_conditions,
        created_by=created_by_id,
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A report already exists for this project and date")
    db.refresh(report)
    return ReportOut(
        id=str(report.id), project_id=str(report.project_id),
        report_date=report.report_date, weather_summary=report.weather_summary,
        weather_temp_f=report.weather_temp_f, weather_conditions=report.weather_conditions,
        status=report.status,
    )


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(project_id: str, report_id: str, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    rid = _parse_uuid(report_id, "report_id")
    report = (
        db.query(DailyReportRecord)
        .options(
            joinedload(DailyReportRecord.photos),
            joinedload(DailyReportRecord.transcripts),
            joinedload(DailyReportRecord.generated_reports),
        )
        .filter(DailyReportRecord.id == rid, DailyReportRecord.project_id == pid)
        .first()
    )
    if not report:
        raise HTTPException(404, "Report not found")

    return ReportDetail(
        id=str(report.id), project_id=str(report.project_id),
        report_date=report.report_date, weather_summary=report.weather_summary,
        weather_temp_f=report.weather_temp_f, weather_conditions=report.weather_conditions,
        status=report.status,
        photos=[
            PhotoOut(id=str(p.id), file_path=p.file_path, original_filename=p.original_filename,
                     caption=p.caption, sort_order=p.sort_order)
            for p in sorted(report.photos, key=lambda p: p.sort_order)
        ],
        transcripts=[
            TranscriptOut(id=str(t.id), raw_transcript=t.raw_transcript,
                          duration_seconds=t.duration_seconds, prompt_number=t.prompt_number)
            for t in report.transcripts
        ],
        generated_reports=[
            GeneratedReportOut(id=str(g.id), report_json=g.report_json, pdf_path=g.pdf_path)
            for g in report.generated_reports
        ],
    )


@router.delete("/{report_id}", status_code=204)
def delete_report(project_id: str, report_id: str, db: Session = Depends(get_db)):
    report = _get_report_for_project(db, project_id, report_id)
    db.delete(report)
    db.commit()


# ─── Photo upload ────────────────────────────────────────────────────────────


@router.post("/{report_id}/photos", status_code=201)
async def upload_photo(
    project_id: str,
    report_id: str,
    photo: UploadFile = File(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
):
    _get_report_for_project(db, project_id, report_id)

    photo_dir = os.path.join(_get_upload_dir(), project_id, report_id)
    os.makedirs(photo_dir, exist_ok=True)

    filename = f"{uuid.uuid4()}_{photo.filename}"
    file_path = os.path.join(photo_dir, filename)
    with open(file_path, "wb") as f:
        f.write(await photo.read())

    rid = _parse_uuid(report_id, "report_id")
    existing_count = db.query(ReportPhoto).filter(ReportPhoto.report_id == rid).count()

    record = ReportPhoto(
        report_id=rid,
        file_path=file_path,
        original_filename=photo.filename,
        caption=caption or None,
        sort_order=existing_count,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return PhotoOut(
        id=str(record.id), file_path=record.file_path,
        original_filename=record.original_filename,
        caption=record.caption, sort_order=record.sort_order,
    )


# ─── Transcript storage ─────────────────────────────────────────────────────


class TranscriptCreate(BaseModel):
    raw_transcript: str
    duration_seconds: int | None = None
    prompt_number: int | None = None


@router.post("/{report_id}/transcripts", status_code=201)
def add_transcript(
    project_id: str, report_id: str, body: TranscriptCreate, db: Session = Depends(get_db),
):
    _get_report_for_project(db, project_id, report_id)
    rid = _parse_uuid(report_id, "report_id")
    transcript = CallTranscript(
        report_id=rid,
        raw_transcript=body.raw_transcript,
        duration_seconds=body.duration_seconds,
        prompt_number=body.prompt_number,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return TranscriptOut(
        id=str(transcript.id), raw_transcript=transcript.raw_transcript,
        duration_seconds=transcript.duration_seconds, prompt_number=transcript.prompt_number,
    )


# ─── Generated report storage ───────────────────────────────────────────────


class GeneratedReportCreate(BaseModel):
    report_json: dict
    pdf_path: str | None = None


@router.post("/{report_id}/generated", status_code=201)
def save_generated_report(
    project_id: str, report_id: str, body: GeneratedReportCreate, db: Session = Depends(get_db),
):
    report = _get_report_for_project(db, project_id, report_id)
    rid = _parse_uuid(report_id, "report_id")
    record = GeneratedReport(
        report_id=rid,
        report_json=body.report_json,
        pdf_path=body.pdf_path,
    )
    db.add(record)
    report.status = "complete"

    db.commit()
    db.refresh(record)
    return GeneratedReportOut(id=str(record.id), report_json=record.report_json, pdf_path=record.pdf_path)
