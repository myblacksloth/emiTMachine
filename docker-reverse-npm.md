# Nginx Proxy Manager Docker Setup

This guide explains how to run emiTMachine behind Nginx Proxy Manager (NPM).
Two variants are available:

- `docker-compose-npm.yml`: NPM with its default SQLite storage.
- `docker-compose-npm-advanced.yml`: NPM with a dedicated MariaDB database.

Both variants keep the emiTMachine application database on PostgreSQL. The NPM
database stores only NPM data such as proxy hosts, certificates, NPM users, and
NPM settings.

Do not run both NPM variants at the same time because both bind host ports `80`,
`443`, and `81`.

## Files

- `docker-compose-npm.yml`: NPM reverse proxy stack using SQLite for NPM data.
- `docker-compose-npm-advanced.yml`: NPM reverse proxy stack using MariaDB for NPM data.
- `docker-compose-npm-advanced.env.example`: public placeholder environment file for the NPM MariaDB database.
- `docker-compose-npm-advanced.env`: private local NPM MariaDB environment file, ignored by Git.
- `docker-compose-reverse.postgres.env`: private PostgreSQL environment file for emiTMachine.
- `docker-compose-reverse.backend.env`: private backend environment file for emiTMachine.
- `docker-compose-reverse.frontend.env`: private frontend environment file for emiTMachine.
- `nginx-proxy-manager/data`: NPM runtime data, ignored by Git.
- `nginx-proxy-manager/letsencrypt`: NPM certificate data, ignored by Git.

## Shared emiTMachine Environment

Both NPM stacks reuse the existing reverse-proxy environment files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

Edit `docker-compose-reverse.postgres.env`:

```dotenv
POSTGRES_PASSWORD=change-this-password
```

Edit `docker-compose-reverse.backend.env`:

```dotenv
NODE_ENV=production

DATABASE_URL=postgres://emitmachine:change-this-password@postgres:5432/emitmachine

CORS_ORIGIN=https://domain.example.com
COOKIE_SECURE=true

RP_ID=domain.example.com
RP_ORIGIN=https://domain.example.com

TOTP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
```

Edit `docker-compose-reverse.frontend.env`:

```dotenv
VITE_ALLOWED_HOSTS=domain.example.com
```

For passkeys, `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the browser URL must use
the same HTTPS domain.

## Option 1: NPM With SQLite

Use this option for a single NPM instance with simple operational needs.

Start the stack:

```bash
docker compose -f docker-compose-npm.yml up -d --build
```

Stop the stack:

```bash
docker compose -f docker-compose-npm.yml down
```

Remove all stack volumes, including emiTMachine PostgreSQL data:

```bash
docker compose -f docker-compose-npm.yml down -v
```

NPM stores its SQLite database at:

```text
nginx-proxy-manager/data/database.sqlite
```

## Option 2: Advanced NPM With MariaDB

Use this option when you want NPM data in a dedicated database with a clearer
backup and operations boundary.

Create the private NPM database environment file:

```bash
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

Edit `docker-compose-npm-advanced.env` and replace every password placeholder:

```dotenv
MYSQL_ROOT_PASSWORD=replace-with-npm-mariadb-root-password
MYSQL_DATABASE=npm
MYSQL_USER=npm
MYSQL_PASSWORD=replace-with-npm-mariadb-user-password
```

Start the advanced stack:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build
```

Stop the advanced stack:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env down
```

Remove all stack volumes, including NPM MariaDB data and emiTMachine PostgreSQL
data:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env down -v
```

The advanced stack creates:

- `npm-db`: MariaDB for Nginx Proxy Manager only.
- `npm_mariadb_data`: persistent NPM MariaDB volume.
- `npmdbint`: internal network between NPM and MariaDB.
- `postgres`: PostgreSQL for emiTMachine only.
- `postgres_data`: persistent emiTMachine PostgreSQL volume.
- `emitmachineint`: internal application network.
- `gotproxed`: public bridge network for the reverse proxy.

## NPM First Login

Open the NPM admin UI on:

```text
http://your-server:81
```

Default NPM credentials:

```text
admin@example.com
changeme
```

Change the default NPM credentials immediately after the first login.

## Proxy Host Configuration

In NPM, create a proxy host for your public domain:

- Forward hostname: `frontend`
- Forward port: `5173`
- Scheme: `http`
- Websockets support: enabled
- SSL: request or upload a certificate for your domain

Then make sure the backend environment uses the same public origin:

```dotenv
CORS_ORIGIN=https://domain.example.com
COOKIE_SECURE=true
RP_ID=domain.example.com
RP_ORIGIN=https://domain.example.com
```

## Backups

emiTMachine PostgreSQL backups should be scheduled on the Docker host or by infrastructure tooling, not by a long-running backup container. Use `doc/backups.md` for the recommended PostgreSQL backup and restore procedure.

For the SQLite NPM stack, also back up:

```text
nginx-proxy-manager/data
nginx-proxy-manager/letsencrypt
```

For the advanced MariaDB NPM stack, back up:

```bash
sudo install -d -m 0750 -o root -g root /srv/backups/emitmachine/npm-mariadb
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env exec -T npm-db sh -c 'mariadb-dump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > /srv/backups/emitmachine/npm-mariadb/npm-$(date -u +%Y%m%dT%H%M%SZ).sql
```

The `nginx-proxy-manager/letsencrypt` directory still needs a filesystem backup
because certificate files are stored there.

## Troubleshooting

Validate the SQLite stack:

```bash
docker compose -f docker-compose-npm.yml config
```

Validate the advanced stack:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env config
```

Check logs:

```bash
docker compose -f docker-compose-npm.yml logs -f nginx-proxy-manager
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env logs -f nginx-proxy-manager npm-db
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env logs -f backend frontend postgres
```

Common issues:

- `getaddrinfo ENOTFOUND db`: NPM is trying to use an old MySQL/MariaDB host named `db`. Stop the stack and remove stale NPM data before switching storage modes.
- `port is already allocated`: another service is already binding `80`, `443`, or `81`, or both NPM variants are running.
- `Blocked request. This host is not allowed`: set `VITE_ALLOWED_HOSTS` in `docker-compose-reverse.frontend.env` to the public domain used in the browser.
- Passkeys fail: verify that `RP_ID`, `RP_ORIGIN`, and the browser URL use the same HTTPS domain.
- Backend CORS/session errors: verify `CORS_ORIGIN=https://domain.example.com` and `COOKIE_SECURE=true`.

To reset only NPM SQLite data:

```bash
docker compose -f docker-compose-npm.yml down
rm -rf nginx-proxy-manager/data
docker compose -f docker-compose-npm.yml up -d --build
```

To reset only the advanced NPM MariaDB volume:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env down
docker volume ls --format '{{.Name}}' | grep npm_mariadb_data
docker volume rm <npm_mariadb_data_volume_name>
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build
```
