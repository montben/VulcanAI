# Vulcan

Construction project management + AI-powered daily reports. Built for small construction companies and contractors to track projects, upload jobsite photos, record voice notes via Deepgram, and generate structured PDF reports via Groq.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Postgres runs in a container)
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (`brew install uv` or `pip install uv`)

## Quick Start

```bash
make setup      # creates venv, installs deps, copies .env, starts Postgres
```

Then in two separate terminals:

```bash
make backend    # FastAPI on http://localhost:8000
make frontend   # Static server on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000).

## Makefile Commands

| Command | What it does |
|---------|--------------|
| `make setup` | First-time setup: venv, deps, .env, start DB |
| `make up` | Start Postgres + pgAdmin containers |
| `make down` | Stop all containers |
| `make backend` | Run the FastAPI backend (port 8000) |
| `make frontend` | Serve the frontend (port 3000) |
| `make db-shell` | Open a psql shell in the running Postgres container |
| `make db-reset` | Wipe the database and re-run the schema |
| `make logs` | Tail Docker container logs |
| `make help` | Show all available commands |

## Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Backend API | http://localhost:8000/api/docs | — |
| Frontend | http://localhost:3000 | — |
| pgAdmin | http://localhost:5050 | admin@vulcan.dev / admin |
| Postgres | localhost:5432 | vulcan / vulcan_dev / vulcan |

## Repo Layout

```
backend/           FastAPI API, AI pipeline, PDF generation
  api/             CRUD routes (projects, members, reports)
  models/          SQLAlchemy ORM models
  pipeline/        AI analysis, synthesis, transcription, PDF gen
  database.py      DB engine + session dependency
frontend/          Static browser UI (vanilla JS)
db/init.sql        Postgres schema (auto-run by Docker)
docker-compose.yml Postgres + pgAdmin
Makefile           Dev commands
main.py            CLI entrypoint for the report pipeline
```

## API Endpoints

### Project management (Vulcan)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/{id}` | Get project detail + members |
| `PATCH` | `/api/projects/{id}` | Update a project |
| `DELETE` | `/api/projects/{id}` | Delete a project |
| `POST` | `/api/projects/{id}/members` | Assign a member to a project |
| `DELETE` | `/api/projects/{id}/members/{member_id}` | Remove a member |
| `GET` | `/api/members` | List all team members |
| `POST` | `/api/members` | Create a team member |
| `GET/PATCH/DELETE` | `/api/members/{id}` | Member CRUD |
| `GET` | `/api/projects/{id}/reports` | List daily reports for a project |
| `POST` | `/api/projects/{id}/reports` | Create a daily report |
| `GET` | `/api/projects/{id}/reports/{report_id}` | Full report detail (photos, transcripts, generated) |
| `POST` | `/api/projects/{id}/reports/{report_id}/photos` | Upload a photo with caption |
| `POST` | `/api/projects/{id}/reports/{report_id}/transcripts` | Save a call transcript |
| `POST` | `/api/projects/{id}/reports/{report_id}/generated` | Save AI-generated report JSON + PDF |

### AI pipeline (legacy)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/generate` | Start report generation |
| `GET` | `/api/progress/{job_id}` | SSE stream for job progress |
| `GET` | `/api/download/{job_id}` | Download generated PDF |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/endpoints` | Endpoint manifest |

Full interactive docs at http://localhost:8000/api/docs.

## Environment

Copy `.env.example` to `.env` (done automatically by `make setup`). Required keys:

```
GROQ_API_KEY=gsk_your_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
```

Get a free Groq key at [console.groq.com](https://console.groq.com). Get a free Deepgram key at [console.deepgram.com](https://console.deepgram.com).

See `.env.example` for all available options (model overrides, database URL, upload dir, CORS origins).

## API Providers

Vulcan auto-detects the first configured provider:

| Priority | Provider | Free Tier |
|----------|----------|-----------|
| 1 | Groq | Yes |
| 2 | Google Gemini | Limited |
| 3 | OpenAI | No |
| 4 | Anthropic | No |

## CLI Usage

Run the report pipeline directly without the web UI:

```bash
make backend  # needs to be running for DB access

python3 main.py --photos ./sample_input --notes ./notes.txt \
    --company "ABC Construction" --project "Smith Residence Remodel"
```

| Argument | Default | Description |
|----------|---------|-------------|
| `--photos` | `./sample_input/` | Folder of jobsite photos |
| `--notes` | None | `.txt` file with voice notes |
| `--company` | `Construction Co.` | Company name for report header |
| `--project` | `Project` | Project name for report header |
| `--output` | `./output/` | Output directory for generated PDF |
