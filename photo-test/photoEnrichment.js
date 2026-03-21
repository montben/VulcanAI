/**
 * photoEnrichment.js
 * Black-box photo enrichment using Groq vision API.
 * No npm dependencies — uses Node.js built-in fetch + fs.
 *
 * Usage (from repo root or photo-test/):
 *   const { enrichPhoto } = require('./photo-test/photoEnrichment');
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Env loader — reads parent .env without dotenv dependency
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq vision model — swap to 'llava-v1.5-7b-4096-preview' if scout unavailable
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `You are a construction site documentation assistant generating photo annotations for a professional daily construction report.

Analyze the provided image and return a JSON object with EXACTLY these fields:
- image_path: string (preserve exactly as given)
- original_caption: string (preserve exactly as given)
- clean_caption: string (ONE concise, professional sentence)
- observations: array of 0–3 short factual strings grounded in the image
- category: one of "progress" | "safety" | "issue" | "general"

Category definitions:
- progress = visible work activity or construction advancement
- safety = hazards, obstructions, unsafe conditions, or safety-relevant situations
- issue = damage, defects, poor workmanship, or problems requiring attention
- general = neutral documentation without a strong progress/safety/issue signal

STRICT RULES:
- Only describe what is clearly visible in the image.
- Do NOT speculate about hidden work, future work, or intent.
- Use the original_caption as context, but do not assume it is fully correct.
- If the caption overstates what is visible, soften the wording.
- If uncertain, prefer conservative and factual phrasing.

clean_caption REQUIREMENTS:
- Exactly ONE sentence.
- Use professional construction-report tone.
- Prefer direct, specific phrasing (e.g., "Framing is in progress..." not "A building is under construction").
- Avoid vague phrases like "a building", "scene", or "image shows".
- Do NOT mention the camera, photo, or viewer.
- Do NOT use filler words or unnecessary adjectives.

observations REQUIREMENTS:
- 0 to 3 bullet-style facts (no full paragraphs).
- Each observation must be directly supported by the image.
- Focus on visible materials, equipment, conditions, or layout.
- Do NOT repeat the clean_caption.

category REQUIREMENTS:
- Choose exactly one category.
- Prefer:
  - progress when active work or installation is visible
  - safety when hazards or risks are clearly present
  - issue when defects or damage are visible
  - general only when none of the above clearly apply

OUTPUT RULES:
- Return ONLY valid JSON.
- No markdown fences.
- No explanations.
- No extra keys.
`;

// ---------------------------------------------------------------------------
// Core enrichment function
// ---------------------------------------------------------------------------
/**
 * @param {{ image_path: string, original_caption: string }} input
 * @returns {Promise<{
 *   image_path: string,
 *   original_caption: string,
 *   clean_caption: string,
 *   observations: string[],
 *   category: string
 * }>}
 */
async function enrichPhoto({ image_path, original_caption }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in .env');

  // --- Read and encode image ---
  const absPath = path.isAbsolute(image_path)
    ? image_path
    : path.join(process.cwd(), image_path);

  if (!fs.existsSync(absPath)) {
    return gracefulFallback(image_path, original_caption, `Image not found: ${absPath}`);
  }

  const ext = path.extname(absPath).toLowerCase().replace('.', '');
  const mimeType = ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : 'image/jpeg';

  const imageBuffer = fs.readFileSync(absPath);
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // --- Build request ---
  const userMessage = {
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: { url: dataUrl },
      },
      {
        type: 'text',
        text: `image_path: "${image_path}"\noriginal_caption: "${original_caption}"\n\nReturn the JSON object as described.`,
      },
    ],
  };

  let rawText = '';
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, userMessage],
        temperature: 0.2,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return gracefulFallback(image_path, original_caption, `API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    rawText = data?.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    return gracefulFallback(image_path, original_caption, `Network error: ${err.message}`);
  }

  // --- Parse JSON from model response ---
  return parseEnrichmentResponse(rawText, image_path, original_caption);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEnrichmentResponse(rawText, image_path, original_caption) {
  // Strip markdown code fences if model wraps output
  const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Find first '{' ... last '}' to isolate JSON blob
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return gracefulFallback(image_path, original_caption, `No JSON found in model output: ${rawText.slice(0, 120)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    return gracefulFallback(image_path, original_caption, `JSON parse error: ${e.message}`);
  }

  const VALID_CATEGORIES = ['progress', 'safety', 'issue', 'general'];

  return {
    image_path,                                                          // always preserved
    original_caption,                                                    // always preserved
    clean_caption: typeof parsed.clean_caption === 'string'
      ? parsed.clean_caption.trim()
      : '',
    observations: Array.isArray(parsed.observations)
      ? parsed.observations.filter(o => typeof o === 'string').slice(0, 3)
      : [],
    category: VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : 'general',
  };
}

function gracefulFallback(image_path, original_caption, reason) {
  console.warn(`[enrichPhoto] Fallback triggered — ${reason}`);
  return {
    image_path,
    original_caption,
    clean_caption: '',
    observations: [],
    category: 'general',
  };
}

module.exports = { enrichPhoto };
