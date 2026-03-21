# Backend

The backend entrypoint is [`app.py`](app.py). This is the API surface the frontend should target.

## Run Locally

From the repo root:

```bash
make setup    # creates venv, installs deps, copies .env, starts Postgres
make backend  # runs FastAPI on port 8000
```

## Backend Layout

- [`app.py`](app.py): FastAPI app, CORS, upload handling, SSE progress, PDF download.
- [`api/`](api/): CRUD routes for projects, members, and daily reports.
- [`models/`](models/): SQLAlchemy ORM models.
- [`database.py`](database.py): DB engine + session dependency.
- [`pipeline/`](pipeline/): reusable report-generation pipeline and AI provider integrations.
- [`requirements.txt`](requirements.txt): backend Python dependencies.

## API Contract

### Project management

- `GET/POST /api/projects`
- `GET/PATCH/DELETE /api/projects/{id}`
- `POST /api/projects/{id}/members`
- `DELETE /api/projects/{id}/members/{member_id}`
- `GET/POST /api/members`
- `GET/PATCH/DELETE /api/members/{id}`
- `GET/POST /api/projects/{id}/reports`
- `GET/DELETE /api/projects/{id}/reports/{report_id}`
- `POST /api/projects/{id}/reports/{report_id}/photos`
- `POST /api/projects/{id}/reports/{report_id}/transcripts`
- `POST /api/projects/{id}/reports/{report_id}/generated`

### AI pipeline

- `POST /api/generate`
- `GET /api/progress/{job_id}`
- `GET /api/download/{job_id}`
- `GET /api/health`
- `GET /api/endpoints`

Interactive docs are available at `/api/docs` once the backend is running.
