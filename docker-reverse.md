# Reverse Proxy Docker Setup

This guide explains how to run emiTMachine behind the included Caddy reverse proxy.

For an Nginx Proxy Manager deployment, including the advanced variant with a
dedicated MariaDB database for NPM, see `docker-reverse-npm.md`.

## Files

- `docker-compose-reverse.example.yml`: public placeholder compose file.
- `docker-compose-reverse.yml`: private local compose file, ignored by Git.
- `docker-compose-reverse.postgres.env.example`: public placeholder Postgres environment file.
- `docker-compose-reverse.backend.env.example`: public placeholder backend environment file.
- `docker-compose-reverse.frontend.env.example`: public placeholder frontend environment file.
- `docker-compose-reverse.postgres.env`: private local Postgres environment file, ignored by Git.
- `docker-compose-reverse.backend.env`: private local backend environment file, ignored by Git.
- `docker-compose-reverse.frontend.env`: private local frontend environment file, ignored by Git.
- `caddy/config/Caddyfile.example`: public placeholder Caddy config.
- `caddy/config/Caddyfile`: private local Caddy config, ignored by Git.
- `caddy/certs/*.pem`: private TLS certificates, ignored by Git.

## 1. Create Private Files

Copy the placeholders:

```bash
cp docker-compose-reverse.example.yml docker-compose-reverse.yml
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
cp caddy/config/Caddyfile.example caddy/config/Caddyfile
```

Edit `caddy/config/Caddyfile` and replace:

```caddyfile
domain.example.com
```

with your real public domain.

Example:

```caddyfile
domain.example.com {
    tls /certs/cert.pem /certs/key.pem
    reverse_proxy frontend:5173
}
```

## 2. Add TLS Certificates

Place your certificate files here:

```text
caddy/certs/cert.pem
caddy/certs/key.pem
```

The example Caddyfile expects exactly these paths:

```caddyfile
tls /certs/cert.pem /certs/key.pem
```

## 3. Configure Private Variables

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

Optional:

```dotenv
LOG_LEVEL=info
LOG_FORMAT=json
```

For passkeys, `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the browser URL must use the same HTTPS domain.
Keep the password in `DATABASE_URL` aligned with `POSTGRES_PASSWORD`.

Edit `docker-compose-reverse.frontend.env`:

```dotenv
VITE_ALLOWED_HOSTS=domain.example.com
```

This allows the Vite dev server inside the frontend container to accept requests proxied from your public domain.

## 4. Start The Stack

Run:

```bash
docker compose -f docker-compose-reverse.yml up -d --build
```

The app should be reachable at:

```text
https://domain.example.com
```

## 5. Stop The Stack

Run:

```bash
docker compose -f docker-compose-reverse.yml down
```

To remove the database volume too:

```bash
docker compose -f docker-compose-reverse.yml down -v
```

## Network Notes

The reverse stack uses two Docker networks:

- `gotproxed`: bridge network exposed to Caddy.
- `emitmachineint`: internal network used by Caddy, frontend, backend, and Postgres.

`emitmachineint` is internal, so backend and Postgres are not published directly on the host.

Postgres runs as `postgres`; backend and frontend run as the non-root `node` user. The Caddy reverse proxy intentionally keeps the default image behavior so it can bind host ports `80` and `443`.

If Postgres fails with permission errors on an old local volume, the volume was probably initialized before the non-root setting. Fix the volume ownership or recreate the local database volume.

## Database Backups

The reverse stack does not include an automatic backup sidecar. Production backups should be scheduled on the Docker host or by infrastructure tooling, with retention, monitoring, off-site copy, and restore tests.

Use `doc/backups.md` for the recommended PostgreSQL backup and restore procedure.

With the current placeholder, Compose creates `gotproxed` automatically. If you need to share the same reverse proxy network with other Compose projects, change it to:

```yaml
networks:
  gotproxed:
    external: true
    name: gotproxed
```

Then create it once:

```bash
docker network create gotproxed
```

## Troubleshooting

Validate the compose file:

```bash
docker compose -f docker-compose-reverse.yml config
```

Check logs:

```bash
docker compose -f docker-compose-reverse.yml logs -f caddy
docker compose -f docker-compose-reverse.yml logs -f backend
docker compose -f docker-compose-reverse.yml logs -f frontend
```

Common issues:

- `network gotproxed declared as external, but could not be found`: create the external network or remove `external: true`.
- Passkeys fail: verify that `RP_ID`, `RP_ORIGIN`, `CORS_ORIGIN`, and the browser URL use the same HTTPS domain.
- `Blocked request. This host is not allowed`: set `VITE_ALLOWED_HOSTS` in `docker-compose-reverse.frontend.env` to the public domain used in the browser.
- Browser cannot reach the app: verify DNS, router port forwarding, firewall rules, and that Caddy is listening on ports `80` and `443`.
- Backend CORS/session errors: verify `CORS_ORIGIN=https://domain.example.com` and `COOKIE_SECURE=true`.

<!-- 
sudo systemctl stop docker
sudo systemctl stop containerd
sudo systemctl disable docker
sudo systemctl disable containerd
sudo apt purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo apt purge -y docker.io docker-compose containerd runc
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
sudo rm -rf /etc/docker
sudo rm -rf ~/.docker
sudo rm -f /var/run/docker.sock
sudo rm -rf /run/docker
sudo rm -rf /run/containerd
sudo groupdel docker
sudo apt autoremove -y
sudo apt autoclean
-->
