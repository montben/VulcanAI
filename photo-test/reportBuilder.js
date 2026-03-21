/**
 * reportBuilder.js
 * Merges and normalizes the three upstream inputs into one final report object.
 *
 * Inputs:
 *   aiData   — parsed callReport.json
 *   metadata — parsed metadata.json
 *   photos   — parsed enrichedPhotos.json (array)
 *
 * Output: a clean, predictable object ready for HTML/PDF rendering.
 */

'use strict';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function normalizeString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(v => typeof v === 'string');
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function normalizeMetadata(metadata) {
  const m = metadata != null && typeof metadata === 'object' ? metadata : {};
  return {
    project_name:    normalizeString(m.project_name),
    report_date:     normalizeString(m.report_date),
    location:        normalizeString(m.location),
    weather_summary: normalizeString(m.weather_summary),
    prepared_by:     normalizeString(m.prepared_by),
  };
}

// ---------------------------------------------------------------------------
// AI / call-report data
// ---------------------------------------------------------------------------

function normalizeResources(resources) {
  const r = resources != null && typeof resources === 'object' ? resources : {};
  return {
    crew_summary: normalizeString(r.crew_summary),
    equipment:    normalizeStringArray(r.equipment),
    materials:    normalizeStringArray(r.materials),
  };
}

function normalizeAiData(aiData) {
  const a = aiData != null && typeof aiData === 'object' ? aiData : {};
  return {
    summary:           normalizeString(a.summary),
    work_completed:    normalizeStringArray(a.work_completed),
    progress_update:   normalizeString(a.progress_update),
    issues_delays:     normalizeStringArray(a.issues_delays),
    safety_notes:      normalizeStringArray(a.safety_notes),
    next_steps:        normalizeStringArray(a.next_steps),
    resources_mentioned: normalizeResources(a.resources_mentioned),
    additional_notes:  normalizeString(a.additional_notes),
  };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set(['progress', 'safety', 'issue', 'general']);

function normalizePhoto(photo) {
  const p = photo != null && typeof photo === 'object' ? photo : {};
  return {
    image_path:       normalizeString(p.image_path),
    original_caption: normalizeString(p.original_caption),
    clean_caption:    normalizeString(p.clean_caption),
    observations:     normalizeStringArray(p.observations),
    category:         VALID_CATEGORIES.has(p.category) ? p.category : 'general',
  };
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos.map(normalizePhoto);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @param {object} aiData    - parsed callReport.json
 * @param {object} metadata  - parsed metadata.json
 * @param {Array}  photos    - parsed enrichedPhotos.json
 * @returns {object}         - normalized final report object
 */
function buildFinalReport(aiData, metadata, photos) {
  return {
    project_info: normalizeMetadata(metadata),
    ...normalizeAiData(aiData),
    photos: normalizePhotos(photos),
  };
}

module.exports = { buildFinalReport };

/*
// ---------------------------------------------------------------------------
// Example usage
// ---------------------------------------------------------------------------

const { buildFinalReport } = require('./reportBuilder');

const callReport = {
  summary: "Framing on the south wall is complete.",
  work_completed: ["South wall framing", "Window rough openings"],
  progress_update: "On schedule.",
  issues_delays: [],
  safety_notes: ["Hard hats required on site"],
  next_steps: ["Begin roof sheathing"],
  resources_mentioned: {
    crew_summary: "6-person framing crew",
    equipment: ["Nail gun", "Scaffolding"],
    materials: ["2x6 lumber", "OSB sheathing"]
  },
  additional_notes: ""
};

const metadata = {
  project_name: "Oakwood Residential Build",
  report_date: "2026-03-21",
  location: "123 Oakwood Drive, Austin TX",
  weather_summary: "Sunny, 72°F",
  prepared_by: "J. Rivera"
};

const enrichedPhotos = [
  {
    image_path: "photo-test/photos/framing_exterior.jpg",
    original_caption: "Exterior framing complete on south wall",
    clean_caption: "South wall framing is complete with window rough openings in place.",
    observations: ["Vertical studs are plumb and evenly spaced", "Two window openings are framed"],
    category: "progress"
  }
];

const report = buildFinalReport(callReport, metadata, enrichedPhotos);
console.log(JSON.stringify(report, null, 2));
*/
