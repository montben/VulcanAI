'use strict';

/**
 * voiceAdapter.js
 * Converts the voice pipeline payload into the metadata + aiData shapes
 * expected by buildFinalReport(aiData, metadata, enrichedPhotos).
 *
 * Does NOT touch photos — enrichedPhotos is produced separately.
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function strArr(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(v => typeof v === 'string');
}

// ---------------------------------------------------------------------------
// Array flatteners — richer voice objects → plain strings
// ---------------------------------------------------------------------------

function flattenWorkCompleted(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (item == null || typeof item !== 'object') return null;
    const task   = str(item.task);
    const area   = str(item.area);
    const status = str(item.status);
    if (!task) return null;
    const label = area ? `${area}: ${task}` : task;
    return status ? `${label} (${status})` : label;
  }).filter(Boolean);
}

function flattenIssuesDelays(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (item == null || typeof item !== 'object') return null;
    const issue    = str(item.issue);
    const impact   = str(item.impact);
    const severity = str(item.severity);
    if (!issue) return null;
    let out = issue;
    if (impact)   out += ` — Impact: ${impact}`;
    if (severity) out += ` [${severity}]`;
    return out;
  }).filter(Boolean);
}

function flattenSafetyNotes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (item == null || typeof item !== 'object') return null;
    const observation = str(item.observation);
    const action      = str(item.action_required);
    if (!observation) return null;
    return action ? `${observation} — Action required: ${action}` : observation;
  }).filter(Boolean);
}

function flattenNextSteps(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (item == null || typeof item !== 'object') return null;
    const task     = str(item.task);
    const priority = str(item.priority);
    if (!task) return null;
    return priority ? `${task} (${priority})` : task;
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Shape normalizers
// ---------------------------------------------------------------------------

function normalizeMetadata(meta) {
  const m = meta != null && typeof meta === 'object' ? meta : {};
  return {
    project_name:    str(m.project_name),
    report_date:     str(m.report_date),
    location:        str(m.location),
    weather_summary: str(m.weather),   // voice uses "weather" → builder expects "weather_summary"
    prepared_by:     str(m.prepared_by),
  };
}

function normalizeResources(resources) {
  const r = resources != null && typeof resources === 'object' ? resources : {};
  return {
    crew_summary: str(r.crew_summary),
    equipment:    strArr(r.equipment),
    materials:    strArr(r.materials),
  };
}

function normalizeAiData(report) {
  const r = report != null && typeof report === 'object' ? report : {};
  return {
    summary:             str(r.summary),
    work_completed:      flattenWorkCompleted(r.work_completed),
    progress_update:     str(r.progress_update),
    issues_delays:       flattenIssuesDelays(r.issues_delays),
    safety_notes:        flattenSafetyNotes(r.safety_notes),
    next_steps:          flattenNextSteps(r.next_steps),
    resources_mentioned: normalizeResources(r.resources_mentioned),
    additional_notes:    str(r.additional_notes),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Adapts the voice pipeline payload into { metadata, aiData }.
 * photo_assets and pdf_context are intentionally ignored here.
 *
 * @param {object} payload - full voice pipeline payload
 * @returns {{ metadata: object, aiData: object }}
 */
function adaptVoicePayload(payload) {
  const report = payload != null && typeof payload === 'object'
    ? (payload.report ?? {})
    : {};

  return {
    metadata: normalizeMetadata(report.metadata),
    aiData:   normalizeAiData(report),
  };
}

module.exports = { adaptVoicePayload };
