import os
from dotenv import load_dotenv

load_dotenv()

# API Keys — at least one provider required
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Model configuration
VISION_MODEL = os.getenv("VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
SYNTHESIS_MODEL = os.getenv("SYNTHESIS_MODEL", "llama-3.3-70b-versatile")
MAX_PHOTO_DIMENSION = int(os.getenv("MAX_PHOTO_DIMENSION", "2048"))

# Determine which provider to use
if GROQ_API_KEY:
    PROVIDER = "groq"
elif GOOGLE_API_KEY:
    PROVIDER = "google"
elif OPENAI_API_KEY:
    PROVIDER = "openai"
elif ANTHROPIC_API_KEY:
    PROVIDER = "anthropic"
else:
    raise ValueError("Set GROQ_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env")
