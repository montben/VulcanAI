'use strict';

/**
 * testHtmlTemplate.js
 * Tests htmlTemplate.js by running buildHtml against several scenarios
 * and writing each result to an HTML file you can open in a browser.
 *
 * Run from repo root:
 *   node photo-test/testHtmlTemplate.js
 *
 * Output files are written to photo-test/output/
 */

const fs   = require('fs');
const path = require('path');

const { buildFinalReport } = require('./reportBuilder');
const { buildHtml }        = require('./htmlTemplate');
const {
  metadata,
  callReport,
  enrichedPhotos,
  partialCallReport,
  partialMetadata,
  badPhotos,
} = require('./mockData');

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------

const OUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

function save(filename, html) {
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`  Saved → ${outPath}`);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const cases = [
  {
    name: '01_full_report.html',
    label: 'Full report (happy path)',
    aiData:   callReport,
    metadata: metadata,
    photos:   enrichedPhotos,
  },
  {
    name: '02_no_photos.html',
    label: 'No photos — photo section should be hidden',
    aiData:   callReport,
    metadata: metadata,
    photos:   [],
  },
  {
    name: '03_partial_data.html',
    label: 'Partial aiData + partial metadata — empty fields show "None reported"',
    aiData:   partialCallReport,
    metadata: partialMetadata,
    photos:   enrichedPhotos,
  },
  {
    name: '04_bad_photos.html',
    label: 'Bad photo entries — nulls, invalid category, mixed-type observations',
    aiData:   callReport,
    metadata: metadata,
    photos:   badPhotos,
  },
  {
    name: '05_empty_everything.html',
    label: 'All inputs undefined — nothing should throw',
    aiData:   undefined,
    metadata: undefined,
    photos:   undefined,
  },
  {
    name: '06_broken_image_paths.html',
    label: 'Photos with non-existent image paths — images hidden, cards still render',
    aiData:   callReport,
    metadata: metadata,
    photos: [
      {
        image_path: 'photo-test/photos/does_not_exist.jpg',
        original_caption: 'Missing image',
        clean_caption: 'This image file does not exist on disk.',
        observations: ['Image path is intentionally broken for this test'],
        category: 'issue',
      },
      {
        image_path: '',
        original_caption: 'No path at all',
        clean_caption: 'Photo has no image path set.',
        observations: [],
        category: 'general',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

console.log('\nRunning htmlTemplate tests...\n');

let passed = 0;
let failed = 0;

for (const tc of cases) {
  process.stdout.write(`[${tc.name}] ${tc.label}\n`);
  try {
    const report = buildFinalReport(tc.aiData, tc.metadata, tc.photos);
    const html   = buildHtml(report);

    if (typeof html !== 'string' || !html.startsWith('<!DOCTYPE html>')) {
      throw new Error('buildHtml did not return a valid HTML string');
    }

    save(tc.name, html);
    console.log(`  PASS\n`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${err.message}\n`);
    failed++;
  }
}

console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`\nOpen any file in photo-test/output/ in your browser to inspect.\n`);
