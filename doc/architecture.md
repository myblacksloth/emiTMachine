# emiTMachine Architecture

## Container View

```mermaid
flowchart LR
    Browser[Browser] --> Frontend[Vite React frontend]
    Frontend --> Backend[Express API]
    Backend --> Postgres[(PostgreSQL)]
    Postgres --> Init[backend/db/init.sql]
```

## Logging

The Docker Compose stack writes service logs to stdout and stderr so Docker, a reverse proxy, or a host logging driver can collect them without extra files or sidecars.

Backend logging is configured through environment variables on the `backend` service:

- `LOG_LEVEL`: minimum emitted severity. Recommended values are `debug`, `info`, `warn`, and `error`.
- `LOG_FORMAT`: emitted log shape. Use `pretty` for local development and `json` for structured collection.

Every backend request should have a request id. If an upstream proxy or client sends `X-Request-Id`, the backend should keep that value and include it in request logs and the response header. If no request id is supplied, the backend should generate one and return it as `X-Request-Id`. This makes a single request traceable across browser developer tools, proxy access logs, backend logs, and error reports.

```mermaid
sequenceDiagram
    participant C as Client
    participant P as Reverse proxy
    participant B as Backend
    participant L as Docker logs
    C->>P: HTTP request with X-Request-Id
    P->>B: Forward request id
    B->>L: Log method, path, status, duration, request id
    B-->>P: Response with X-Request-Id
    P-->>C: Response with same request id
```

## Login With TOTP

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant D as PostgreSQL
    U->>F: Submit username and password
    F->>B: POST /api/auth/login
    B->>D: Load user and TOTP state
    alt TOTP disabled
        B-->>F: Session cookie and user
    else TOTP enabled
        B-->>F: TOTP required
        U->>F: Submit TOTP code
        F->>B: POST /api/auth/login with code
        B-->>F: Session cookie and user
    end
```

## Punch In And Out

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant D as PostgreSQL
    U->>F: Click Clock in or Clock out
    F->>U: Show editable client time confirmation
    U->>F: Confirm
    F->>B: POST /api/punch/clock-in or /api/punch/clock-out
    B->>D: Validate active session and persist event
    B-->>F: Updated session state
    F->>B: GET /api/dashboard
    B-->>F: Reports and active session
```

## CSV Restore

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant D as PostgreSQL
    U->>F: Select previous CSV export
    F->>B: POST /api/import.csv
    B->>D: Create csv_import row
    loop CSV clock_in rows
        B->>D: Append restored session, events, and tags
    end
    B-->>F: Import summary
```
