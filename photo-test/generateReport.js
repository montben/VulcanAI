'use strict';

/**
 * generateReport.js
 * End-to-end SiteScribe AI report pipeline runner.
 *
 * Usage (from photo-test/):
 *   node generateReport.js
 *
 * Reads:  voicePayload.json, photoRows.json
 * Writes: output/report.html, output/report.pdf
 */

const fs   = require('fs');
const path = require('path');

const { adaptVoicePayload } = require('./voiceAdapter');
const { enrichPhoto }       = require('./photoEnrichment');
const { buildFinalReport }  = require('./reportBuilder');
const { buildHtml }         = require('./htmlTemplate');
const { generatePdf }       = require('./pdfGenerator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJson(filePath) {
  const abs = path.resolve(__dirname, filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Required input file not found: ${abs}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read ${abs}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${abs}: ${err.message}`);
  }
}

function log(msg) {
  console.log(`[generateReport] ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Load voice payload
  log('Loading voice payload from voicePayload.json...');
  const voicePayload = loadJson('./voicePayload.json');

  // 2. Adapt into metadata + aiData
  log('Adapting voice payload...');
  const { metadata, aiData } = adaptVoicePayload(voicePayload);

  // 3. Load photo rows
  log('Loading photo rows from photoRows.json...');
  const photoRows = loadJson('./photoRows.json');
  if (!Array.isArray(photoRows)) {
    throw new Error('photoRows.json must be a JSON array');
  }

  // 4. Enrich photos
  log(`Enriching ${photoRows.length} photo(s)...`);
  const enrichedPhotos = await Promise.all(
    photoRows.map(async (row) => {
      const image_path        = typeof row.file_path === 'string'   ? row.file_path   : '';
      const original_caption  = typeof row.caption === 'string'     ? row.caption
                              : typeof row.original_filename === 'string' ? row.original_filename
                              : '';
      try {
        const result = await enrichPhoto({ image_path, original_caption });
        log(`  enriched: ${image_path || '(no path)'}`);
        return result;
      } catch (err) {
        console.warn(`[generateReport] WARNING — enrichment failed for "${image_path}": ${err.message}`);
        return {
          image_path,
          original_caption,
          clean_caption: '',
          observations: [],
          category: 'general',
        };
      }
    })
  );

  // 5. Build normalized report object
  log('Building report object...');
  const report = buildFinalReport(aiData, metadata, enrichedPhotos);

  // 6. Build HTML
  log('Building HTML...');
  const html = buildHtml(report);

  // 7. Generate PDF
  const outputPdf  = path.resolve(__dirname, './output/report.pdf');
  const outputHtml = path.resolve(__dirname, './output/report.html');
  log('Generating PDF...');
  const result = await generatePdf(html, outputPdf, outputHtml);

  // 8. Done
  log('Done.');
  log(`  HTML → ${result.htmlPath}`);
  log(`  PDF  → ${result.pdfPath}`);
}

main().catch((err) => {
  console.error(`[generateReport] FATAL: ${err.message}`);
  process.exit(1);
});
