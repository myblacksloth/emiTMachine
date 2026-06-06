

```bash
docker compose -f docker-compose-npm.yml up --build
docker compose -f docker-compose-npm.yml down -v
```

Nginx Proxy Manager stores its own admin UI data in `./nginx-proxy-manager/data`.
This stack uses the NPM SQLite database at `/data/database.sqlite`; the
application database is the separate `postgres` service.

If NPM logs this error:

```text
getaddrinfo ENOTFOUND db
```

then an existing NPM data directory was likely created with a MySQL/MariaDB host
named `db`. Stop the stack and remove only the NPM data directory to let it
recreate the SQLite config:

```bash
docker compose -f docker-compose-npm.yml down
rm -rf nginx-proxy-manager/data
docker compose -f docker-compose-npm.yml up --build
```

# Default admin user

```
admin@example.com
changeme
```

