# Deployment Quickstart

Use this page when you want to deploy without reading the full documentation first. The example public hostname is:

```text
domain.example.com
```

Replace it with your real HTTPS hostname everywhere.

## Choose Your Stack

| Scenario | Use | Start command |
| --- | --- | --- |
| Included Caddy reverse proxy | `docker-compose-reverse.yml` | `docker compose -f docker-compose-reverse.yml up -d --build` |
| Nginx Proxy Manager with SQLite storage | `docker-compose-npm.yml` | `docker compose -f docker-compose-npm.yml up -d --build` |
| Nginx Proxy Manager with MariaDB storage | `docker-compose-npm-advanced.yml` | `docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build` |

## Shared Setup

Create the private env files:

```bash
cp docker-compose-reverse.postgres.env.example docker-compose-reverse.postgres.env
cp docker-compose-reverse.backend.env.example docker-compose-reverse.backend.env
cp docker-compose-reverse.frontend.env.example docker-compose-reverse.frontend.env
```

Edit `docker-compose-reverse.postgres.env`:

```dotenv
POSTGRES_PASSWORD=replace-with-a-real-password
```

Edit `docker-compose-reverse.backend.env`:

```dotenv
NODE_ENV=production
DATABASE_URL=postgres://emitmachine:replace-with-a-real-password@postgres:5432/emitmachine
CORS_ORIGIN=https://domain.example.com
COOKIE_SECURE=true
RP_ID=domain.example.com
RP_ORIGIN=https://domain.example.com
TOTP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
LOG_LEVEL=info
LOG_FORMAT=json
```

Generate `TOTP_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Edit `docker-compose-reverse.frontend.env`:

```dotenv
VITE_ALLOWED_HOSTS=domain.example.com
```

## Option A: Caddy

Create the private Compose file and Caddyfile:

```bash
cp docker-compose-reverse.example.yml docker-compose-reverse.yml
cp caddy/config/Caddyfile.example caddy/config/Caddyfile
```

Edit `caddy/config/Caddyfile`:

```caddyfile
domain.example.com {
    tls /certs/cert.pem /certs/key.pem
    reverse_proxy frontend:5173
}
```

Place TLS certificates:

```text
caddy/certs/cert.pem
caddy/certs/key.pem
```

Start:

```bash
docker compose -f docker-compose-reverse.yml up -d --build
```

## Option B: Nginx Proxy Manager With SQLite

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

Change them immediately after first login.

Create a proxy host:

- Domain name: `domain.example.com`
- Forward hostname: `frontend`
- Forward port: `5173`
- Scheme: `http`
- Websockets support: enabled
- SSL: request or upload a certificate for `domain.example.com`

## Option C: Nginx Proxy Manager With MariaDB

Create the NPM MariaDB env file:

```bash
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

Edit `docker-compose-npm-advanced.env` and replace every password placeholder.

Start:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up -d --build
```

Then configure NPM exactly as in Option B.

## Post-Deploy Check

Run:

```bash
docker compose ps
docker compose logs --tail=100 backend
```

For non-default stacks, add the same `-f ...` and `--env-file ...` options used to start them.

Then verify:

- `https://domain.example.com` opens the app.
- Login or registration works.
- Passkey setup works over HTTPS.
- Backend logs do not show CORS, cookie, or database connection errors.
- A host-level PostgreSQL backup job is configured from [backups.md](backups.md).

## Do Not Commit

Do not commit private deployment files:

- `docker-compose-reverse.yml`
- `docker-compose-reverse.*.env`
- `docker-compose-npm-advanced.env`
- `caddy/config/Caddyfile`
- `caddy/certs/*.pem`
- `nginx-proxy-manager/`
- backup dumps or archives

Full details are in [deployment.md](deployment.md).
