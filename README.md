# Vulcan AI

Turn jobsite photos into finished construction paperwork in under 60 seconds. Contractors snap photos, answer a quick voice call, and Vulcan delivers a branded PDF daily report — no typing, no templates, no desk work.

## Quick Start

```bash
docker compose up --build
```

Or without Docker:

```bash
cd backend
pip3 install -r requirements.txt
cp .env.example .env
# Add your API key to .env
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.

## How It Works

1. **Upload photos** — drag and drop jobsite photos, add optional captions
2. **Voice intake** — AI asks targeted questions (crew, deliveries, safety, tomorrow's plan)
3. **AI generates report** — photos analyzed via GPT-4o Vision, voice transcribed via Whisper, synthesized into a structured daily report
4. **Download PDF** — branded, professional report ready to send

## Architecture

```
backend/                  — Python/FastAPI
  app.py                  — Main FastAPI application
  api/                    — REST endpoints (projects, reports, members)
  pipeline/               — AI pipeline (analyzer, synthesizer, PDF gen, transcriber)
  models/                 — Database models
  database.py             — PostgreSQL connection

frontend/                 — Built UI (served by backend)
  index.html              — Entry point
  assets/                 — CSS, JS, images

client/                   — React source (for development)
  src/pages/
    dashboard.tsx          — Project grid
    new-project.tsx        — Create project form
    project.tsx            — Timeline with date picker
    create-report.tsx      — Photo upload → voice call → generating → done

db/                       — Database init scripts
docker-compose.yml        — Docker setup (backend + Postgres)
```

## API Endpoints

- `POST /api/generate` — Start report generation (photos + voice)
- `GET /api/progress/{job_id}` — SSE progress stream
- `GET /api/download/{job_id}` — Download generated PDF
- `GET /api/projects` — List projects
- `POST /api/projects` — Create project
- `GET /api/reports` — List reports
- `POST /api/reports` — Create report

## Tech Stack

- **Backend:** Python, FastAPI, PostgreSQL, ReportLab
- **AI:** GPT-4o Vision, Whisper (Groq), multi-provider LLM
- **Frontend:** React, Tailwind CSS, shadcn/ui
- **Fonts:** General Sans + Cabinet Grotesk (Fontshare)

## Team

Built at Pi Hacks — March 2026
