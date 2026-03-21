'use strict';

/**
 * renderPdf.js
 * Entry point for Python → Node.js PDF generation.
 *
 * Accepts pre-analyzed report + photo data (no Groq calls),
 * runs it through the HTML/PDF pipeline, and prints the output paths as JSON.
 *
 * Usage:
 *   node photo-test/renderPdf.js \
 *     --report /tmp/report.json \
 *     --photos /tmp/photos.json \
 *     --output /tmp/pdf_output
 */

const fs   = require('fs');
const path = require('path');

const { adaptVoicePayload } = require('./voiceAdapter');
const { mapReportPhotos }   = require('./photoAdapter');
const { buildFinalReport }  = require('./reportBuilder');
const { buildHtml }         = require('./htmlTemplate');
const { generatePdf }       = require('./pdfGenerator');

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--report' && i + 1 < argv.length) {
      args.report = argv[++i];
    } else if (argv[i] === '--photos' && i + 1 < argv.length) {
      args.photos = argv[++i];
    } else if (argv[i] === '--output' && i + 1 < argv.length) {
      args.output = argv[++i];
    }
  }
  if (!args.report) throw new Error('Missing required argument: --report <path>');
  if (!args.photos) throw new Error('Missing required argument: --photos <path>');
  if (!args.output) throw new Error('Missing required argument: --output <dir>');
  return args;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${abs}: ${err.message}`);
  }
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  // 1. Load report JSON (StructuredDailyReport format)
  const reportJson = loadJson(args.report);

  // 2. Adapt via voiceAdapter: wrap as { report: ... } and extract metadata + aiData
  const { metadata, aiData } = adaptVoicePayload({ report: reportJson });

  // 3. Load photo DB rows and map fields for the adapter
  const rawPhotos = loadJson(args.photos);
  if (!Array.isArray(rawPhotos)) {
    throw new Error('Photos JSON must be an array');
  }

  const mappedRows = rawPhotos.map(row => ({
    ...row,
    image_path:       row.file_path ?? row.image_path ?? '',
    original_caption: row.caption ?? row.original_caption ?? '',
  }));

  // 4. Map through photoAdapter (no Groq re-enrichment)
  const enrichedPhotos = mapReportPhotos(mappedRows);

  // 5. Build final report object
  const report = buildFinalReport(aiData, metadata, enrichedPhotos);

  // 6. Build HTML
  const html = buildHtml(report);

  // 7. Determine output filenames from metadata
  const projectSlug = slugify(metadata.project_name) || 'report';
  const dateSlug    = slugify(metadata.report_date)   || 'undated';
  const baseName    = `${projectSlug}_${dateSlug}`;

  const outputDir     = path.resolve(args.output);
  const outputPdfPath  = path.join(outputDir, `${baseName}.pdf`);
  const outputHtmlPath = path.join(outputDir, `${baseName}.html`);

  // 8. Generate PDF + HTML
  await generatePdf(html, outputPdfPath, outputHtmlPath);

  // 9. Print result as JSON to stdout
  const result = {
    pdf_path:  outputPdfPath,
    html_path: outputHtmlPath,
  };
  console.log(JSON.stringify(result));
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  process.stderr.write(`[renderPdf] ERROR: ${err.message}\n`);
  process.exit(1);
});
