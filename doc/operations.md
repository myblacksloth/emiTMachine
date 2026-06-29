# Operations

This page covers backups, restore, logs, and production checks.

## Backups

All Compose stacks include `postgres-backup`, which writes the latest PostgreSQL dump every 8 hours:

```text
backups/postgres/emitmachine-latest.sql
```

The first dump is created as soon as PostgreSQL becomes healthy. Each run writes through a temporary file and then replaces the previous dump.

Backup files are ignored by Git.

## Restore

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

## Nginx Proxy Manager Backups

For NPM with SQLite, back up:

```text
nginx-proxy-manager/data
nginx-proxy-manager/letsencrypt
```

For NPM with MariaDB, back up MariaDB separately:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env exec -T npm-db sh -c 'mariadb-dump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > backups/npm-mariadb.sql
```

The `nginx-proxy-manager/letsencrypt` directory still needs a filesystem backup because certificate files are stored there.

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
- `backups/postgres/emitmachine-latest.sql` exists after PostgreSQL becomes healthy.

## Common Problems

- `port is already allocated`: another service is already using `80`, `443`, `81`, `5173`, `4000`, or `5432`, or multiple stacks are running at once.
- `Blocked request. This host is not allowed`: set `VITE_ALLOWED_HOSTS` to the public hostname used in the browser.
- Passkeys fail: verify HTTPS and make `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the browser URL consistent.
- Backend CORS or session errors: verify `CORS_ORIGIN=https://domain.example.com` and `COOKIE_SECURE=true`.
- Backend cannot connect to PostgreSQL: check that `POSTGRES_PASSWORD` matches the password in `DATABASE_URL`.
- NPM advanced stack reports missing MySQL variables: verify `docker-compose-npm-advanced.env` exists and is passed with `--env-file`.

More application logging notes are in [troubleshooting.md](troubleshooting.md).
