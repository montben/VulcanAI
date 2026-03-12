"""Photo analysis module — sends jobsite photos to GPT-4o Vision for structured analysis."""

import base64
import json
import logging
import os
import time
from pathlib import Path

from openai import OpenAI
from PIL import Image

import config
from models import PhotoAnalysis

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

# Load the system prompt once at import time
_PROMPT_PATH = Path(__file__).parent / "prompts" / "photo_analysis.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text()


def _resize_image(image_path: str) -> str:
    """Resize image if longest side exceeds MAX_PHOTO_DIMENSION. Returns path to
    (possibly temporary) resized image."""
    img = Image.open(image_path)
    max_dim = config.MAX_PHOTO_DIMENSION
    w, h = img.size
    if max(w, h) <= max_dim:
        return image_path

    scale = max_dim / max(w, h)
    new_size = (int(w * scale), int(h * scale))
    img = img.resize(new_size, Image.LANCZOS)

    # Save to a temp path next to the original
    resized_path = image_path + ".resized.jpg"
    img.save(resized_path, "JPEG", quality=85)
    return resized_path


def _encode_image_base64(image_path: str) -> str:
    """Return base64-encoded string of the image file."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response text.

    Handles responses wrapped in ```json ... ``` code fences.
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        # Remove opening fence (with optional language tag) and closing fence
        lines = stripped.split("\n")
        # Drop first and last lines (fences)
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines)
    return json.loads(stripped)


def analyze_photo(image_path: str) -> PhotoAnalysis:
    """Analyze a single construction site photo using GPT-4o Vision.

    Encodes the image to base64, sends it with the construction-specific prompt,
    and returns a validated PhotoAnalysis model.  Retries once on JSON parse failure.
    """
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    filename = os.path.basename(image_path)

    # Resize if needed
    processed_path = _resize_image(image_path)
    try:
        b64_image = _encode_image_base64(processed_path)
    finally:
        # Clean up temporary resized file
        if processed_path != image_path and os.path.exists(processed_path):
            os.remove(processed_path)

    # Determine MIME type
    ext = Path(image_path).suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime};base64,{b64_image}",
                        "detail": "high",
                    },
                },
                {
                    "type": "text",
                    "text": "Analyze this construction site photo. Return ONLY valid JSON.",
                },
            ],
        },
    ]

    last_error = None
    for attempt in range(2):  # retry once on bad JSON
        response = client.chat.completions.create(
            model=config.VISION_MODEL,
            messages=messages,
            max_tokens=1024,
            temperature=0.2,
        )
        raw_text = response.choices[0].message.content
        try:
            data = _parse_json_response(raw_text)
            data["photo_filename"] = filename
            return PhotoAnalysis(**data)
        except (json.JSONDecodeError, Exception) as exc:
            last_error = exc
            if attempt == 0:
                logger.warning("Bad JSON from API for %s, retrying... (%s)", filename, exc)
            continue

    raise ValueError(f"Failed to parse analysis for {filename} after 2 attempts: {last_error}")


def analyze_all_photos(folder_path: str) -> list[PhotoAnalysis]:
    """Discover all JPG/PNG files in folder_path, analyze each, and return results.

    Prints real-time progress.  Skips files that fail analysis after retries.
    """
    folder = Path(folder_path)
    if not folder.is_dir():
        raise FileNotFoundError(f"Photos folder not found: {folder_path}")

    photo_files = sorted(
        p for p in folder.iterdir()
        if p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not photo_files:
        raise FileNotFoundError(f"No JPG/PNG photos found in {folder_path}")

    results: list[PhotoAnalysis] = []
    for idx, photo_path in enumerate(photo_files, start=1):
        print(f"[{idx}/{len(photo_files)}] Analyzing {photo_path.name}...", end=" ", flush=True)
        start = time.time()
        try:
            analysis = analyze_photo(str(photo_path))
            elapsed = time.time() - start
            print(f"done ({elapsed:.1f}s)")
            results.append(analysis)
        except Exception as exc:
            elapsed = time.time() - start
            print(f"FAILED ({elapsed:.1f}s)")
            logger.warning("Skipping %s: %s", photo_path.name, exc)

    return results
