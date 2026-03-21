"""Shared JSON parsing utilities for LLM responses."""

import json


def parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response, handling code fences and preamble."""
    stripped = text.strip()

    if "```" in stripped:
        fence_start = stripped.index("```")
        after_fence = stripped[fence_start + 3:]
        if "\n" in after_fence:
            after_fence = after_fence.split("\n", 1)[1]
        if "```" in after_fence:
            after_fence = after_fence[:after_fence.rindex("```")]
        stripped = after_fence.strip()

    if not stripped.startswith("{"):
        brace = stripped.find("{")
        if brace != -1:
            stripped = stripped[brace:]

    return json.loads(stripped)
