# SiteScribe AI v1.0

AI-powered construction daily reports. Upload jobsite photos and optional voice notes, then generate a structured daily report and PDF.

## Repo Layout

The repo is now split around ownership boundaries:

- [`backend/`](backend/): FastAPI API, AI pipeline, PDF generation, env/config.
- [`frontend/`](frontend/): static browser UI and the frontend-owned API wiring in `config.js`.
- [`main.py`](main.py): CLI entrypoint for running the report pipeline directly.

That split is intentional: backend changes stay in `backend/`, and frontend engineers can wire the UI to different API environments without digging through backend code.

## Quick Start

1. Install backend dependencies:
   ```bash
   pip3 install -r backend/requirements.txt
   ```
2. Create backend env config:
   ```bash
   cp .env.example .env
   ```
   You can also use `backend/.env.example` if you prefer keeping env files inside `backend/`.
3. Start the backend API:
   ```bash
   python3 -m backend.app
   ```
4. Serve the frontend:
   ```bash
   python3 -m http.server 3000 --directory frontend
   ```
5. Open [http://localhost:3000](http://localhost:3000).

## Frontend-to-Backend Contract

Frontend API configuration lives in [`frontend/config.js`](frontend/config.js).

The frontend engineer only needs to update:

- `apiBaseUrl`
- the endpoint paths inside `endpoints`

The backend exposes the same contract at:

- `GET /api/endpoints`
- `GET /api/docs`
- `GET /api/openapi.json`

Current endpoint contract:

| Purpose | Method | Path |
|---------|--------|------|
| Health check | `GET` | `/api/health` |
| Endpoint manifest | `GET` | `/api/endpoints` |
| Start report generation | `POST` | `/api/generate` |
| Stream job progress | `GET` | `/api/progress/{job_id}` |
| Download generated PDF | `GET` | `/api/download/{job_id}` |

## CLI Usage

You can also run the pipeline directly:

```bash
python3 main.py --photos ./sample_input --notes ./notes.txt \
    --company "ABC Construction" --project "Smith Residence Remodel"
```

Generated PDFs are written to `output/`.

### CLI Arguments

| Argument    | Default            | Description                            |
|-------------|--------------------|----------------------------------------|
| `--photos`  | `./sample_input/`  | Path to folder of jobsite photos       |
| `--notes`   | None               | Path to `.txt` file with voice notes   |
| `--company` | `Construction Co.` | Company name for the report header     |
| `--project` | `Project`          | Project name for the report header     |
| `--output`  | `./output/`        | Output directory for the generated PDF |

## API Providers

SiteScribe auto-detects the first configured provider in this priority order:

| Priority | Provider | Vision Model | Synthesis Model | Free Tier |
|----------|----------|-------------|-----------------|-----------|
| 1 | Groq | Llama 4 Scout | Llama 3.3 70B | Yes |
| 2 | Google Gemini | Gemini 2.0 Flash | Gemini 2.0 Flash | Limited |
| 3 | OpenAI | GPT-4o | GPT-4o | No |
| 4 | Anthropic | — | Claude 3.5 | No |

Groq is still the default recommendation for local development.

## Subproject Notes

- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)
