# Backend

The backend entrypoint is [`app.py`](app.py). This is the API surface the frontend should target.

## Run Locally

1. Install dependencies:
   ```bash
   pip3 install -r backend/requirements.txt
   ```
2. Copy an env file:
   ```bash
   cp .env.example .env
   ```
   You can also use `cp backend/.env.example backend/.env`.
3. Start the API:
   ```bash
   python3 -m backend.app
   ```

## Backend Layout

- [`app.py`](app.py): FastAPI app, CORS, upload handling, SSE progress, PDF download.
- [`pipeline/`](pipeline/): reusable report-generation pipeline and AI provider integrations.
- [`requirements.txt`](requirements.txt): backend Python dependencies.

## API Contract

- `GET /api/health`
- `GET /api/endpoints`
- `POST /api/generate`
- `GET /api/progress/{job_id}`
- `GET /api/download/{job_id}`

Interactive docs are available at `/api/docs` once the backend is running.
