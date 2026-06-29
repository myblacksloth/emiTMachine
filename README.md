# emiTMachine

![](./stuff/i/SCR-20260515-ogph.png)

![](./stuff/i/SCR-20260515-nyjq.png)

|   |   |
| ------------ | ------------ |
| ![](./stuff/i/SCR-20260515-oemn.png)  | ![](./stuff/i/SCR-20260515-oeyo.png)  |
| ![](./stuff/i/SCR-20260515-offp.png)  |  ![](./stuff/i/SCR-20260515-oflv.png) |
| ![](./stuff/i/SCR-20260515-ofrs.png) | ![](./stuff/i/SCR-20260520-otwy.png) |

<!-- 
![](./stuff/i/.png)
-->

emiTMachine is a multi-user time tracking webapp for work sessions, tags, reports, TOTP, passkeys, recovery codes, and CSV history.

Activity history can be manually inserted, reviewed, edited, and deleted from the frontend. See `doc/activity-management.md` for the current default behavior and the planned admin-controlled permission model. Countdown behavior is documented in `doc/countdowns.md`.

The overtime/time-bank feature is documented in `doc/overtime-bank.md`. It is enabled per user by an admin, supports both overtime payment tracking and residual time-bank calculation, and lets users set their weekly target only once.

Root/admin behavior is documented in `doc/admin-root.md`.

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
- Reverse proxy deployment guides for Caddy and Nginx Proxy Manager.

## Run Locally

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- PostgreSQL: `localhost:5432`

The database is persisted in the `postgres_data` Docker volume. PostgreSQL schema initialization is mounted from `backend/db/init.sql` and runs when the database volume is first created.

`postgres-backup` writes a PostgreSQL dump with `pg_dump` every 8 hours to:

```text
backups/postgres/emitmachine-latest.sql
```

Each run overwrites the previous backup atomically. The first dump is created as soon as PostgreSQL becomes healthy. Backup files are ignored by Git; only `backups/postgres/.gitkeep` is tracked so the host directory exists before Docker starts.

The backup container runs as `${UID:-1000}:${GID:-1000}` so the generated file is writable by the host user on typical Linux deployments.

For a manual restore into a running local stack, use `psql` from the Postgres container:

```bash
docker compose exec -T postgres psql -U emitmachine -d emitmachine < backups/postgres/emitmachine-latest.sql
```

## Docker Compose Files

The repository contains several Compose files for different runtime scenarios. Use only one of these stacks at a time unless you intentionally know how to isolate ports, volumes, and networks.

| File | Purpose | Main command |
| --- | --- | --- |
| `docker-compose.yml` | Default local development stack. It starts PostgreSQL, the PostgreSQL backup helper, the backend, and the frontend. The frontend is available on `http://localhost:5173`, the backend on `http://localhost:4000`, and PostgreSQL on `localhost:5432`. | `docker compose up --build` |
| `docker-compose-reverse.example.yml` | Template for a Caddy reverse-proxy deployment. Copy it to `docker-compose-reverse.yml`, then create the private env files and Caddy config described in `docker-reverse.md`. This file is meant as a tracked example, not as the active deployment file. | Copy first, then use the copied file |
| `docker-compose-reverse.yml` | Active Caddy reverse-proxy deployment file. It starts Caddy, PostgreSQL, the backup helper, backend, and frontend on internal Docker networks. Backend, frontend, and PostgreSQL are not directly published to the host; Caddy exposes ports `80` and `443`. This file depends on private env files such as `docker-compose-reverse.postgres.env`, `docker-compose-reverse.backend.env`, and `docker-compose-reverse.frontend.env`. | `docker compose -f docker-compose-reverse.yml up -d --build` |
| `docker-compose-npm.yml` | Nginx Proxy Manager deployment using SQLite for NPM's own data. It also starts the emiTMachine PostgreSQL, backup helper, backend, and frontend. NPM exposes ports `80`, `443`, and the admin UI on `81`. emiTMachine still uses PostgreSQL; SQLite is only for Nginx Proxy Manager settings. | `docker compose -f docker-compose-npm.yml up -d --build` |
| `docker-compose-npm-advanced.yml` | Nginx Proxy Manager deployment using a dedicated MariaDB container for NPM's own data. Use this instead of `docker-compose-npm.yml` when you want NPM's configuration stored in MariaDB rather than SQLite. emiTMachine still uses PostgreSQL. This file also requires `docker-compose-npm-advanced.env`. | `docker compose -f docker-compose-npm-advanced.yml up -d --build` |

Recommended choice:

- Use `docker-compose.yml` for local development and testing.
- Use `docker-compose-reverse.yml` when deploying behind the included Caddy reverse proxy.
- Use `docker-compose-npm.yml` when deploying with Nginx Proxy Manager and you want the simplest NPM setup.
- Use `docker-compose-npm-advanced.yml` when deploying with Nginx Proxy Manager and you want NPM backed by MariaDB.
- Do not edit `docker-compose-reverse.example.yml` for real secrets or domains; copy it and edit the private deployment files instead.

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

## Reverse Proxy Deployment

The repository includes two reverse proxy guides:

- `docker-reverse.md`: Caddy-based deployment with manually provided TLS certificates.
- `docker-reverse-npm.md`: Nginx Proxy Manager deployment.

The Nginx Proxy Manager guide includes two Compose variants:

- `docker-compose-npm.yml`: NPM with SQLite for NPM's own data.
- `docker-compose-npm-advanced.yml`: NPM with a dedicated MariaDB database for NPM's own data.

Both NPM variants keep emiTMachine on PostgreSQL. The NPM database is only for proxy hosts, certificates, NPM users, and NPM settings.

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
