# Deployment Guide

This is the full deployment guide for emiTMachine. If you only need copy/paste commands, start with [deployment-quickstart.md](deployment-quickstart.md).

The examples use this public hostname:

```text
domain.example.com
```

Replace it with your real HTTPS hostname everywhere.

## Architecture

```mermaid
flowchart LR
  Browser[Browser] --> ReverseProxy[Reverse proxy]
  ReverseProxy --> Frontend[Frontend container]
  Frontend --> Backend[Backend container]
  Backend --> Postgres[(PostgreSQL)]
  Backup[postgres-backup] --> Postgres
  Backup --> Dump[backups/postgres/emitmachine-latest.sql]
```

Nginx Proxy Manager deployments add NPM storage:

```mermaid
flowchart LR
  NPM[Nginx Proxy Manager] --> Frontend[Frontend container]
  NPM --> NPMStore[(SQLite or MariaDB for NPM only)]
  Backend[Backend container] --> Postgres[(PostgreSQL for emiTMachine)]
```

emiTMachine always uses PostgreSQL for application data. SQLite or MariaDB in Nginx Proxy Manager stacks stores only NPM configuration.

## Pick One Stack

Do not run multiple production stacks at the same time unless you intentionally isolate ports, volumes, and networks.

| File | Use case | Exposed ports |
| --- | --- | --- |
| `docker-compose.yml` | Local development and quick testing. | `5173`, `4000`, `5432` |
| `docker-compose-reverse.yml` | Production-style deployment with the included Caddy reverse proxy. | `80`, `443` |
| `docker-compose-npm.yml` | Production-style deployment with Nginx Proxy Manager and SQLite NPM storage. | `80`, `443`, `81` |
| `docker-compose-npm-advanced.yml` | Production-style deployment with Nginx Proxy Manager and MariaDB NPM storage. | `80`, `443`, `81` |

## Deployment Recipes

### Included Caddy Reverse Proxy

Use this when you want the repository to run the reverse proxy too and you already have TLS certificate files.

Create files:

```bash
cp docker-compose-reverse.example.yml docker-compose-reverse.yml
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
cp caddy/config/Caddyfile.example caddy/config/Caddyfile
```

Configure:

- `docker-compose-reverse.postgres.env`
- `docker-compose-reverse.backend.env`
- `docker-compose-reverse.frontend.env`
- `caddy/config/Caddyfile`

Place TLS certificates:

```text
caddy/certs/cert.pem
caddy/certs/key.pem
```

Start:

```bash
docker compose -f docker-compose-reverse.yml up -d --build
```

Detailed Caddy notes are in [../docker-reverse.md](../docker-reverse.md).

### Nginx Proxy Manager With SQLite

Use this for the simplest NPM deployment.

Create files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

Configure the copied env files, then start:

```bash
docker compose -f docker-compose-npm.yml up -d --build
```

Open:

```text
http://your-server:81
```

Default NPM credentials:

```text
admin@example.com
changeme
```

Change them immediately after first login.

Create an NPM proxy host:

- Domain name: `domain.example.com`
- Forward hostname: `frontend`
- Forward port: `5173`
- Scheme: `http`
- Websockets support: enabled
- SSL: request or upload a certificate for `domain.example.com`

Detailed NPM notes are in [../docker-reverse-npm.md](../docker-reverse-npm.md).

### Nginx Proxy Manager With MariaDB

Use this when you want NPM data in a dedicated MariaDB database.

Create files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

Configure all copied env files, then start:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build
```

Configure NPM as described in the SQLite recipe.

## Env Files

Only example env files are committed. Real env files contain secrets and deployment-specific values, are ignored by Git, and must not be pushed.

| Example file | Copy to | Used by |
| --- | --- | --- |
| `docker-compose-reverse.postgres.env.example` | `docker-compose-reverse.postgres.env` | Caddy and NPM stacks |
| `docker-compose-reverse.backend.env.example` | `docker-compose-reverse.backend.env` | Caddy and NPM stacks |
| `docker-compose-reverse.frontend.env.example` | `docker-compose-reverse.frontend.env` | Caddy and NPM stacks |
| `docker-compose-npm-advanced.env.example` | `docker-compose-npm-advanced.env` | Advanced NPM stack only |
| `backend/.env.example` | optional local backend env | Backend outside Compose |

## What To Edit

| Goal | File or setting |
| --- | --- |
| Set the public domain | `docker-compose-reverse.backend.env`, `docker-compose-reverse.frontend.env`, Caddyfile or NPM proxy host |
| Set PostgreSQL password | `docker-compose-reverse.postgres.env` and the password part of `DATABASE_URL` in `docker-compose-reverse.backend.env` |
| Configure passkeys | `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN` |
| Configure frontend allowed host | `VITE_ALLOWED_HOSTS` |
| Configure Caddy TLS | `caddy/config/Caddyfile`, `caddy/certs/cert.pem`, `caddy/certs/key.pem` |
| Configure advanced NPM MariaDB | `docker-compose-npm-advanced.env` |
| Change backend log format | `LOG_FORMAT` in `docker-compose-reverse.backend.env` |
| Change backend log level | `LOG_LEVEL` in `docker-compose-reverse.backend.env` |

## Required Values

Set these values for deployment:

```dotenv
POSTGRES_PASSWORD=replace-with-a-real-password
DATABASE_URL=postgres://emitmachine:replace-with-a-real-password@postgres:5432/emitmachine
CORS_ORIGIN=https://domain.example.com
COOKIE_SECURE=true
RP_ID=domain.example.com
RP_ORIGIN=https://domain.example.com
VITE_ALLOWED_HOSTS=domain.example.com
```

Generate a real TOTP encryption key:

```bash
openssl rand -base64 32
```

Then set:

```dotenv
TOTP_ENCRYPTION_KEY=<generated-value>
```

For passkeys, `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the URL opened in the browser must describe the same HTTPS site.

## Do Not Commit

Do not commit private deployment files:

- `docker-compose-reverse.yml`
- `docker-compose-reverse.*.env`
- `docker-compose-npm-advanced.env`
- `caddy/config/Caddyfile`
- `caddy/certs/*.pem`
- `nginx-proxy-manager/`
- `backups/postgres/*.sql`

These are already covered by `.gitignore`; keep them private.

## Backups, Logs, And Checks

Operational commands are in [operations.md](operations.md):

- PostgreSQL backup and restore.
- Nginx Proxy Manager backup notes.
- Compose validation commands.
- Logs for each stack.
- Post-deploy checklist.
- Common production problems.

## Local Development

Local development commands are in [local-development.md](local-development.md).
