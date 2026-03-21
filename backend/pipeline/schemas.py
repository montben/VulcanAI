"""V2 structured daily report schema.

All draft/finalize/edit endpoints validate against StructuredDailyReport
instead of raw dict. This gives the frontend fast feedback and prevents
malformed JSON from reaching PDF generation.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ReportMetadata(BaseModel):
    project_name: str
    report_date: str
    location: str
    weather: str
    prepared_by: str


class WorkCompletedItem(BaseModel):
    area: str
    task: str
    status: Literal["completed", "in_progress", "started"]


class IssueDelay(BaseModel):
    issue: str
    impact: str
    severity: Literal["low", "medium", "high"]


class SafetyNote(BaseModel):
    observation: str
    action_required: str


class NextStep(BaseModel):
    task: str
    priority: Literal["low", "medium", "high"]


class ResourcesMentioned(BaseModel):
    crew_summary: str
    equipment: list[str] = []
    materials: list[str] = []


class PhotoDescription(BaseModel):
    filename: str
    caption: str = ""
    ai_description: str = ""


class StructuredDailyReport(BaseModel):
    metadata: ReportMetadata
    summary: str
    work_completed: list[WorkCompletedItem] = []
    progress_update: str = ""
    issues_delays: list[IssueDelay] = []
    safety_notes: list[SafetyNote] = []
    next_steps: list[NextStep] = []
    resources_mentioned: ResourcesMentioned
    additional_notes: str = ""
    photo_descriptions: list[PhotoDescription] = []
