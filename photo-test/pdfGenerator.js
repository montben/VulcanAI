'use strict';

/**
 * pdfGenerator.js
 * Saves HTML to disk and renders it to a PDF using Puppeteer.
 * Local images resolve correctly because Puppeteer loads via file:// URL.
 *
 * Usage:
 *   const { generatePdf } = require('./pdfGenerator');
 *   await generatePdf(html, './output/report.pdf', './output/report.html');
 *
 * Install:
 *   npm install puppeteer
 */

const fs         = require('fs');
const path       = require('path');
const puppeteer  = require('puppeteer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates the parent directory of filePath if it does not exist. */
function ensureDirectoryForFile(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Returns a file:// URL for an absolute file path. */
function toFileUrl(absolutePath) {
  // On Windows paths look like C:\foo — replace backslashes and prepend triple slash.
  const normalized = absolutePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Saves HTML to disk, renders it with Puppeteer, and writes a PDF.
 *
 * @param {string} html            - complete HTML document string
 * @param {string} outputPdfPath   - where to write the PDF
 * @param {string} outputHtmlPath  - where to write the HTML (used as Puppeteer source)
 * @returns {Promise<{ htmlPath: string, pdfPath: string }>}
 */
async function generatePdf(html, outputPdfPath, outputHtmlPath) {
  // --- Input validation ---
  if (typeof html !== 'string' || html.trim().length === 0) {
    throw new Error('generatePdf: html must be a non-empty string');
  }
  if (!outputPdfPath || typeof outputPdfPath !== 'string') {
    throw new Error('generatePdf: outputPdfPath is required');
  }
  if (!outputHtmlPath || typeof outputHtmlPath !== 'string') {
    throw new Error('generatePdf: outputHtmlPath is required');
  }

  const absHtmlPath = path.resolve(outputHtmlPath);
  const absPdfPath  = path.resolve(outputPdfPath);

  // --- Write HTML to disk ---
  ensureDirectoryForFile(absHtmlPath);
  fs.writeFileSync(absHtmlPath, html, 'utf8');
  console.log(`[generatePdf] HTML saved → ${absHtmlPath}`);

  // --- Render PDF with Puppeteer ---
  ensureDirectoryForFile(absPdfPath);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Load via file:// URL so local image paths resolve relative to the HTML file
    const fileUrl = toFileUrl(absHtmlPath);
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Small settle wait for any images that load after networkidle0
    await new Promise(resolve => setTimeout(resolve, 300));

    await page.pdf({
      path:            absPdfPath,
      format:          'A4',
      printBackground: true,
      margin: {
        top:    '16mm',
        right:  '14mm',
        bottom: '16mm',
        left:   '14mm',
      },
    });

    console.log(`[generatePdf] PDF saved  → ${absPdfPath}`);

  } catch (err) {
    throw new Error(`generatePdf: PDF generation failed — ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return {
    htmlPath: absHtmlPath,
    pdfPath:  absPdfPath,
  };
}

module.exports = { generatePdf };
