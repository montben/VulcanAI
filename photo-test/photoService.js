'use strict';

/**
 * photoService.js
 * Orchestration layer for photo enrichment.
 *
 * For each report_photos DB row:
 *   - If the row already has enrichment (clean_caption or ai_description) → use photoAdapter
 *   - Otherwise → call Groq vision via enrichPhoto
 *
 * Returns one consistent enriched photo array ready for buildFinalReport.
 *
 * Usage:
 *   const { getEnrichedPhotos } = require('./photo-test/photoService');
 *   const photos = await getEnrichedPhotos(rows);
 *   const report = buildFinalReport(callReport, metadata, photos);
 */

const { mapReportPhotoRow } = require('./photoAdapter');
const { enrichPhoto }       = require('./photoEnrichment');

/**
 * Returns true if the row already has stored enrichment from a previous AI run.
 */
function isAlreadyEnriched(row) {
  return (
    (typeof row.clean_caption === 'string' && row.clean_caption.trim().length > 0) ||
    (typeof row.ai_description === 'string' && row.ai_description.trim().length > 0)
  );
}

/**
 * Processes a single row — adapter path or live enrichment path.
 *
 * @param {object} row - a single report_photos DB row
 * @returns {Promise<object>} - enriched photo object
 */
async function processRow(row) {
  if (isAlreadyEnriched(row)) {
    return mapReportPhotoRow(row);
  }

  // Live enrichment via Groq vision
  return enrichPhoto({
    image_path:       row.image_path       ?? '',
    original_caption: row.original_caption ?? '',
  });
}

/**
 * Processes all rows and returns an enriched photo array.
 * Rows that fail enrichment fall back to a safe empty object (enrichPhoto handles this internally).
 *
 * @param {object[]} rows - rows from report_photos query
 * @returns {Promise<object[]>} - enriched photo objects
 */
async function getEnrichedPhotos(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return Promise.all(rows.map(processRow));
}

module.exports = { getEnrichedPhotos };
