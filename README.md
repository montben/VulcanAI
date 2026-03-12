# SiteScribe AI v1.0

AI-powered construction daily reports. Upload jobsite photos (and an optional voice note), and SiteScribe analyzes them with AI vision models and generates a professional branded PDF report.

**Target user:** Small construction contractors who take photos on-site daily but hate writing reports.

## Quick Start (Web UI)

The easiest way to use SiteScribe is through the browser-based interface.

1. **Clone the repo:**
   ```bash
   git clone https://github.com/montben/sitescribe-ai.git
   cd sitescribe-ai
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure your API key:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your **Groq API key** (free tier, no credit card needed):
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```
   Get a free key at [console.groq.com](https://console.groq.com).

4. **Start the web server:**
   ```bash
   python web_app.py
   ```

5. **Open your browser** to [http://localhost:8000](http://localhost:8000).

6. **Upload photos**, optionally record or upload a voice note, fill in your project/company name, and click **Generate Report**. You'll see real-time progress as the AI analyzes each photo, then a full report preview with a PDF download button.

## CLI Usage (Alternative)

You can also run SiteScribe from the command line:

```bash
python main.py --photos ./sample_input --notes ./notes.txt \
    --company "ABC Construction" --project "Smith Residence Remodel"
```

The generated PDF will be saved to `output/`.

### CLI Arguments

| Argument    | Default            | Description                              |
|-------------|--------------------|------------------------------------------|
| `--photos`  | `./sample_input/`  | Path to folder of jobsite photos         |
| `--notes`   | None               | Path to .txt file with voice notes       |
| `--company` | "Construction Co." | Company name for the report header       |
| `--project` | "Project"          | Project name for the report header       |
| `--output`  | `./output/`        | Output directory for the generated PDF   |

## How It Works

1. **Voice Transcription** (optional) — If a voice note is provided, it's transcribed using Groq's Whisper API (free).
2. **Photo Analysis** — Each photo is sent to Llama 4 Scout vision model (via Groq) with a construction-specific prompt. Returns structured JSON per photo.
3. **Report Synthesis** — A second LLM call (Llama 3.3 70B via Groq) combines all photo analyses + optional voice notes into a unified daily report.
4. **PDF Generation** — ReportLab renders a professional branded multi-page PDF with embedded photos, tables, and safety observation cards.

## API Providers

SiteScribe supports multiple AI providers. It auto-detects which to use based on the API keys in your `.env` file, in this priority order:

| Priority | Provider | Vision Model | Synthesis Model | Free Tier |
|----------|----------|-------------|-----------------|-----------|
| 1 | **Groq** (recommended) | Llama 4 Scout | Llama 3.3 70B | Yes — 14,400 req/day |
| 2 | Google Gemini | Gemini 2.0 Flash | Gemini 2.0 Flash | Limited |
| 3 | OpenAI | GPT-4o | GPT-4o | No (paid) |
| 4 | Anthropic | — | Claude 3.5 | No (paid) |

**Groq is recommended** — it's free, fast (~5s for 5 photos), and has no credit card requirement.

## Project Structure

```
sitescribe-ai/
├── web_app.py           # Web server (FastAPI) — browser-based UI
├── main.py              # CLI entry point
├── analyzer.py          # Photo analysis with AI vision models
├── synthesizer.py       # Report narrative generation
├── transcriber.py       # Voice note transcription (Groq Whisper)
├── pdf_generator.py     # PDF rendering with ReportLab
├── models.py            # Pydantic data models
├── config.py            # API keys, provider auto-detection
├── prompts/
│   ├── photo_analysis.txt
│   └── report_synthesis.txt
├── templates/
│   └── default_template.json  # Report branding/layout config
├── static/
│   ├── index.html       # Web UI — upload page
│   ├── style.css        # Web UI — styles
│   └── app.js           # Web UI — frontend logic
├── sample_input/        # Sample construction photos for testing
├── output/              # Generated PDFs (CLI mode)
├── requirements.txt
├── .env.example
└── README.md
```

## Report Customization

Edit `templates/default_template.json` to customize the report appearance:

- **Branding** — primary/accent colors, background color, font, company logo path
- **Layout** — photos per row, photo size, page size
- **Sections** — which sections appear and in what order
- **Footer text** — custom footer on every page

## Requirements

- Python 3.10+
- A Groq API key (free at [console.groq.com](https://console.groq.com))
