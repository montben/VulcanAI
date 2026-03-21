#!/usr/bin/env python3
"""SiteScribe AI v1.0 — CLI pipeline for AI-powered construction daily reports."""

import argparse
import json
import logging
import os
import sys
import time
from datetime import date
from pathlib import Path

from backend.pipeline.models import VoiceNoteData

logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
VERSION = "1.0"
REPO_ROOT = Path(__file__).resolve().parent


def _load_template(template_path: str | None = None) -> dict:
    """Load the report template configuration."""
    if template_path is None:
        template_path = str(REPO_ROOT / "backend" / "pipeline" / "templates" / "default_template.json")
    with open(template_path, encoding="utf-8") as f:
        return json.load(f)


def _parse_voice_notes(notes_path: str) -> VoiceNoteData:
    """Read a plain-text notes file and wrap it as VoiceNoteData.

    For V1 we pass the raw text as additional_context. A future version
    could use an LLM to extract structured fields.
    """
    text = Path(notes_path).read_text().strip()
    return VoiceNoteData(additional_context=text)


def _count_photos(folder: str) -> int:
    """Count supported image files in a folder."""
    exts = {".jpg", ".jpeg", ".png"}
    return sum(1 for p in Path(folder).iterdir() if p.suffix.lower() in exts)


def _sanitize_filename(name: str) -> str:
    """Make a string safe for use in a filename."""
    return name.replace(" ", "_").replace("/", "-").replace("\\", "-")


def main():
    parser = argparse.ArgumentParser(
        description="SiteScribe AI v1.0 — Generate professional construction daily reports from jobsite photos.",
    )
    parser.add_argument(
        "--photos",
        default="./sample_input/",
        help="Path to folder of jobsite photos (JPG/PNG). Default: ./sample_input/",
    )
    parser.add_argument(
        "--notes",
        default=None,
        help="Path to .txt file with voice note transcription or notes.",
    )
    parser.add_argument(
        "--company",
        default="Construction Co.",
        help='Company name for report header. Default: "Construction Co."',
    )
    parser.add_argument(
        "--project",
        default="Project",
        help='Project name for report header. Default: "Project"',
    )
    parser.add_argument(
        "--output",
        default="./output/",
        help="Output directory for the generated PDF. Default: ./output/",
    )

    args = parser.parse_args()

    # Validate photos folder exists
    if not os.path.isdir(args.photos):
        print(f"Error: Photos folder not found: {args.photos}", file=sys.stderr)
        sys.exit(1)

    photo_count = _count_photos(args.photos)
    if photo_count == 0:
        print(f"Error: No JPG/PNG photos found in {args.photos}", file=sys.stderr)
        sys.exit(1)

    # Import config (triggers .env load and API key validation)
    try:
        from backend.pipeline import config  # noqa: F401
    except ValueError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        sys.exit(1)

    # Now safe to import modules that depend on config
    from backend.pipeline.analyzer import analyze_all_photos
    from backend.pipeline.pdf_generator import generate_report_pdf
    from backend.pipeline.synthesizer import synthesize_report

    # Banner
    today = date.today().isoformat()
    notes_label = args.notes if args.notes else "None"

    print(f"\nSiteScribe AI v{VERSION}")
    print("=" * 18)
    print(f"Project: {args.project} | Company: {args.company}")
    print(f"Photos folder: {args.photos} ({photo_count} photos found) | Notes: {notes_label}")
    print()

    total_start = time.time()

    # Stage 1+2: Analyze photos
    analyses = analyze_all_photos(args.photos)
    if not analyses:
        print("Error: No photos were successfully analyzed.", file=sys.stderr)
        sys.exit(1)

    print()

    # Parse voice notes if provided
    voice_notes = None
    if args.notes:
        if not os.path.isfile(args.notes):
            print(f"Warning: Notes file not found: {args.notes}", file=sys.stderr)
        else:
            voice_notes = _parse_voice_notes(args.notes)

    # Brief pause before synthesis to avoid rate-limit issues on free-tier APIs
    if config.PROVIDER == "groq":
        print("Waiting for API cooldown...", end=" ", flush=True)
        time.sleep(5)
        print("ok")

    # Stage 3+4: Synthesize report
    print("Synthesizing report narrative...", end=" ", flush=True)
    synth_start = time.time()
    try:
        report = synthesize_report(
            analyses=analyses,
            voice_notes=voice_notes,
            project_name=args.project,
            company_name=args.company,
            date=today,
        )
    except Exception as e:
        print("FAILED")
        print(f"Error during synthesis: {e}", file=sys.stderr)
        sys.exit(1)
    synth_elapsed = time.time() - synth_start
    print(f"done ({synth_elapsed:.1f}s)")

    # Stage 5: Generate PDF
    print("Generating PDF...", end=" ", flush=True)
    pdf_start = time.time()
    template_config = _load_template()

    os.makedirs(args.output, exist_ok=True)
    safe_project = _sanitize_filename(args.project)
    output_filename = f"{today}_{safe_project}.pdf"
    output_path = os.path.join(args.output, output_filename)

    try:
        generate_report_pdf(
            report=report,
            photos_folder=args.photos,
            output_path=output_path,
            template_config=template_config,
        )
    except Exception as e:
        print("FAILED")
        print(f"Error during PDF generation: {e}", file=sys.stderr)
        sys.exit(1)
    pdf_elapsed = time.time() - pdf_start
    print(f"done ({pdf_elapsed:.1f}s)")

    total_elapsed = time.time() - total_start

    # Estimate API cost (rough: ~$0.002-$0.003 per photo analysis + ~$0.003 for synthesis)
    est_cost = len(analyses) * 0.0025 + 0.003
    print(f"\n>> Report saved: {output_path}")
    print(f"Total: {total_elapsed:.1f}s | Photos: {len(analyses)} | Est. API cost: ~${est_cost:.2f}")


if __name__ == "__main__":
    main()
