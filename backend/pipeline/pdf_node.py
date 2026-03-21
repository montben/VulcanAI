"""Node.js PDF generation — shells out to photo-test/renderPdf.js.

Converts a StructuredDailyReport + photo DB rows into a professional
PDF via the Node.js HTML→Puppeteer pipeline.
"""

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

from .schemas import StructuredDailyReport

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RENDER_SCRIPT = _REPO_ROOT / "photo-test" / "renderPdf.js"


def generate_pdf_node(
    report: StructuredDailyReport,
    photos: list[dict],
    output_dir: str,
) -> str:
    """Generate a PDF from a StructuredDailyReport via the Node.js pipeline.

    Args:
        report: Validated StructuredDailyReport instance.
        photos: List of photo dicts with at least file_path, caption,
                original_filename, and ai_description.
        output_dir: Directory where the PDF and HTML will be written.

    Returns:
        Absolute path to the generated PDF file.

    Raises:
        RuntimeError: If the Node.js process fails.
        FileNotFoundError: If renderPdf.js is missing.
    """
    if not _RENDER_SCRIPT.exists():
        raise FileNotFoundError(f"renderPdf.js not found at {_RENDER_SCRIPT}")

    os.makedirs(output_dir, exist_ok=True)

    # Write temp input files
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, prefix="report_"
    ) as report_f:
        json.dump(report.model_dump(), report_f)
        report_path = report_f.name

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, prefix="photos_"
    ) as photos_f:
        json.dump(photos, photos_f)
        photos_path = photos_f.name

    try:
        result = subprocess.run(
            [
                "node",
                str(_RENDER_SCRIPT),
                "--report", report_path,
                "--photos", photos_path,
                "--output", output_dir,
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(_REPO_ROOT),
        )

        if result.returncode != 0:
            logger.error("renderPdf.js failed (exit %d): %s", result.returncode, result.stderr)
            raise RuntimeError(f"PDF generation failed: {result.stderr.strip()}")

        # Parse stdout JSON for the output paths
        output = json.loads(result.stdout.strip())
        pdf_path = output["pdf_path"]

        if not os.path.exists(pdf_path):
            raise RuntimeError(f"PDF not found at expected path: {pdf_path}")

        logger.info("PDF generated: %s", pdf_path)
        return pdf_path

    finally:
        # Clean up temp files
        for tmp in (report_path, photos_path):
            try:
                os.unlink(tmp)
            except OSError:
                pass
