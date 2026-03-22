'use strict';

/**
 * htmlTemplate.js
 * Renders a normalized report object into a complete HTML document string.
 * PDF-friendly — designed for Puppeteer conversion.
 *
 * Usage:
 *   const { buildHtml } = require('./htmlTemplate');
 *   const html = buildHtml(report);
 */

const path            = require('path');
const fs              = require('fs');
const { pathToFileURL } = require('url');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Converts an image path to a src-safe file:// URL.
 * - http/https/file URLs are returned as-is
 * - relative paths are resolved from cwd()
 * - uses pathToFileURL for correct encoding of spaces and special characters
 * - returns { src, exists } so callers can show a placeholder for missing files
 */
function toImageSrc(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return { src: '', exists: false };
  }
  const p = imagePath.trim();
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('file://')) {
    return { src: p, exists: true };
  }
  const abs    = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  const exists = fs.existsSync(abs);
  console.log(`[photo] image_path="${p}" | abs="${abs}" | exists=${exists}`);
  return { src: pathToFileURL(abs).href, exists };
}

/** Renders a string field — falls back to "None reported" if empty. */
function renderText(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? `<p>${escapeHtml(s)}</p>` : '<p class="none">None reported</p>';
}

/** Renders a string array as a <ul> — falls back to "None reported" if empty. */
function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="none">None reported</p>';
  }
  const filtered = items.filter(v => typeof v === 'string' && v.trim());
  if (filtered.length === 0) return '<p class="none">None reported</p>';
  const lis = filtered.map(item => `<li>${escapeHtml(item)}</li>`).join('\n');
  return `<ul>${lis}</ul>`;
}

/** Wraps content in a labelled section block. */
function renderSection(title, body) {
  return `
  <section>
    <h2>${escapeHtml(title)}</h2>
    ${body}
  </section>`;
}

// ---------------------------------------------------------------------------
// Resources block
// ---------------------------------------------------------------------------

function renderResources(resources) {
  const r = resources != null && typeof resources === 'object' ? resources : {};
  const crew      = typeof r.crew_summary === 'string' ? r.crew_summary.trim() : '';
  const equipment = Array.isArray(r.equipment) ? r.equipment : [];
  const materials = Array.isArray(r.materials) ? r.materials : [];

  return `
    <div class="resources-grid">
      <div>
        <h3>Crew</h3>
        ${crew ? `<p>${escapeHtml(crew)}</p>` : '<p class="none">None reported</p>'}
      </div>
      <div>
        <h3>Equipment</h3>
        ${renderList(equipment)}
      </div>
      <div>
        <h3>Materials</h3>
        ${renderList(materials)}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Photo section
// ---------------------------------------------------------------------------

function renderPhotoCard(photo) {
  const caption   = typeof photo.clean_caption === 'string' ? photo.clean_caption.trim() : '';
  const imagePath = typeof photo.image_path === 'string' ? photo.image_path.trim() : '';

  const { src: imgSrc, exists: imgExists } = toImageSrc(imagePath);
  const imgTag = imgSrc
    ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(caption)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholder = !imgExists
    ? `<div class="img-placeholder"${imgSrc ? ' style="display:none"' : ''}>Image unavailable</div>`
    : '';

  return `
    <div class="photo-card">
      ${imgTag}${placeholder}
      <div class="photo-meta">
        ${caption ? `<p class="caption">${escapeHtml(caption)}</p>` : ''}
      </div>
    </div>`;
}

function renderPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return '';

  const cards = photos.map(renderPhotoCard).join('\n');
  return renderSection('Photo Documentation', `<div class="photo-grid">${cards}</div>`);
}

// ---------------------------------------------------------------------------
// Embedded CSS
// ---------------------------------------------------------------------------

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #222;
    background: #fff;
    padding: 40px 0;
  }

  .container {
    max-width: 820px;
    margin: 0 auto;
    padding: 0 40px;
  }

  /* Header */
  .report-header {
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid #222;
  }

  .report-title {
    font-size: 22px;
    font-weight: 700;
    color: #111;
    margin-bottom: 14px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 24px;
  }

  .meta-item {
    font-size: 12px;
    color: #444;
  }

  .meta-item strong {
    color: #111;
  }

  /* Sections */
  section {
    margin-bottom: 28px;
    page-break-inside: avoid;
  }

  h2 {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #333;
    padding-bottom: 6px;
    border-bottom: 1px solid #ddd;
    margin-bottom: 12px;
  }

  h3 {
    font-size: 12px;
    font-weight: 700;
    color: #333;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  p {
    line-height: 1.6;
    color: #222;
  }

  p.none {
    color: #999;
    font-style: italic;
  }

  ul {
    padding-left: 18px;
    line-height: 1.7;
    color: #222;
  }

  li {
    margin-bottom: 2px;
  }

  /* Resources grid */
  .resources-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }

  /* Category badges */
  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 3px;
    margin-bottom: 6px;
  }

  .badge-progress { background: #e6f4ea; color: #2d6a4f; }
  .badge-safety   { background: #fff3cd; color: #856404; }
  .badge-issue    { background: #fde8e8; color: #9b1c1c; }
  .badge-general  { background: #f0f0f0; color: #555;    }

  /* Photo grid */
  .photo-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .photo-card {
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
  }

  .photo-card img {
    width: 100%;
    height: 200px;
    object-fit: cover;
    display: block;
    background: #f5f5f5;
  }

  .img-placeholder {
    width: 100%;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f0f0f0;
    color: #999;
    font-size: 11px;
    font-style: italic;
  }

  .photo-meta {
    padding: 10px 12px;
  }

  p.caption {
    font-size: 12px;
    color: #333;
    line-height: 1.5;
    margin-bottom: 6px;
  }

  ul.observations {
    padding-left: 14px;
    margin-top: 4px;
  }

  ul.observations li {
    font-size: 11px;
    color: #666;
    line-height: 1.5;
    margin-bottom: 1px;
  }
`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Renders a normalized report object into a complete HTML document string.
 *
 * @param {object} report - output of buildFinalReport()
 * @returns {string}      - full HTML document
 */
function buildHtml(report) {
  const r  = report != null && typeof report === 'object' ? report : {};
  const pi = r.project_info != null && typeof r.project_info === 'object' ? r.project_info : {};

  const projectName = typeof pi.project_name === 'string' ? pi.project_name.trim() : '';
  const title       = projectName || 'Daily Construction Report';

  const metaFields = [
    ['Date',        pi.report_date],
    ['Location',    pi.location],
    ['Weather',     pi.weather_summary],
    ['Prepared by', pi.prepared_by],
  ];

  const metaHtml = metaFields
    .filter(([, val]) => typeof val === 'string' && val.trim())
    .map(([label, val]) => `
      <div class="meta-item">
        <strong>${escapeHtml(label)}:</strong> ${escapeHtml(val.trim())}
      </div>`)
    .join('');

  const header = `
  <header class="report-header">
    <div class="report-title">${escapeHtml(title)}</div>
    <div class="meta-grid">${metaHtml}</div>
  </header>`;

  const body = [
    renderSection('Summary',          renderText(r.summary)),
    renderSection('Work Completed',   renderList(r.work_completed)),
    renderSection('Progress Update',  renderText(r.progress_update)),
    renderSection('Issues / Delays',  renderList(r.issues_delays)),
    renderSection('Safety Notes',     renderList(r.safety_notes)),
    renderSection('Next Steps',       renderList(r.next_steps)),
    renderSection('Resources',        renderResources(r.resources_mentioned)),
    renderSection('Additional Notes', renderText(r.additional_notes)),
    renderPhotos(r.photos),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    ${header}
    ${body}
  </div>
</body>
</html>`;
}

module.exports = { buildHtml };
