"""Unit tests for the voice call module."""

from __future__ import annotations

import struct
import unittest

from backend.api.calls import (
    _AGENT_GREETING,
    _AGENT_LISTEN_MODEL,
    _AGENT_LISTEN_VERSION,
    _AGENT_THINK_PROMPT,
    _AGENT_TTS_MODEL,
    _DEEPGRAM_AGENT_WS_URL,
    _append_conversation_turn,
    _build_agent_settings,
    _build_agent_think_config,
    _format_conversation_transcript,
    _make_wav,
    _normalize_llm_endpoint_url,
)


class TestFormatTranscript(unittest.TestCase):
    def test_empty(self) -> None:
        self.assertEqual(_format_conversation_transcript([]), "")

    def test_basic_conversation(self) -> None:
        turns = [
            {"speaker": "agent", "text": "How'd today go?"},
            {"speaker": "user", "text": "Pretty good."},
        ]
        result = _format_conversation_transcript(turns)
        self.assertEqual(result, "Agent: How'd today go?\nUser: Pretty good.")

    def test_skips_empty_text(self) -> None:
        turns = [
            {"speaker": "agent", "text": "Hello"},
            {"speaker": "user", "text": ""},
            {"speaker": "agent", "text": "Goodbye"},
        ]
        result = _format_conversation_transcript(turns)
        self.assertNotIn("User:", result)
        self.assertEqual(result.count("\n"), 1)


class TestMakeWav(unittest.TestCase):
    def test_valid_wav_header(self) -> None:
        pcm = b"\x00\x01" * 100
        wav = _make_wav(pcm, sample_rate=16000)

        self.assertEqual(wav[:4], b"RIFF")
        self.assertEqual(wav[8:12], b"WAVE")
        self.assertEqual(wav[12:16], b"fmt ")
        self.assertEqual(struct.unpack_from("<I", wav, 24)[0], 16000)
        self.assertEqual(wav[36:40], b"data")
        self.assertEqual(struct.unpack_from("<I", wav, 40)[0], 200)
        self.assertEqual(len(wav), 244)

    def test_different_sample_rate(self) -> None:
        pcm = b"\x00" * 48
        wav = _make_wav(pcm, sample_rate=24000)
        self.assertEqual(struct.unpack_from("<I", wav, 24)[0], 24000)


class TestConversationTurns(unittest.TestCase):
    def test_append_conversation_turn_dedupes_exact_consecutive_message(self) -> None:
        turns = [{"speaker": "agent", "text": "How'd today go out there?"}]
        appended = _append_conversation_turn(turns, "agent", "How'd today go out there?")
        self.assertFalse(appended)
        self.assertEqual(len(turns), 1)

    def test_append_conversation_turn_strips_and_appends(self) -> None:
        turns: list[dict[str, str]] = []
        appended = _append_conversation_turn(turns, "user", "  Pretty good day.  ")
        self.assertTrue(appended)
        self.assertEqual(turns, [{"speaker": "user", "text": "Pretty good day."}])


class TestAgentConfig(unittest.TestCase):
    def test_prompt_mentions_daily_report(self) -> None:
        self.assertIn("daily report", _AGENT_THINK_PROMPT.lower())
        self.assertIn("greeting already asked the opening question", _AGENT_THINK_PROMPT.lower())
        self.assertIn("do not ask empty filler questions", _AGENT_THINK_PROMPT.lower())
        self.assertIn("do not turn the call into a checklist", _AGENT_THINK_PROMPT.lower())

    def test_greeting_is_conversational(self) -> None:
        self.assertTrue(_AGENT_GREETING)
        self.assertIn("?", _AGENT_GREETING)

    def test_tts_model_set(self) -> None:
        self.assertTrue(_AGENT_TTS_MODEL)
        self.assertEqual(_AGENT_TTS_MODEL, "aura-2-orpheus-en")

    def test_deepgram_agent_websocket_url_uses_current_converse_path(self) -> None:
        self.assertTrue(_DEEPGRAM_AGENT_WS_URL.endswith("/v1/agent/converse"))

    def test_build_agent_think_config_uses_groq_endpoint(self) -> None:
        config = _build_agent_think_config("llama-3.3-70b-versatile", "test-groq-key")
        self.assertEqual(config["provider"]["type"], "open_ai")
        self.assertEqual(config["provider"]["model"], "llama-3.3-70b-versatile")
        self.assertIn("authorization", config["endpoint"]["headers"])
        self.assertEqual(config["context_length"], "max")
        self.assertTrue(config["endpoint"]["url"].endswith("/chat/completions"))

    def test_build_agent_settings_uses_listen_and_speak_models(self) -> None:
        settings = _build_agent_settings("llama-3.3-70b-versatile", "test-groq-key")
        self.assertEqual(settings["agent"]["listen"]["provider"]["model"], _AGENT_LISTEN_MODEL)
        self.assertEqual(settings["agent"]["listen"]["provider"]["version"], _AGENT_LISTEN_VERSION)
        self.assertEqual(_AGENT_LISTEN_MODEL, "nova-2")
        self.assertEqual(settings["agent"]["speak"]["provider"]["model"], _AGENT_TTS_MODEL)

    def test_normalize_llm_endpoint_url_upgrades_groq_openai_base_url(self) -> None:
        self.assertEqual(
            _normalize_llm_endpoint_url("https://api.groq.com/openai/v1"),
            "https://api.groq.com/openai/v1/chat/completions",
        )


if __name__ == "__main__":
    unittest.main()
