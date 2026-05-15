# emiTMachine

emiTMachine is a multi-user time tracking webapp for work sessions, tags, reports, TOTP, passkeys, recovery codes, and CSV history.

Activity history can be reviewed, edited, and deleted from the frontend. See `doc/activity-management.md` for the current default behavior and the planned admin-controlled permission model.

## Features

- Username/password registration and login.
- Optional TOTP setup with QR code verification.
- Passkey registration/login flow with native WebAuthn ceremonies, persisted credential records, and challenge validation.
- Recovery codes for account recovery.
- Clock in/out workflow with editable client time confirmation.
- Tags with colors, including default `Presence` and `Smart working` tags.
- Daily, weekly, and monthly hour charts.
- CSV export and restore import.
- PostgreSQL database initialized from SQL, not backend startup code.
- Docker Compose stack for frontend, backend, and PostgreSQL.

## Run Locally

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- PostgreSQL: `localhost:5432`

The database is persisted in the `postgres_data` Docker volume. PostgreSQL schema initialization is mounted from `backend/db/init.sql` and runs when the database volume is first created.

## Environment

The Compose file provides development defaults:

```text
DATABASE_URL=postgres://emitmachine:emitmachine@postgres:5432/emitmachine
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
LOG_LEVEL=info
LOG_FORMAT=pretty
RP_ID=localhost
RP_NAME=emiTMachine
TOTP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
VITE_BACKEND_PROXY_TARGET=http://backend:4000
```

Logging defaults are intended for local development:

- `LOG_LEVEL`: minimum backend log severity. Use `debug` for local troubleshooting, `info` for normal development, and `warn` or `error` to reduce noise.
- `LOG_FORMAT`: backend log format. Use `pretty` for readable local logs and `json` when logs are collected by Docker, a reverse proxy, or a central logging system.

Change `TOTP_ENCRYPTION_KEY`, cookie settings, and database credentials for any non-local deployment. HTTPS and reverse proxy configuration are intentionally left for the deployment layer.

## Passkeys

Passkeys require a secure browser context. Use one of these access patterns:

- Local development: `http://localhost:5173`
- Remote server without HTTPS yet: `ssh -N -L 5173:localhost:5173 user@server`, then open `http://localhost:5173`
- Production: HTTPS reverse proxy, with `RP_ID` set to the public hostname and `RP_ORIGIN` set to the exact browser origin

Do not open the app as `http://<server-ip>:5173` for passkeys. Browsers reject WebAuthn on plain HTTP except for localhost.

## Logging And Troubleshooting

Follow backend logs while using the app:

```bash
docker compose logs -f backend
```

Show logs for all services:

```bash
docker compose logs -f
```

Show recent PostgreSQL startup and migration logs:

```bash
docker compose logs --tail=100 postgres
```

Use request ids to correlate browser, reverse proxy, and backend logs. Send an `X-Request-Id` header from a reverse proxy or API client, then search for the same value in backend logs. If no upstream request id is provided, the backend should generate one and include it in the response as `X-Request-Id`.

Common checks:

- Login or API calls fail: run `docker compose logs -f backend` and look for the request method, path, status code, and request id.
- The backend cannot connect to PostgreSQL: run `docker compose logs postgres backend` and check for database health or authentication errors.
- Logs are too noisy: set `LOG_LEVEL=warn` in `docker-compose.yml`, then recreate the backend container with `docker compose up -d --build backend`.
- Structured log collection is needed: set `LOG_FORMAT=json` and collect Docker stdout/stderr from the backend service.

More operational logging notes are in `doc/troubleshooting.md`.

## Agentic Workflow

This repository includes workspace agents for planning and implementing the project from `todo.txt`.

- Main coordination file: `AGENTS.md`
- Per-agent definitions: `.github/agents/`
- Technical workflow notes: `doc/agentic-ai.md`

Example prompts:

```text
@ui/ux designer: Read todo.txt and propose the complete mobile-first page flow for emiTMachine.
```

```text
@backend developer: Read todo.txt and list the required API endpoints, payloads, authorization requirements, and business rules.
```

```text
@postgres db expert: Read todo.txt and design the PostgreSQL schema and init SQL for the application.
```
