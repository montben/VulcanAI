'use strict';

/**
 * photoAdapter.js
 * Maps raw report_photos DB rows into the enriched photo contract
 * expected by buildFinalReport(aiData, metadata, photos).
 *
 * Enriched photo contract:
 * {
 *   image_path:       string,
 *   original_caption: string,
 *   clean_caption:    string,
 *   observations:     string[],
 *   category:         "progress" | "safety" | "issue" | "general"
 * }
 *
 * DB row shape (report_photos):
 * {
 *   image_path,
 *   original_caption,
 *   clean_caption,    // preferred caption field
 *   ai_description,   // fallback if clean_caption is absent
 *   observations,     // may be a JSON string, array, or absent
 *   category,
 *   ...any other columns are ignored
 * }
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function str(value) {
  return typeof value === 'string' && value.length > 0 ? value : '';
}


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a single report_photos DB row to the enriched photo contract.
 * Never throws — missing or unexpected fields default to safe values.
 *
 * @param {object} row - a single row from report_photos
 * @returns {object}   - enriched photo object
 */
function mapReportPhotoRow(row) {
  if (row == null || typeof row !== 'object') {
    return {
      image_path: '',
      original_caption: '',
      clean_caption: '',
      observations: [],
      category: 'general',
    };
  }

  const caption = str(row.caption) || str(row.original_caption);

  return {
    image_path:       str(row.file_path) || str(row.image_path),
    original_caption: caption,
    clean_caption:    caption,
    observations:     [],
    category:         'general',
  };
}

/**
 * Maps an array of report_photos DB rows to enriched photo objects.
 * Returns [] if rows is not a non-empty array.
 *
 * @param {Array} rows - rows from report_photos query
 * @returns {Array}    - enriched photo objects
 */
function mapReportPhotos(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapReportPhotoRow);
}

module.exports = { mapReportPhotoRow, mapReportPhotos };
