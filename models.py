from pydantic import BaseModel, Field
from typing import Optional


class PhotoAnalysis(BaseModel):
    photo_filename: str = Field(..., description="Original filename of the analyzed photo")
    work_identified: list[str] = Field(default_factory=list, description="Specific work activities visible in the photo")
    materials_visible: list[str] = Field(default_factory=list, description="Materials identifiable in the photo")
    safety_observations: list[str] = Field(default_factory=list, description="Safety-related observations (positive and concerns)")
    weather_conditions: str = Field(default="Not determinable from photo", description="Visible weather conditions")
    equipment_visible: list[str] = Field(default_factory=list, description="Equipment or tools visible in the photo")
    progress_notes: str = Field(default="", description="Description of work stage in this area")
    issues_or_concerns: list[str] = Field(default_factory=list, description="Visible issues: water damage, code concerns, etc.")


class VoiceNoteData(BaseModel):
    crew_count: Optional[int] = Field(None, description="Number of workers on site")
    trades_present: list[str] = Field(default_factory=list, description="Trades working today")
    delays: list[str] = Field(default_factory=list, description="Any delays encountered")
    decisions_made: list[str] = Field(default_factory=list, description="Decisions made on site")
    visitor_notes: str = Field(default="", description="Notes about inspectors/clients/visitors")
    additional_context: str = Field(default="", description="Any other relevant information")


class WorkItem(BaseModel):
    area: str
    description: str
    status: str  # "In Progress" | "Completed" | "Starting"


class SafetyItem(BaseModel):
    type: str  # "positive" | "concern"
    description: str
    action_needed: str  # "None" or description of corrective action


class PhotoCaption(BaseModel):
    filename: str
    caption: str


class DailyReport(BaseModel):
    date: str
    project_name: str
    company_name: str
    weather_summary: str
    crew_summary: str
    work_performed: list[WorkItem] = Field(default_factory=list)
    materials_used: list[str] = Field(default_factory=list)
    equipment_on_site: list[str] = Field(default_factory=list)
    safety_observations: list[SafetyItem] = Field(default_factory=list)
    issues_and_delays: list[str] = Field(default_factory=list)
    photos_with_captions: list[PhotoCaption] = Field(default_factory=list)
    next_day_plan: Optional[str] = Field(None, description="Expected work for the following day, if determinable")
