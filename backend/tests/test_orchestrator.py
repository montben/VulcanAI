"""Unit tests for orchestrator helpers."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.pipeline.orchestrator import _collect_photo_descriptions


class TestCollectPhotoDescriptions(unittest.TestCase):
    def test_uses_original_filename_and_caption_only(self) -> None:
        photos = [
            SimpleNamespace(
                original_filename="site-a.jpg",
                file_path="/tmp/uuid_site-a.jpg",
                caption="South wall progress",
                ai_description="Old vision text",
                sort_order=2,
            )
        ]

        result = _collect_photo_descriptions(photos)

        self.assertEqual(
            result,
            [
                {
                    "filename": "site-a.jpg",
                    "caption": "South wall progress",
                    "ai_description": "",
                }
            ],
        )

    def test_falls_back_to_file_path_basename(self) -> None:
        photos = [
            SimpleNamespace(
                original_filename=None,
                file_path="/tmp/uploads/photo-123.png",
                caption="",
                ai_description="Should be ignored",
                sort_order=1,
            )
        ]

        result = _collect_photo_descriptions(photos)

        self.assertEqual(result[0]["filename"], "photo-123.png")
        self.assertEqual(result[0]["caption"], "")
        self.assertEqual(result[0]["ai_description"], "")


if __name__ == "__main__":
    unittest.main()
