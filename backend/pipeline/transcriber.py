"""Voice transcription module — transcribes audio files using Groq Whisper API."""

from pathlib import Path

import config


SUPPORTED_AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".webm", ".ogg", ".mp4"}


def transcribe_audio(audio_path: str) -> str:
    """Transcribe an audio file using Groq Whisper API. Returns plain text."""
    from groq import Groq

    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    if path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
        raise ValueError(f"Unsupported audio format: {path.suffix}. Supported: {SUPPORTED_AUDIO_EXTENSIONS}")

    client = Groq(api_key=config.GROQ_API_KEY)

    with open(audio_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            file=(path.name, audio_file),
            model="whisper-large-v3-turbo",
            response_format="text",
        )

    return transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
