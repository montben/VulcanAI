/**
 * testPhotoEnrichment.js
 * Black-box tests for the photo enrichment pipeline.
 *
 * Run from the repo root:
 *   node photo-test/testPhotoEnrichment.js
 *
 * Or from inside photo-test/:
 *   node testPhotoEnrichment.js
 *
 * Drop your test images into photo-test/photos/ before running.
 */

const path = require('path');
const { enrichPhoto } = require('./photoEnrichment');

// ---------------------------------------------------------------------------
// Sample inputs — edit image paths to match files in photo-test/photos/
// ---------------------------------------------------------------------------
const SAMPLES = [
  {
    image_path: 'photo-test/photos/framing_exterior.jpg',
    original_caption: 'Exterior framing complete on south wall',
  },
  {
    image_path: 'photo-test/photos/plumbing_roughin.jpg',
    original_caption: 'Rough-in plumbing under the slab',
  },
  {
    image_path: 'photo-test/photos/messy-walkway.jpg',
    original_caption: 'Messy walkway with hazards along path',
  },
  {
    image_path: 'photo-test/photos/construction-defect-wall.jpg',
    original_caption: 'Cracked wall above door in guest bedroom',
  },
  // Edge case: bad path — should fail gracefully
  {
    image_path: 'photo-test/photos/nonexistent.jpg',
    original_caption: 'This image does not exist',
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('=== Photo Enrichment Test Runner ===\n');

  for (let i = 0; i < SAMPLES.length; i++) {
    const input = SAMPLES[i];
    console.log(`--- Test ${i + 1}/${SAMPLES.length} ---`);
    console.log(`  image_path:        ${input.image_path}`);
    console.log(`  original_caption:  ${input.original_caption}`);

    const start = Date.now();
    const result = await enrichPhoto(input);
    const elapsed = Date.now() - start;

    console.log(`  → clean_caption:   ${result.clean_caption || '(empty)'}`);
    console.log(`  → category:        ${result.category}`);
    console.log(`  → observations:    ${result.observations.length === 0
      ? '(none)'
      : result.observations.map(o => `\n      • ${o}`).join('')}`);
    console.log(`  → time:            ${elapsed}ms`);

    // Integrity checks
    const checks = [
      ['image_path preserved',        result.image_path === input.image_path],
      ['original_caption preserved',  result.original_caption === input.original_caption],
      ['clean_caption is string',     typeof result.clean_caption === 'string'],
      ['observations is array',       Array.isArray(result.observations)],
      ['observations ≤ 3',            result.observations.length <= 3],
      ['category is valid',           ['progress','safety','issue','general'].includes(result.category)],
    ];

    let allPassed = true;
    for (const [label, passed] of checks) {
      if (!passed) {
        console.error(`  ✗ FAIL: ${label}`);
        allPassed = false;
      }
    }
    if (allPassed) console.log('  ✓ All schema checks passed');

    console.log();
  }

  console.log('=== Done ===');
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
