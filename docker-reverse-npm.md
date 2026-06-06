

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

# Advanced NPM stack with MariaDB

Use `docker-compose-npm-advanced.yml` if you want Nginx Proxy Manager to store
its own data in a dedicated MariaDB database instead of SQLite.

Create the private NPM database environment file:

```bash
cp docker-compose-npm-advanced.env.example docker-compose-npm-advanced.env
```

Edit `docker-compose-npm-advanced.env` and replace every password placeholder.
This database is only for Nginx Proxy Manager. emiTMachine still uses the
separate PostgreSQL service.

Do not run the SQLite and MariaDB NPM stacks at the same time because both bind
ports `80`, `443`, and `81`.

Start the advanced stack:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env up --build
```

Stop it:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env down
```

To remove both NPM MariaDB data and emiTMachine PostgreSQL data:

```bash
docker compose -f docker-compose-npm-advanced.yml --env-file docker-compose-npm-advanced.env down -v
```
