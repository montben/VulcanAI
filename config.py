import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
VISION_MODEL = os.getenv("VISION_MODEL", "gpt-4o")
SYNTHESIS_MODEL = os.getenv("SYNTHESIS_MODEL", "gpt-4o")
MAX_PHOTO_DIMENSION = int(os.getenv("MAX_PHOTO_DIMENSION", "2048"))

if not OPENAI_API_KEY and not ANTHROPIC_API_KEY:
    raise ValueError("Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env")
