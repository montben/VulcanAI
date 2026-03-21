"""CRUD routes for team members."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db import Member


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(422, f"Invalid {label}: {value!r}")

router = APIRouter(prefix="/api/members", tags=["members"])


class MemberCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    role: str | None = None


class MemberUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    role: str | None = None


class MemberOut(BaseModel):
    id: str
    name: str
    email: str | None
    phone: str | None
    role: str | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[MemberOut])
def list_members(db: Session = Depends(get_db)):
    members = db.query(Member).order_by(Member.name).all()
    return [MemberOut(id=str(m.id), name=m.name, email=m.email, phone=m.phone, role=m.role) for m in members]


@router.post("", response_model=MemberOut, status_code=201)
def create_member(body: MemberCreate, db: Session = Depends(get_db)):
    member = Member(**body.model_dump())
    db.add(member)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A member with this email already exists")
    db.refresh(member)
    return MemberOut(id=str(member.id), name=member.name, email=member.email, phone=member.phone, role=member.role)


@router.get("/{member_id}", response_model=MemberOut)
def get_member(member_id: str, db: Session = Depends(get_db)):
    mid = _parse_uuid(member_id, "member_id")
    member = db.query(Member).filter(Member.id == mid).first()
    if not member:
        raise HTTPException(404, "Member not found")
    return MemberOut(id=str(member.id), name=member.name, email=member.email, phone=member.phone, role=member.role)


@router.patch("/{member_id}", response_model=MemberOut)
def update_member(member_id: str, body: MemberUpdate, db: Session = Depends(get_db)):
    mid = _parse_uuid(member_id, "member_id")
    member = db.query(Member).filter(Member.id == mid).first()
    if not member:
        raise HTTPException(404, "Member not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A member with this email already exists")
    db.refresh(member)
    return MemberOut(id=str(member.id), name=member.name, email=member.email, phone=member.phone, role=member.role)


@router.delete("/{member_id}", status_code=204)
def delete_member(member_id: str, db: Session = Depends(get_db)):
    mid = _parse_uuid(member_id, "member_id")
    member = db.query(Member).filter(Member.id == mid).first()
    if not member:
        raise HTTPException(404, "Member not found")
    db.delete(member)
    db.commit()
