# Deployment Guide

This guide is the operational entry point for deploying emiTMachine with Docker Compose.

## Pick One Stack

Do not run multiple production stacks at the same time unless you intentionally isolate ports, volumes, and networks.

| File | When to use it | Exposed ports |
| --- | --- | --- |
| `docker-compose.yml` | Local development and quick testing. Uses development defaults directly in the Compose file. | `5173`, `4000`, `5432` |
| `docker-compose-reverse.yml` | Production-style deployment with the included Caddy reverse proxy. | `80`, `443` |
| `docker-compose-npm.yml` | Production-style deployment with Nginx Proxy Manager using SQLite for NPM's own data. | `80`, `443`, `81` |
| `docker-compose-npm-advanced.yml` | Production-style deployment with Nginx Proxy Manager using a dedicated MariaDB database for NPM's own data. | `80`, `443`, `81` |

emiTMachine always uses PostgreSQL for application data. The SQLite or MariaDB database in the Nginx Proxy Manager stacks stores only NPM data: proxy hosts, certificates, NPM users, and NPM settings.

## Quick Start: Local Development

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

The backend API is available at:

```text
http://localhost:4000/api
```

## Quick Start: Caddy Deployment

Create private files:

```bash
cp docker-compose-reverse.example.yml docker-compose-reverse.yml
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
cp caddy/config/Caddyfile.example caddy/config/Caddyfile
```

Edit:

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

Stop:

```bash
docker compose -f docker-compose-reverse.yml down
```

Detailed Caddy notes are in [../docker-reverse.md](../docker-reverse.md).

## Quick Start: Nginx Proxy Manager With SQLite

Create shared emiTMachine env files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

Edit:

- `docker-compose-reverse.postgres.env`
- `docker-compose-reverse.backend.env`
- `docker-compose-reverse.frontend.env`

Start:

```bash
docker compose -f docker-compose-npm.yml up -d --build
```

Open the NPM admin UI:

```text
http://your-server:81
```

Default NPM credentials:

```text
admin@example.com
changeme
```

Change the default NPM credentials immediately after first login.

In NPM, create a proxy host:

- Forward hostname: `frontend`
- Forward port: `5173`
- Scheme: `http`
- Websockets support: enabled
- SSL: request or upload a certificate for your domain

Detailed NPM notes are in [../docker-reverse-npm.md](../docker-reverse-npm.md).

## Quick Start: Nginx Proxy Manager With MariaDB

Create shared emiTMachine env files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

Create the private NPM MariaDB env file:

```bash
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

Edit:

- `docker-compose-reverse.postgres.env`
- `docker-compose-reverse.backend.env`
- `docker-compose-reverse.frontend.env`
- `docker-compose-npm-advanced.env`

Start:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build
```

Open the NPM admin UI:

```text
http://your-server:81
```

Detailed NPM notes are in [../docker-reverse-npm.md](../docker-reverse-npm.md).

## Env Files

Only example env files are committed to the repository. Real env files contain secrets and deployment-specific values, are ignored by Git, and must not be pushed.

Tracked examples:

| Example file | Copy to | Used by |
| --- | --- | --- |
| `docker-compose-reverse.postgres.env.example` | `docker-compose-reverse.postgres.env` | Caddy and NPM stacks |
| `docker-compose-reverse.backend.env.example` | `docker-compose-reverse.backend.env` | Caddy and NPM stacks |
| `docker-compose-reverse.frontend.env.example` | `docker-compose-reverse.frontend.env` | Caddy and NPM stacks |
| `docker-compose-npm-advanced.env.example` | `docker-compose-npm-advanced.env` | Advanced NPM stack only |
| `backend/.env.example` | optional local backend env | backend outside Compose |

Critical values:

- `POSTGRES_PASSWORD`: PostgreSQL password for the `emitmachine` database user.
- `DATABASE_URL`: backend PostgreSQL connection string. The password must match `POSTGRES_PASSWORD`.
- `CORS_ORIGIN`: exact public browser origin, for example `https://time.example.com`.
- `COOKIE_SECURE`: use `true` for HTTPS deployment.
- `RP_ID`: passkey relying party id, usually the public hostname without protocol.
- `RP_ORIGIN`: exact public HTTPS origin used for passkeys.
- `TOTP_ENCRYPTION_KEY`: 32-byte base64 key. Generate with `openssl rand -base64 32`.
- `VITE_ALLOWED_HOSTS`: comma-separated hostnames allowed by the frontend dev server, without protocol or path.

For passkeys, `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the URL opened in the browser must describe the same HTTPS site.

## Compose File Reference

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Local development stack with PostgreSQL, `postgres-backup`, backend, and frontend. |
| `docker-compose-reverse.example.yml` | Tracked Caddy deployment template. Copy it to `docker-compose-reverse.yml`. |
| `docker-compose-reverse.yml` | Private active Caddy deployment file, ignored by Git. |
| `docker-compose-npm.yml` | Nginx Proxy Manager stack with SQLite NPM storage. |
| `docker-compose-npm-advanced.yml` | Nginx Proxy Manager stack with MariaDB NPM storage. |

## Backups And Restore

All Compose stacks include `postgres-backup`, which writes a PostgreSQL dump every 8 hours:

```text
backups/postgres/emitmachine-latest.sql
```

The first dump is created as soon as PostgreSQL becomes healthy. Each run overwrites the previous dump atomically. Backup files are ignored by Git.

Restore into the local stack:

```bash
docker compose exec -T postgres psql -U emitmachine -d emitmachine < backups/postgres/emitmachine-latest.sql
```

Restore into the Caddy stack:

```bash
docker compose -f docker-compose-reverse.yml exec -T postgres psql -U emitmachine -d emitmachine < backups/postgres/emitmachine-latest.sql
```

Restore into the NPM SQLite stack:

```bash
docker compose -f docker-compose-npm.yml exec -T postgres psql -U emitmachine -d emitmachine < backups/postgres/emitmachine-latest.sql
```

Restore into the advanced NPM stack:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env exec -T postgres psql -U emitmachine -d emitmachine < backups/postgres/emitmachine-latest.sql
```

For NPM SQLite, also back up:

```text
nginx-proxy-manager/data
nginx-proxy-manager/letsencrypt
```

For advanced NPM, back up MariaDB separately:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env exec -T npm-db sh -c 'mariadb-dump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > backups/npm-mariadb.sql
```

The `nginx-proxy-manager/letsencrypt` directory still needs a filesystem backup because certificate files are stored there.

## Validation And Logs

Validate a stack before starting it:

```bash
docker compose config
docker compose -f docker-compose-reverse.yml config
docker compose -f docker-compose-npm.yml config
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env config
```

Follow logs:

```bash
docker compose logs -f
docker compose -f docker-compose-reverse.yml logs -f caddy backend frontend postgres
docker compose -f docker-compose-npm.yml logs -f nginx-proxy-manager backend frontend postgres
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env logs -f nginx-proxy-manager npm-db backend frontend postgres
```

## Common Problems

- `port is already allocated`: another service is already using `80`, `443`, `81`, `5173`, `4000`, or `5432`, or multiple stacks are running at once.
- `Blocked request. This host is not allowed`: set `VITE_ALLOWED_HOSTS` to the public hostname used in the browser.
- Passkeys fail: verify HTTPS and make `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the browser URL consistent.
- Backend CORS or session errors: verify `CORS_ORIGIN=https://your.domain.com` and `COOKIE_SECURE=true`.
- Backend cannot connect to PostgreSQL: check that `POSTGRES_PASSWORD` matches the password in `DATABASE_URL`.
- NPM advanced stack reports missing MySQL variables: verify `docker-compose-npm-advanced.env` exists and is passed with `--env-file`.

More logging notes are in [troubleshooting.md](troubleshooting.md).
