# Reverse Proxy Docker Setup

This guide explains how to run emiTMachine behind the included Caddy reverse proxy.

## Files

- `docker-compose-reverse.example.yml`: public placeholder compose file.
- `docker-compose-reverse.yml`: private local compose file, ignored by Git.
- `caddy/config/Caddyfile.example`: public placeholder Caddy config.
- `caddy/config/Caddyfile`: private local Caddy config, ignored by Git.
- `caddy/certs/*.pem`: private TLS certificates, ignored by Git.

## 1. Create Private Files

Copy the placeholders:

```bash
cp docker-compose-reverse.example.yml docker-compose-reverse.yml
cp caddy/config/Caddyfile.example caddy/config/Caddyfile
```

Edit `caddy/config/Caddyfile` and replace:

```caddyfile
your.domain.com
```

with your real public domain.

Example:

```caddyfile
example.yourdomain.com {
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

## 3. Set Required Variables

The reverse compose uses environment variables so real values do not need to be committed.

Required:

```bash
export PUBLIC_DOMAIN=your.domain.com
export POSTGRES_PASSWORD=change-this-password
export TOTP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
```

Optional:

```bash
export LOG_LEVEL=info
export LOG_FORMAT=json
```

For passkeys, `PUBLIC_DOMAIN` must match the HTTPS domain opened in the browser.

## 4. Start The Stack

Run:

```bash
docker compose -f docker-compose-reverse.yml up -d --build
```

The app should be reachable at:

```text
https://your.domain.com
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
- Passkeys fail: verify that `PUBLIC_DOMAIN`, `RP_ID`, `RP_ORIGIN`, and the browser URL use the same HTTPS domain.
- Browser cannot reach the app: verify DNS, router port forwarding, firewall rules, and that Caddy is listening on ports `80` and `443`.
- Backend CORS/session errors: verify `CORS_ORIGIN=https://your.domain.com` and `COOKIE_SECURE=true`.
