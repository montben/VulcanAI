# Vulcan AI

Turn jobsite photos into finished construction paperwork in under 60 seconds. Contractors snap photos, answer a quick voice call, and Vulcan delivers a branded PDF daily report — no typing, no templates, no desk work.

## Setup

### 1. Database (PostgreSQL)

Install PostgreSQL if you don't have it:

```bash
brew install postgresql@14
brew services start postgresql@14
```

Create the database and user:

```bash
psql postgres -c "CREATE USER vulcan WITH PASSWORD 'vulcan_dev';"
psql postgres -c "CREATE DATABASE vulcan OWNER vulcan;"
psql -U vulcan -d vulcan -f db/init.sql
psql -U vulcan -d vulcan -f db/migrations/001_call_sessions_and_fields.sql
```

### 2. Backend

```bash
cd backend
pip3 install -r requirements.txt
cp .env.example .env
# Edit .env and add your API keys (Groq is free and recommended)
```

Run the backend:

```bash
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.

### 3. Frontend

The `frontend/` build output is not committed to git. You must build locally:

```bash
cd client
npm install       # first time only
npm run build     # compiles client/src/ → frontend/
```

**Run `npm run build` after every `git pull`** to pick up any source changes from teammates. The backend serves the built files automatically — no separate frontend server needed.

## Environment Variables

See `backend/.env.example` for all options. Required:

- `GROQ_API_KEY` — free at [console.groq.com](https://console.groq.com)
- `DEEPGRAM_API_KEY` — free at [console.deepgram.com](https://console.deepgram.com)
- `DATABASE_URL` — defaults to `postgresql://vulcan:vulcan_dev@localhost:5432/vulcan`

## How It Works

1. **Create a project** — name, start date, cover photo
2. **Upload photos** — drag and drop jobsite photos with optional captions
3. **Voice intake** — AI asks targeted questions (crew, deliveries, safety, tomorrow's plan)
4. **AI generates report** — photos analyzed via vision model, voice transcribed, synthesized into a structured daily report
5. **Download PDF** — branded, professional report ready to send

## Architecture

```
backend/                  — Python/FastAPI
  app.py                  — Main application, static file serving, CORS
  api/                    — REST routers (projects, reports, members, calls, edits)
  pipeline/               — AI pipeline (analyzer, synthesizer, PDF gen, transcriber)
  models/                 — SQLAlchemy models
  database.py             — PostgreSQL connection

frontend/                 — Built UI (served by backend at /)
  index.html
  assets/                 — Compiled JS, CSS, images

client/                   — React/TypeScript source
  src/pages/
    dashboard.tsx          — Project grid
    new-project.tsx        — Create project form
    project.tsx            — Timeline with report calendar
    create-report.tsx      — Photo upload → voice call → generating → done
  vite.config.ts           — Build config (outputs to ../frontend)

db/
  init.sql                 — Schema
  migrations/              — Schema migrations
```

## API

Interactive docs at `http://localhost:8000/docs`.

Key routes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project |
| DELETE | `/api/projects/:id` | Delete project |
| GET | `/api/projects/:id/reports` | List reports for project |
| POST | `/api/projects/:id/reports` | Create daily report |
| POST | `/api/projects/:id/reports/:id/photos` | Upload photo to report |
| POST | `/api/projects/:id/reports/:id/generate` | Trigger AI report generation |
| GET | `/api/projects/:id/reports/:id/pdf` | Download PDF |
| POST | `/api/uploads/image` | Upload project cover photo |

## Tech Stack

- **Backend:** Python, FastAPI, PostgreSQL, SQLAlchemy, ReportLab
- **AI:** Groq (LLaMA 4 Scout vision, LLaMA 3.3 synthesis, Whisper transcription), Deepgram
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Fonts:** General Sans + Cabinet Grotesk (Fontshare)

## Team

Built at Pi Hacks — March 2026
