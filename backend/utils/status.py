"""Report status state machine.

Enforces valid transitions between report statuses and applies them atomically.
"""

from __future__ import annotations

from fastapi import HTTPException

VALID_TRANSITIONS: dict[str, set[str]] = {
    "draft":      {"recording", "processing", "failed"},
    "recording":  {"processing", "draft", "failed"},
    "processing": {"generated", "failed"},
    "generated":  {"finalized", "processing", "recording", "failed"},
    "finalized":  {"processing", "recording"},
    "failed":     {"draft", "processing", "recording"},
}


def transition_status(
    report,
    new_status: str,
    *,
    error_message: str | None = None,
) -> None:
    """Validate and apply a status transition on a DailyReportRecord.

    Raises HTTPException(409) if the transition is invalid.
    Clears error_message on non-failed transitions.
    """
    current = report.status
    allowed = VALID_TRANSITIONS.get(current, set())

    if new_status not in allowed:
        raise HTTPException(
            409,
            f"Cannot transition report from '{current}' to '{new_status}'. "
            f"Allowed: {sorted(allowed)}",
        )

    report.status = new_status

    if new_status == "failed":
        report.error_message = error_message
    else:
        report.error_message = None
