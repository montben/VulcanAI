-- Migration 001: Add call_sessions table, report_photos.ai_description,
-- daily_reports.error_message, generated_reports.updated_at

-- ─── Call sessions (live voice calls) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS call_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id        UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
    status           VARCHAR(50) NOT NULL DEFAULT 'active',  -- active | ended | failed
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at         TIMESTAMPTZ,
    duration_seconds INTEGER,
    full_transcript  TEXT
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_report ON call_sessions(report_id);

-- Prevent concurrent active calls on the same report
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_sessions_active_report
    ON call_sessions(report_id) WHERE status = 'active';

-- ─── New columns on existing tables ──────────────────────────────────────────

ALTER TABLE report_photos ADD COLUMN IF NOT EXISTS ai_description TEXT;

ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS updated_at
    TIMESTAMPTZ NOT NULL DEFAULT NOW();
