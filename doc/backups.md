# Backup And Restore

emiTMachine does not run an automatic backup container. Production backups should be owned by the host or by the infrastructure layer, so they can have retention, monitoring, off-site copy, and restore tests.

This guide uses host `cron` plus Docker Compose commands. The examples assume:

- Repository path: `/opt/emitmachine`
- Backup root: `/srv/backups/emitmachine`
- Application database: `emitmachine`
- Application database user: `emitmachine`

Adjust paths for your server.

## Backup Policy

A production backup setup should include:

- Daily PostgreSQL logical dumps in custom format.
- Timestamped backup files, not a single overwritten file.
- SHA-256 checksums for every dump.
- Local retention, for example 14 daily backups.
- Off-site copy to another machine or object storage.
- Backup logs that are monitored.
- Periodic restore tests on a disposable database.
- Separate backup of reverse-proxy runtime data and TLS certificates.

Do not rely on Docker volumes alone. A volume is not a backup.

## PostgreSQL Backup Script

Create a host-side script:

```bash
sudo install -d -m 0750 -o root -g root /usr/local/sbin
sudo install -d -m 0750 -o root -g root /srv/backups/emitmachine/postgres
sudo install -d -m 0750 -o root -g root /var/log/emitmachine
```

Create `/usr/local/sbin/emitmachine-postgres-backup`:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/emitmachine"
BACKUP_DIR="/srv/backups/emitmachine/postgres"
RETENTION_DAYS="14"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose-reverse.yml}"
ENV_FILE="${ENV_FILE:-}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="${BACKUP_DIR}/emitmachine-${timestamp}.dump.tmp"
out="${BACKUP_DIR}/emitmachine-${timestamp}.dump"
checksum="${out}.sha256"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

compose=(docker compose -f "$COMPOSE_FILE")
if [ -n "$ENV_FILE" ]; then
  compose+=(--env-file "$ENV_FILE")
fi

"${compose[@]}" exec -T postgres pg_dump \
  --username=emitmachine \
  --dbname=emitmachine \
  --format=custom \
  --no-owner \
  --no-privileges \
  > "$tmp"

mv "$tmp" "$out"
sha256sum "$out" > "$checksum"
chmod 0640 "$out" "$checksum"

find "$BACKUP_DIR" -type f -name 'emitmachine-*.dump' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'emitmachine-*.dump.sha256' -mtime +"$RETENTION_DAYS" -delete
```

Install it:

```bash
sudo chmod 0750 /usr/local/sbin/emitmachine-postgres-backup
```

For the default local stack, set:

```bash
COMPOSE_FILE=docker-compose.yml
```

For the Caddy stack, set:

```bash
COMPOSE_FILE=docker-compose-reverse.yml
```

For the NPM SQLite stack, set:

```bash
COMPOSE_FILE=docker-compose-npm.yml
```

For the advanced NPM stack, set:

```bash
COMPOSE_FILE=docker-compose-npm-advanced.yml
ENV_FILE=docker-compose-npm-advanced.env
```

## Cron

Run the PostgreSQL backup every night at 02:15.

Open root crontab:

```bash
sudo crontab -e
```

For Caddy or NPM SQLite:

```cron
15 2 * * * COMPOSE_FILE=docker-compose-reverse.yml /usr/local/sbin/emitmachine-postgres-backup >> /var/log/emitmachine/postgres-backup.log 2>&1
```

For advanced NPM:

```cron
15 2 * * * COMPOSE_FILE=docker-compose-npm-advanced.yml ENV_FILE=docker-compose-npm-advanced.env /usr/local/sbin/emitmachine-postgres-backup >> /var/log/emitmachine/postgres-backup.log 2>&1
```

Use `docker-compose-npm.yml` instead of `docker-compose-reverse.yml` if that is the stack you run.

## Off-Site Copy

Local backups protect against application mistakes. They do not protect against disk loss, server loss, theft, or ransomware.

Copy backups off the server after each successful dump. Examples:

```bash
rsync -a --delete /srv/backups/emitmachine/ backup-user@backup-host:/srv/backups/emitmachine/
```

or with `rclone`:

```bash
rclone sync /srv/backups/emitmachine remote:emitmachine-backups
```

Example cron entry for an off-site copy at 03:00, after the local PostgreSQL dump:

```cron
0 3 * * * rsync -a --delete /srv/backups/emitmachine/ backup-user@backup-host:/srv/backups/emitmachine/ >> /var/log/emitmachine/backup-offsite.log 2>&1
```

A stronger policy is:

- Keep 14 daily backups locally.
- Keep at least 30 daily backups off-site.
- Keep weekly backups for 3 months.
- Keep monthly backups for 1 year if storage cost is acceptable.

## Reverse Proxy Data

PostgreSQL is not the only production state.

For Caddy, back up:

```text
caddy/config/Caddyfile
caddy/certs/
caddy/data/
caddy/conf/
```

For Nginx Proxy Manager with SQLite, back up:

```text
nginx-proxy-manager/data/
nginx-proxy-manager/letsencrypt/
```

For Nginx Proxy Manager with MariaDB, back up:

```text
nginx-proxy-manager/letsencrypt/
```

and dump the NPM MariaDB database:

```bash
sudo install -d -m 0750 -o root -g root /srv/backups/emitmachine/npm-mariadb
cd /opt/emitmachine
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env exec -T npm-db \
  sh -c 'mariadb-dump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > /srv/backups/emitmachine/npm-mariadb/npm-$(date -u +%Y%m%dT%H%M%SZ).sql
```

## Manual Backup

Run a manual PostgreSQL backup:

```bash
sudo env COMPOSE_FILE=docker-compose-reverse.yml /usr/local/sbin/emitmachine-postgres-backup
```

List backups:

```bash
ls -lh /srv/backups/emitmachine/postgres
```

Verify a checksum:

```bash
cd /srv/backups/emitmachine/postgres
sha256sum -c emitmachine-YYYYMMDDTHHMMSSZ.dump.sha256
```

## Restore PostgreSQL

Restoring replaces the current database. Take a fresh backup before restoring unless the database is already lost.

1. Stop application traffic:

```bash
cd /opt/emitmachine
docker compose -f docker-compose-reverse.yml stop backend frontend
```

Use the same Compose file and env-file options as your running stack.

2. Optional emergency backup before restore:

```bash
sudo env COMPOSE_FILE=docker-compose-reverse.yml /usr/local/sbin/emitmachine-postgres-backup
```

3. Verify the backup checksum:

```bash
cd /srv/backups/emitmachine/postgres
sha256sum -c emitmachine-YYYYMMDDTHHMMSSZ.dump.sha256
```

4. Recreate the database:

```bash
cd /opt/emitmachine
docker compose -f docker-compose-reverse.yml exec -T postgres dropdb --username=emitmachine --if-exists emitmachine
docker compose -f docker-compose-reverse.yml exec -T postgres createdb --username=emitmachine emitmachine
```

5. Restore:

```bash
docker compose -f docker-compose-reverse.yml exec -T postgres pg_restore \
  --username=emitmachine \
  --dbname=emitmachine \
  --no-owner \
  --no-privileges \
  < /srv/backups/emitmachine/postgres/emitmachine-YYYYMMDDTHHMMSSZ.dump
```

6. Restart the app:

```bash
docker compose -f docker-compose-reverse.yml up -d backend frontend
```

7. Check logs and sign in:

```bash
docker compose -f docker-compose-reverse.yml logs --tail=100 backend postgres
```

## Restore Test

A backup is not trustworthy until it has been restored successfully.

At least monthly:

- Restore the latest dump into a disposable PostgreSQL container or staging environment.
- Start the backend against the restored database.
- Verify login, reports, tags, and recent time records.
- Record the restore date and the backup file used.

## Notes

- Prefer custom-format dumps (`--format=custom`) because they are safer to restore with `pg_restore`.
- Keep backup files readable only by administrators.
- Monitor cron logs. A silent failing backup job is equivalent to no backup.
- Store at least one copy outside the Docker host.
