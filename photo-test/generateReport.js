'use strict';

/**
 * generateReport.js
 * End-to-end SiteScribe AI report pipeline.
 *
 * Voice AI calls this with its payload + a db connection.
 * This file handles everything: adapt → fetch photos → enrich → build → PDF.
 *
 * Usage:
 *   const { generateReport } = require('./photo-test/generateReport');
 *   await generateReport({ voicePayload, db });
 *
 * Standalone test (reads voicePayload.json, uses mock photos):
 *   node photo-test/generateReport.js
 */

const path = require('path');
const { Pool } = require('pg');

const { adaptVoicePayload } = require('./voiceAdapter');
const { enrichPhoto }       = require('./photoEnrichment');
const { buildFinalReport }  = require('./reportBuilder');
const { buildHtml }         = require('./htmlTemplate');
const { generatePdf }       = require('./pdfGenerator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[generateReport] ${msg}`);
}

// ---------------------------------------------------------------------------
// Photo enrichment — enrich each row and write results back to DB
// ---------------------------------------------------------------------------

async function enrichAndSavePhotos(rows, db) {
  return Promise.all(rows.map(async (row) => {
    const image_path       = row.file_path        || '';
    const original_caption = row.caption          || row.original_filename || '';

    let enriched;
    try {
      enriched = await enrichPhoto({ image_path, original_caption });
      log(`  enriched: ${image_path || '(no path)'}`);
    } catch (err) {
      console.warn(`[generateReport] WARNING — enrichment failed for "${image_path}": ${err.message}`);
      enriched = { image_path, original_caption, clean_caption: '', observations: [], category: 'general' };
    }

    // Write enrichment back to DB if a db connection was provided
    if (db) {
      try {
        await db.query(
          `UPDATE report_photos
           SET clean_caption = $1, observations = $2, category = $3
           WHERE id = $4`,
          [enriched.clean_caption, JSON.stringify(enriched.observations), enriched.category, row.id]
        );
      } catch (err) {
        console.warn(`[generateReport] WARNING — failed to save enrichment for row ${row.id}: ${err.message}`);
      }
    }

    return enriched;
  }));
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

/**
 * Full report generation pipeline.
 *
 * @param {object}  options
 * @param {object}  options.voicePayload  - voice pipeline output JSON
 * @param {object} [options.db]           - pg database client/pool (optional for local testing)
 * @param {string} [options.outputPdf]    - override output PDF path
 * @param {string} [options.outputHtml]   - override output HTML path
 * @returns {Promise<{ htmlPath: string, pdfPath: string }>}
 */
async function generateReport({ voicePayload, db, outputPdf, outputHtml } = {}) {
  if (voicePayload == null || typeof voicePayload !== 'object') {
    throw new Error('generateReport: voicePayload must be an object');
  }

  // 1. Adapt voice payload → metadata + aiData
  log('Adapting voice payload...');
  const { metadata, aiData } = adaptVoicePayload(voicePayload);

  // 2. Fetch raw photo rows from DB
  const reportId = voicePayload?.pdf_context?.report_id;
  let enrichedPhotos = [];

  if (db && reportId) {
    log(`Fetching photos for report ${reportId}...`);
    const result = await db.query(
      'SELECT * FROM report_photos WHERE report_id = $1 ORDER BY sort_order ASC',
      [reportId]
    );
    const rows = result.rows;
    log(`Enriching ${rows.length} photo(s)...`);
    enrichedPhotos = await enrichAndSavePhotos(rows, db);
  } else {
    log('No db or report_id provided — skipping photo enrichment.');
  }

  // 3. Build normalized report object
  log('Building report object...');
  const report = buildFinalReport(aiData, metadata, enrichedPhotos);

  // 4. Build HTML
  log('Building HTML...');
  const html = buildHtml(report);

  // 5. Generate PDF
  const pdfPath  = outputPdf  || path.resolve(__dirname, './output/report.pdf');
  const htmlPath = outputHtml || path.resolve(__dirname, './output/report.html');
  log('Generating PDF...');
  const result = await generatePdf(html, pdfPath, htmlPath);

  log('Done.');
  log(`  HTML → ${result.htmlPath}`);
  log(`  PDF  → ${result.pdfPath}`);

  return result;
}

module.exports = { generateReport };

// ---------------------------------------------------------------------------
// Standalone runner — reads voicePayload JSON from stdin (piped from Python)
//   echo '{"report":{...}}' | node photo-test/generateReport.js
// ---------------------------------------------------------------------------

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', chunk => raw += chunk);
  process.stdin.on('end', async () => {
    let voicePayload;
    try {
      voicePayload = JSON.parse(raw);
    } catch (err) {
      console.error(`[generateReport] FATAL: invalid JSON on stdin — ${err.message}`);
      process.exit(1);
    }

    const db = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await generateReport({ voicePayload, db });
    } catch (err) {
      console.error(`[generateReport] FATAL: ${err.message}`);
      process.exit(1);
    } finally {
      await db.end();
    }
  });
}
