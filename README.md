# emiTMachine

emiTMachine is a multi-user time tracking webapp for work sessions, tags, reports, TOTP, passkeys, recovery codes, and CSV history.

## Features

- Email/password registration and login.
- Optional TOTP setup with QR code verification.
- Passkey registration/login flow with persisted credential records and challenge validation. The current browser UI uses a development credential-id prompt; replace it with native WebAuthn ceremonies before production use.
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
RP_ID=localhost
RP_NAME=emiTMachine
TOTP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
VITE_API_BASE_URL=http://localhost:4000
```

Change `TOTP_ENCRYPTION_KEY`, cookie settings, and database credentials for any non-local deployment. HTTPS and reverse proxy configuration are intentionally left for the deployment layer.

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
