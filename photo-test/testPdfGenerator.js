'use strict';

/**
 * testPdfGenerator.js
 * Tests the full pipeline: mockData → buildFinalReport → buildHtml → generatePdf
 *
 * Run from repo root:
 *   node photo-test/testPdfGenerator.js
 *
 * Output files are written to photo-test/output/
 */

const { buildFinalReport } = require('./reportBuilder');
const { buildHtml }        = require('./htmlTemplate');
const { generatePdf }      = require('./pdfGenerator');
const {
  metadata,
  callReport,
  enrichedPhotos,
  partialCallReport,
  partialMetadata,
} = require('./mockData');

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const cases = [
  {
    name:  'full_report',
    label: 'Full report — all fields and photos populated',
    aiData:   callReport,
    metadata: metadata,
    photos:   enrichedPhotos,
  },
  {
    name:  'no_photos',
    label: 'No photos — photo section should be absent from PDF',
    aiData:   callReport,
    metadata: metadata,
    photos:   [],
  },
  {
    name:  'partial_data',
    label: 'Partial aiData + partial metadata — empty fields show "None reported"',
    aiData:   partialCallReport,
    metadata: partialMetadata,
    photos:   enrichedPhotos,
  },
  {
    name:  'empty_everything',
    label: 'All inputs undefined — nothing should throw',
    aiData:   undefined,
    metadata: undefined,
    photos:   undefined,
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  console.log('\nRunning pdfGenerator tests...\n');

  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    console.log(`[${tc.name}] ${tc.label}`);
    try {
      const report = buildFinalReport(tc.aiData, tc.metadata, tc.photos);
      const html   = buildHtml(report);

      const { htmlPath, pdfPath } = await generatePdf(
        html,
        `./photo-test/output/${tc.name}.pdf`,
        `./photo-test/output/${tc.name}.html`,
      );

      console.log(`  html → ${htmlPath}`);
      console.log(`  pdf  → ${pdfPath}`);
      console.log(`  PASS\n`);
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${err.message}\n`);
      failed++;
    }
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('\nOpen any PDF in photo-test/output/ to inspect.\n');
}

run();
