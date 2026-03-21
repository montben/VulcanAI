'use strict';

const metadata = {
  project_name: "Oakwood Residential Build — Lot 14",
  report_date: "2026-03-21",
  location: "123 Oakwood Drive, Austin TX 78701",
  weather_summary: "Sunny, 72°F, light wind",
  prepared_by: "J. Rivera"
};

const callReport = {
  summary: "Framing on the south and west walls is complete. Rough-in plumbing is underway beneath the slab. One tripping hazard identified near the main stairwell.",
  work_completed: [
    "South wall framing",
    "West wall framing",
    "Window and door rough openings cut",
    "Temporary bracing installed"
  ],
  progress_update: "Project is on schedule. Roof sheathing is expected to begin Monday.",
  issues_delays: [
    "Lumber delivery for second floor is delayed 2 days due to supplier backorder"
  ],
  safety_notes: [
    "Debris pile near stairwell entry — tripping hazard flagged for cleanup",
    "Hard hat and hi-vis vest required in all active zones"
  ],
  next_steps: [
    "Clear debris from stairwell area",
    "Complete rough-in plumbing under slab",
    "Begin second-floor framing once lumber arrives"
  ],
  resources_mentioned: {
    crew_summary: "6-person framing crew, 2 plumbers on site",
    equipment: ["Nail gun", "Scaffolding", "Concrete saw"],
    materials: ["2x6 lumber", "OSB sheathing", "PVC pipe", "Concrete mix"]
  },
  additional_notes: "Owner walked the site at 2pm and approved framing layout."
};

const enrichedPhotos = [
  {
    image_path: "photo-test/photos/framing_exterior.jpg",
    original_caption: "Exterior framing complete on south wall",
    clean_caption: "South wall framing is complete with window and door rough openings in place.",
    observations: [
      "Vertical studs are plumb and evenly spaced",
      "Two window openings and one door opening are framed",
      "Temporary diagonal bracing is visible on the left side"
    ],
    category: "progress"
  },
  {
    image_path: "photo-test/photos/plumbing_roughin.jpg",
    original_caption: "Rough-in plumbing under the slab",
    clean_caption: "PVC rough-in plumbing is partially installed beneath the slab formwork.",
    observations: [
      "PVC pipes are staked and positioned in the trench",
      "Trench is open and not yet backfilled"
    ],
    category: "progress"
  },
  {
    image_path: "photo-test/photos/messy-walkway.jpg",
    original_caption: "Stairwell area with debris on floor",
    clean_caption: "Debris and scrap lumber are present near the base of the stairwell, creating a potential tripping hazard.",
    observations: [
      "Scrap lumber and off-cuts scattered across floor",
      "Stairwell access path is partially obstructed"
    ],
    category: "safety"
  },
  {
    image_path: "photo-test/photos/construction-defect-wall.jpg",
    original_caption: "Site overview from northwest corner",
    clean_caption: "Overall site view shows framing in progress on the main structure with equipment staged nearby.",
    observations: [
      "Scaffolding is erected along the south face",
      "Material staging area is visible in the foreground"
    ],
    category: "general"
  }
];

// Edge-case variants for stress testing normalizeation
const partialCallReport = {
  summary: "Quick site walk, no major updates.",
  // work_completed missing
  // resources_mentioned missing entirely
};

const partialMetadata = {
  project_name: "Phase 2 Addition",
  // all other fields missing
};

const badPhotos = [
  null,                          // null entry
  { category: "danger" },        // invalid category, all other fields missing
  {
    image_path: "photo-test/photos/framing_interior.jpg",
    original_caption: "Interior framing in progress",
    observations: [42, null, "Load-bearing wall is marked with blue tape"],  // mixed types in array
    category: "progress"
  }
];

module.exports = {
  // Normal full data
  metadata,
  callReport,
  enrichedPhotos,
  // Partial / edge-case data
  partialCallReport,
  partialMetadata,
  badPhotos
};

// Run directly: node photo-test/mockData.js
if (require.main === module) {
  const { buildFinalReport } = require('./reportBuilder');
  const report = buildFinalReport(callReport, metadata, enrichedPhotos);
  console.log(JSON.stringify(report, null, 2));
}

