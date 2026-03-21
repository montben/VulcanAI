# Frontend

The frontend is a static app in [`index.html`](index.html), [`app.js`](app.js), and [`style.css`](style.css).

## Backend Wiring

- Edit [`config.js`](config.js) to point the UI at the backend API.
- Use [`config.example.js`](config.example.js) as the contract/template for that file.
- The backend also exposes the same contract at `GET /api/endpoints`.

## Expected Endpoint Keys

- `generateReport`
- `reportProgress`
- `reportDownload`
- `health`
- `endpointManifest`

## Local Preview

Serve the folder with any static server. For example:

```bash
python3 -m http.server 3000 --directory frontend
```
