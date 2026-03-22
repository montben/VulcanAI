-- Migration 002: add photo enrichment columns to report_photos
-- Stores the output of photoEnrichment.js directly on the row.

ALTER TABLE report_photos
  ADD COLUMN IF NOT EXISTS clean_caption  TEXT,
  ADD COLUMN IF NOT EXISTS observations   JSONB,
  ADD COLUMN IF NOT EXISTS category       VARCHAR(20);
