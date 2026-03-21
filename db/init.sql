-- Vulcan Database Schema
-- Designed for construction project management + AI daily reports

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Team members ───────────────────────────────────────────────────────────

CREATE TABLE members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE,
    phone       VARCHAR(50),
    role        VARCHAR(100),  -- e.g. "Foreman", "Electrician", "Plumber"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Construction projects ──────────────────────────────────────────────────

CREATE TABLE projects (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    client              VARCHAR(255),
    location_address    TEXT,
    location_lat        DOUBLE PRECISION,
    location_lng        DOUBLE PRECISION,
    project_type        VARCHAR(100),  -- "Residential", "Commercial", "Renovation", etc.
    start_date          DATE,
    expected_end_date   DATE,
    status              VARCHAR(50) NOT NULL DEFAULT 'active',  -- active | completed | on_hold
    profile_image_url   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Project ↔ Member junction (who works where, in what role) ──────────

CREATE TABLE project_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    role        VARCHAR(50) NOT NULL DEFAULT 'worker',  -- site_manager | worker
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, member_id)
);

-- ─── Daily reports (one per project per day) ────────────────────────────────

CREATE TABLE daily_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_date         DATE NOT NULL,
    weather_summary     TEXT,
    weather_temp_f      REAL,
    weather_conditions  VARCHAR(100),
    status              VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft | processing | complete
    created_by          UUID REFERENCES members(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, report_date)
);

-- ─── Photos attached to a report ────────────────────────────────────────────

CREATE TABLE report_photos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id           UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
    file_path           TEXT NOT NULL,
    original_filename   VARCHAR(255),
    caption             TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Voice call transcripts ─────────────────────────────────────────────────

CREATE TABLE call_transcripts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id           UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
    raw_transcript      TEXT NOT NULL,
    duration_seconds    INTEGER,
    prompt_number       INTEGER,  -- NULL = freeform, 1-6 = guided prompt step
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AI-generated report output (JSON + PDF path) ──────────────────────────

CREATE TABLE generated_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id       UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
    report_json     JSONB NOT NULL,
    pdf_path        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_member  ON project_members(member_id);
CREATE INDEX idx_daily_reports_project   ON daily_reports(project_id);
CREATE INDEX idx_daily_reports_date      ON daily_reports(report_date);
CREATE INDEX idx_report_photos_report    ON report_photos(report_id);
CREATE INDEX idx_call_transcripts_report ON call_transcripts(report_id);
CREATE INDEX idx_generated_reports_report ON generated_reports(report_id);
