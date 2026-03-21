"""CRUD routes for construction projects."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models.db import Project, ProjectMember


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(422, f"Invalid {label}: {value!r}")

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ─── Schemas ─────────────────────────────────────────────────────────────────


class ProjectCreate(BaseModel):
    name: str
    client: str | None = None
    location_address: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    project_type: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None
    profile_image_url: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    client: str | None = None
    location_address: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    project_type: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None
    status: str | None = None
    profile_image_url: str | None = None


class MemberRef(BaseModel):
    id: str
    name: str
    role: str


class ProjectOut(BaseModel):
    id: str
    name: str
    client: str | None
    location_address: str | None
    project_type: str | None
    start_date: date | None
    expected_end_date: date | None
    status: str
    profile_image_url: str | None
    members: list[MemberRef] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AddMemberBody(BaseModel):
    member_id: str
    role: str = "worker"


# ─── Routes ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ProjectOut])
def list_projects(status: str | None = None, limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    q = db.query(Project).options(joinedload(Project.member_links).joinedload(ProjectMember.member))
    if status:
        q = q.filter(Project.status == status)
    projects = q.order_by(Project.created_at.desc()).limit(limit).offset(offset).all()

    result = []
    for p in projects:
        members = [
            MemberRef(id=str(pm.member.id), name=pm.member.name, role=pm.role)
            for pm in p.member_links
        ]
        result.append(ProjectOut(
            id=str(p.id), name=p.name, client=p.client,
            location_address=p.location_address, project_type=p.project_type,
            start_date=p.start_date, expected_end_date=p.expected_end_date,
            status=p.status, profile_image_url=p.profile_image_url,
            members=members,
        ))
    return result


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(**body.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectOut(
        id=str(project.id), name=project.name, client=project.client,
        location_address=project.location_address, project_type=project.project_type,
        start_date=project.start_date, expected_end_date=project.expected_end_date,
        status=project.status, profile_image_url=project.profile_image_url,
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    project = (
        db.query(Project)
        .options(joinedload(Project.member_links).joinedload(ProjectMember.member))
        .filter(Project.id == pid)
        .first()
    )
    if not project:
        raise HTTPException(404, "Project not found")
    members = [
        MemberRef(id=str(pm.member.id), name=pm.member.name, role=pm.role)
        for pm in project.member_links
    ]
    return ProjectOut(
        id=str(project.id), name=project.name, client=project.client,
        location_address=project.location_address, project_type=project.project_type,
        start_date=project.start_date, expected_end_date=project.expected_end_date,
        status=project.status, profile_image_url=project.profile_image_url,
        members=members,
    )


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    project = db.query(Project).filter(Project.id == pid).first()
    if not project:
        raise HTTPException(404, "Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return ProjectOut(
        id=str(project.id), name=project.name, client=project.client,
        location_address=project.location_address, project_type=project.project_type,
        start_date=project.start_date, expected_end_date=project.expected_end_date,
        status=project.status, profile_image_url=project.profile_image_url,
    )


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    project = db.query(Project).filter(Project.id == pid).first()
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()


@router.post("/{project_id}/members", status_code=201)
def add_member_to_project(project_id: str, body: AddMemberBody, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    mid = _parse_uuid(body.member_id, "member_id")

    # Verify both resources exist before inserting
    if not db.query(Project).filter(Project.id == pid).first():
        raise HTTPException(404, "Project not found")
    from backend.models.db import Member
    if not db.query(Member).filter(Member.id == mid).first():
        raise HTTPException(404, "Member not found")

    pm = ProjectMember(project_id=pid, member_id=mid, role=body.role)
    db.add(pm)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Member is already assigned to this project")
    return {"status": "added"}


@router.delete("/{project_id}/members/{member_id}", status_code=204)
def remove_member_from_project(project_id: str, member_id: str, db: Session = Depends(get_db)):
    pid = _parse_uuid(project_id, "project_id")
    mid = _parse_uuid(member_id, "member_id")
    pm = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == pid, ProjectMember.member_id == mid)
        .first()
    )
    if not pm:
        raise HTTPException(404, "Member not on project")
    db.delete(pm)
    db.commit()
