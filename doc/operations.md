# Operations

This page covers logs, validation, and production checks. Backup and restore procedures are documented separately in [backups.md](backups.md).

## Logs

Default local stack:

```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs --tail=100 postgres
```

Caddy stack:

```bash
docker compose -f docker-compose-reverse.yml logs -f caddy backend frontend postgres
```

NPM SQLite stack:

```bash
docker compose -f docker-compose-npm.yml logs -f nginx-proxy-manager backend frontend postgres
```

Advanced NPM stack:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env logs -f nginx-proxy-manager npm-db backend frontend postgres
```

## Validate Compose Files

```bash
docker compose config
docker compose -f docker-compose-reverse.yml config
docker compose -f docker-compose-npm.yml config
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env config
```

## Post-Deploy Checklist

- `docker compose ... ps` shows running services.
- The public HTTPS URL opens the app.
- Login or registration works.
- Passkey setup works over HTTPS.
- Backend logs do not show CORS, cookie, or database connection errors.
- PostgreSQL logs show a healthy database.
- A host-level PostgreSQL backup job is configured and has produced at least one verified backup.
- Off-site copy is configured for backup files.

## Common Problems

- `port is already allocated`: another service is already using `80`, `443`, `81`, `5173`, `4000`, or `5432`, or multiple stacks are running at once.
- `Blocked request. This host is not allowed`: set `VITE_ALLOWED_HOSTS` to the public hostname used in the browser.
- Passkeys fail: verify HTTPS and make `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the browser URL consistent.
- Backend CORS or session errors: verify `CORS_ORIGIN=https://domain.example.com` and `COOKIE_SECURE=true`.
- Backend cannot connect to PostgreSQL: check that `POSTGRES_PASSWORD` matches the password in `DATABASE_URL`.
- NPM advanced stack reports missing MySQL variables: verify `docker-compose-npm-advanced.env` exists and is passed with `--env-file`.

More application logging notes are in [troubleshooting.md](troubleshooting.md).
