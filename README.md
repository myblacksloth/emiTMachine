# emiTMachine

emiTMachine is a multi-user time tracking web app for work sessions, tags, reports, TOTP, passkeys, recovery codes, CSV history, admin workflows, and overtime/time-bank tracking.

## Screenshots

![](./stuff/i/SCR-20260515-ogph.png)

![](./stuff/i/SCR-20260515-nyjq.png)

|   |   |
| ------------ | ------------ |
| ![](./stuff/i/SCR-20260515-oemn.png) | ![](./stuff/i/SCR-20260515-oeyo.png) |
| ![](./stuff/i/SCR-20260515-offp.png) | ![](./stuff/i/SCR-20260515-oflv.png) |
| ![](./stuff/i/SCR-20260515-ofrs.png) | ![](./stuff/i/SCR-20260520-otwy.png) |


## Deploy Fast

Start here if you want the shortest path to a running deployment:

1. Open [doc/deployment-quickstart.md](doc/deployment-quickstart.md).
2. Pick Caddy, Nginx Proxy Manager with SQLite, or Nginx Proxy Manager with MariaDB.
3. Copy the listed `.example` files.
4. Replace the placeholder domain, passwords, and encryption key.
5. Start the selected Compose stack.

Use `domain.example.com` in the docs as a placeholder for your real HTTPS hostname.

| Goal | Use | Command |
| --- | --- | --- |
| Local development | `docker-compose.yml` | `docker compose up --build` |
| Production with included Caddy reverse proxy | `docker-compose-reverse.yml` | `docker compose -f docker-compose-reverse.yml up -d --build` |
| Production with Nginx Proxy Manager and SQLite NPM storage (*) | `docker-compose-npm.yml` | `docker compose -f docker-compose-npm.yml up -d --build` |
| Production with Nginx Proxy Manager and MariaDB NPM storage | `docker-compose-npm-advanced.yml` | `docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build` |

Only `.example` env files are committed. Real env files contain secrets and deployment-specific domains, are ignored by Git, and must not be pushed.

## Required Deployment Env Files

Most deployment stacks need these private files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

If you use `docker-compose-npm-advanced.yml`, also run:

```bash
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

For Caddy, also copy `docker-compose-reverse.example.yml` to `docker-compose-reverse.yml` and `caddy/config/Caddyfile.example` to `caddy/config/Caddyfile`.

## Local Development

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- PostgreSQL: `localhost:5432`

The database is persisted in the `postgres_data` Docker volume and initialized from `backend/db/init.sql` when the volume is first created.

## Backups

Backups are intentionally handled by the host or infrastructure layer, not by a long-running backup container. Use [doc/backups.md](doc/backups.md) for the recommended PostgreSQL backup, retention, off-site copy, cron, and restore procedure.

## Documentation

- [Deployment quickstart](doc/deployment-quickstart.md): shortest deployment path with copy/paste commands.
- [Deployment guide](doc/deployment.md): full Compose selection, env files, diagrams, and deployment recipes.
- [Local development](doc/local-development.md): default local stack and local commands.
- [Backups and restore](doc/backups.md): production backup policy, cron setup, off-site copy, and restore procedure.
- [Operations](doc/operations.md): logs, validation, and post-deploy checks.
- [Caddy reverse proxy guide](docker-reverse.md): detailed Caddy setup.
- [Nginx Proxy Manager guide](docker-reverse-npm.md): detailed NPM setup.
- [Architecture](doc/architecture.md): container and application architecture.
- [Progressive Web App](doc/pwa.md): install behavior, offline shell caching, and icon replacement.
- [Troubleshooting](doc/troubleshooting.md): logs, request ids, and operational checks.
- [Root/admin behavior](doc/admin-root.md): admin and root user workflows.
- [Activity management](doc/activity-management.md): activity editing and deletion behavior.
- [Overtime/time-bank](doc/overtime-bank.md): overtime and time-bank rules.
- [Countdowns](doc/countdowns.md): countdown behavior.

## Features

- Username/password registration and login.
- Optional TOTP setup with QR code verification.
- Passkey registration/login flow with native WebAuthn ceremonies.
- Recovery codes for account recovery.
- Clock in/out workflow with editable client time confirmation.
- Tags with colors, including default tags.
- Daily, weekly, and monthly hour charts.
- Progressive Web App installation with app-shell caching.
- CSV export and restore import.
- Admin/root user management workflows.
- PostgreSQL database initialized from SQL, not backend startup code.
- Docker Compose support for local development and reverse-proxy deployment.

## Agentic Workflow

This repository includes workspace agents for planning and implementing the project from `todo.txt`.

- Main coordination file: `AGENTS.md`
- Per-agent definitions: `.github/agents/`
- Technical workflow notes: [doc/agentic-ai.md](doc/agentic-ai.md)
