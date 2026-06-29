# emiTMachine

emiTMachine is a multi-user time tracking web app for work sessions, tags, reports, TOTP, passkeys, recovery codes, CSV history, admin workflows, and overtime/time-bank tracking.

## Deploy Fast

Use this section when you already know which deployment style you want. Full deployment details are in [doc/deployment.md](doc/deployment.md).

| Goal | Use | Command |
| --- | --- | --- |
| Local development | `docker-compose.yml` | `docker compose up --build` |
| Production with included Caddy reverse proxy | `docker-compose-reverse.yml` | `docker compose -f docker-compose-reverse.yml up -d --build` |
| Production with Nginx Proxy Manager and SQLite NPM storage | `docker-compose-npm.yml` | `docker compose -f docker-compose-npm.yml up -d --build` |
| Production with Nginx Proxy Manager and MariaDB NPM storage | `docker-compose-npm-advanced.yml` | `docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build` |

For a real deployment, create the private env files before starting the stack:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

If you use `docker-compose-npm-advanced.yml`, also run:

```bash
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

Only `.example` env files are committed. Real env files contain secrets and deployment-specific domains, are ignored by Git, and must not be pushed.

## Minimal Deployment Checklist

1. Pick one stack from the table above.
2. Copy the required `.example` env files.
3. Replace every placeholder domain, password, and encryption key.
4. Keep `POSTGRES_PASSWORD` aligned with the password inside `DATABASE_URL`.
5. For passkeys, set `RP_ID`, `RP_ORIGIN`, and `CORS_ORIGIN` to the same public HTTPS hostname users open in the browser.
6. Start the selected Compose stack.

For Caddy, also copy the Caddyfile example and provide TLS certificates:

```bash
cp docker-compose-reverse.example.yml docker-compose-reverse.yml
cp caddy/config/Caddyfile.example caddy/config/Caddyfile
```

Then edit `caddy/config/Caddyfile` and place certificates at:

```text
caddy/certs/cert.pem
caddy/certs/key.pem
```

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

The Compose stacks include a `postgres-backup` sidecar. It writes the latest PostgreSQL dump every 8 hours to:

```text
backups/postgres/emitmachine-latest.sql
```

Manual restore into the default local stack:

```bash
docker compose exec -T postgres psql -U emitmachine -d emitmachine < backups/postgres/emitmachine-latest.sql
```

Deployment restore commands and Nginx Proxy Manager backup notes are in [doc/deployment.md](doc/deployment.md).

## Documentation

- [Deployment guide](doc/deployment.md): Compose selection, env files, Caddy, Nginx Proxy Manager, backups, and troubleshooting.
- [Caddy reverse proxy guide](docker-reverse.md): detailed Caddy setup.
- [Nginx Proxy Manager guide](docker-reverse-npm.md): detailed NPM setup.
- [Architecture](doc/architecture.md): container and application architecture.
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
- CSV export and restore import.
- Admin/root user management workflows.
- PostgreSQL database initialized from SQL, not backend startup code.
- Docker Compose support for local development and reverse-proxy deployment.

## Screenshots

![](./stuff/i/SCR-20260515-ogph.png)

![](./stuff/i/SCR-20260515-nyjq.png)

|   |   |
| ------------ | ------------ |
| ![](./stuff/i/SCR-20260515-oemn.png) | ![](./stuff/i/SCR-20260515-oeyo.png) |
| ![](./stuff/i/SCR-20260515-offp.png) | ![](./stuff/i/SCR-20260515-oflv.png) |
| ![](./stuff/i/SCR-20260515-ofrs.png) | ![](./stuff/i/SCR-20260520-otwy.png) |

## Agentic Workflow

This repository includes workspace agents for planning and implementing the project from `todo.txt`.

- Main coordination file: `AGENTS.md`
- Per-agent definitions: `.github/agents/`
- Technical workflow notes: [doc/agentic-ai.md](doc/agentic-ai.md)
