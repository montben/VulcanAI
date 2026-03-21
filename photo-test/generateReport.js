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
const { mapReportPhotos }   = require('./photoAdapter');
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
    log(`Mapping ${rows.length} photo(s)...`);
    enrichedPhotos = mapReportPhotos(rows);
  } else {
    log('No db or report_id provided — skipping photos.');
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
