# Local Development

Use the default Compose stack for local development.

## Start

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

Services:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:4000/api` |
| PostgreSQL | `localhost:5432` |

## What The Local Stack Starts

`docker-compose.yml` starts:

- `postgres`: PostgreSQL 16 with schema initialization from `backend/db/init.sql`.
- `postgres-backup`: periodic PostgreSQL dump sidecar.
- `backend`: Node backend API.
- `frontend`: Vite frontend.

The database is persisted in the `postgres_data` Docker volume. SQL initialization runs only when the database volume is first created.

## Useful Commands

Follow all logs:

```bash
docker compose logs -f
```

Follow backend logs:

```bash
docker compose logs -f backend
```

Rebuild one service:

```bash
docker compose up -d --build backend
docker compose up -d --build frontend
```

Stop:

```bash
docker compose down
```

Stop and remove local database data:

```bash
docker compose down -v
```

## Local Defaults

The local Compose file provides development defaults directly in service definitions:

```text
DATABASE_URL=postgres://emitmachine:emitmachine@postgres:5432/emitmachine
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
RP_ID=localhost
RP_ORIGIN=http://localhost:5173
VITE_BACKEND_PROXY_TARGET=http://backend:4000
```

For deployment, do not reuse these defaults. Use private env files as described in [deployment-quickstart.md](deployment-quickstart.md).
