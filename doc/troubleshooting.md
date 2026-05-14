# Troubleshooting And Logging

emiTMachine containers log to stdout and stderr. Use Docker Compose logs during local development and let the deployment logging driver or reverse proxy collect the same streams in production.

## Logging Configuration

The backend service accepts these logging environment variables from `docker-compose.yml`:

```text
LOG_LEVEL=info
LOG_FORMAT=pretty
```

`LOG_LEVEL` controls the minimum severity written by the backend. Use:

- `debug` for short local investigations.
- `info` for normal local development.
- `warn` when only warnings and errors should be visible.
- `error` when only failures should be visible.

`LOG_FORMAT` controls the emitted format:

- `pretty` is easier to read in a terminal.
- `json` is better for central log collection because each log line can be parsed as one event.

After changing these values, recreate the backend container:

```bash
docker compose up -d --build backend
```

## Docker Log Commands

Follow backend logs:

```bash
docker compose logs -f backend
```

Follow all service logs:

```bash
docker compose logs -f
```

Show the last 100 backend log lines:

```bash
docker compose logs --tail=100 backend
```

Show backend and database logs together:

```bash
docker compose logs -f backend postgres
```

Show logs since the last ten minutes:

```bash
docker compose logs --since=10m backend
```

## Request Ids

Use `X-Request-Id` to connect one user action across logs.

Recommended behavior:

- A reverse proxy should pass an existing `X-Request-Id` header to the backend.
- If no request id exists, the backend should generate one.
- The backend should include the request id in request logs and return it as the `X-Request-Id` response header.
- Operators should include the request id when reporting API failures.

Example API request with a known request id:

```bash
curl -i -H "X-Request-Id: local-login-test-001" http://localhost:4000/api/health
```

Then search the backend logs for `local-login-test-001`:

```bash
docker compose logs backend | grep local-login-test-001
```

Check logging configuration and request id propagation:

```bash
curl -i -H "X-Request-Id: log-check-001" http://localhost:4000/api/health/diagnostics
```

## Common Issues

Backend does not start:

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 postgres
```

Check for missing environment variables, database connection errors, or a PostgreSQL health check that never becomes healthy.

API returns an unexpected error:

```bash
docker compose logs -f backend
```

Reproduce the request and capture the method, path, status code, and request id from the log line.

Database schema did not initialize:

```bash
docker compose logs postgres
```

The SQL init file runs only when the PostgreSQL data volume is first created. If the volume already exists, new init SQL changes are not replayed automatically.

Logs are too verbose:

Set `LOG_LEVEL=warn` for the backend service and recreate it:

```bash
docker compose up -d --build backend
```

Structured log collection is needed:

Set `LOG_FORMAT=json` for the backend service and collect Docker stdout/stderr from the `backend` container.
