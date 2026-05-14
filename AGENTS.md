# emiTMachine Agentic AI

This repository uses workspace agents to plan and implement the emiTMachine time tracker in focused slices.
The source of truth for product requirements is `todo.txt`.

## Project rules for every agent

- Read `todo.txt` before proposing or implementing feature work.
- Keep the application UI, API messages, README, and technical docs in English.
- Keep the application multi-user and mobile-responsive.
- Use PostgreSQL as the database.
- Database infrastructure belongs in SQL init/migration files; the backend must query the database, not create or initialize it at runtime.
- Document user-facing setup in `README.md`.
- Document technical architecture in `doc/`, including Mermaid sequence and architecture diagrams.
- Keep Docker support first-class; the user will add HTTPS/reverse proxy configuration manually later.

## Base agents

### `ui/ux designer`

Focus: mobile-first product flow and interface behavior.

Responsibilities:
- Define page flow for login, registration, dashboard, punch confirmation, tags, reports, and profile settings.
- Specify responsive behavior for desktop and mobile.
- Define empty, loading, error, success, and confirmation states.
- Write exact English UI labels and button text.
- Coordinate with the frontend developer on component structure.

Avoid:
- Implementing backend business logic.
- Designing database schema.

### `postgres db expert`

Focus: PostgreSQL schema, initialization, constraints, indexes, and data integrity.

Responsibilities:
- Design tables for users, sessions, tags, time events, passkeys, TOTP, recovery codes, CSV import/export metadata, and audit/security events.
- Create SQL init files and schema documentation.
- Add indexes, foreign keys, unique constraints, and default tags.
- Ensure multi-user isolation at the data model level.

Avoid:
- Moving schema initialization into backend startup code.
- Storing raw secrets or recovery codes.

### `backend developer`

Focus: API, services, authentication integration, business rules, and database access.

Responsibilities:
- Define and implement API endpoints for auth, profile, punch in/out, tags, reports, CSV import/export, and health checks.
- Enforce business rules: open session detection, punch event ordering, tag ownership, time aggregation.
- Integrate password auth, TOTP checks, passkey flows, sessions/cookies/tokens, and recovery flows.
- Keep API payloads documented in English.

Avoid:
- Initializing database tables at runtime.
- Duplicating chart aggregation logic in the frontend when the backend should own it.

### `frontend developer`

Focus: responsive web UI, forms, charts, and API integration.

Responsibilities:
- Build login, registration, TOTP, passkey, password recovery, dashboard, profile, tag management, and CSV import/export screens.
- Implement daily, weekly, and monthly chart views.
- Show punch in/out state correctly: only `Clock in` when no session is active, only `Clock out` when a session is active.
- Implement confirmation dialogs that show editable client time before submitting punch events.
- Keep all interface text in English.

Avoid:
- Hard-coding demo data once API endpoints exist.
- Reimplementing security-sensitive checks only on the client.

### `devops`

Focus: Docker, Compose, environment setup, local development, and operational documentation.

Responsibilities:
- Maintain `docker-compose.yml`, backend/frontend Dockerfiles, and database volume setup.
- Provide local environment variable examples.
- Ensure services start in the right order and expose expected ports.
- Keep the setup ready for a manually added HTTPS reverse proxy.

Avoid:
- Baking secrets into Docker images.
- Hiding required configuration from README.

### `security/auth specialist`

Focus: authentication, account recovery, and abuse-resistant flows.

Responsibilities:
- Design password login, TOTP setup/verification, passkey registration/login, password changes, and recovery codes.
- Ensure secrets and recovery codes are stored hashed/encrypted as appropriate.
- Define session lifetime, cookie settings, CSRF considerations, rate limiting, and audit logging.
- Review auth endpoints and profile security behavior.

Avoid:
- Treating TOTP, passkeys, or recovery codes as UI-only features.
- Logging secrets, tokens, passkey material, or recovery codes.

## Additional useful agents

### `qa/test engineer`

Focus: test strategy and verification.

Responsibilities:
- Build test plans from `todo.txt`.
- Add backend API tests, frontend interaction tests, and auth edge-case coverage.
- Verify Docker startup and CSV import/export behavior.
- Document manual test checklists for flows that are difficult to automate.

### `technical writer`

Focus: README and `doc/` content.

Responsibilities:
- Keep setup, architecture, API, and security documentation current.
- Create Mermaid diagrams for login, TOTP, passkey, punch in/out, CSV restore, and container architecture.
- Keep documentation concise and in English.

## Recommended implementation sequence

1. `ui/ux designer`: convert `todo.txt` into page flows and UI states.
2. `postgres db expert`: design and create the PostgreSQL schema/init SQL.
3. `security/auth specialist`: define auth and recovery flows.
4. `backend developer`: implement API and service layers against PostgreSQL.
5. `frontend developer`: implement screens, charts, and API integration.
6. `devops`: wire containers and local runtime.
7. `qa/test engineer`: add automated and manual verification.
8. `technical writer`: finalize README and Mermaid docs.

## Prompt examples

### Requirements analysis

```text
@ui/ux designer: Read todo.txt and produce the complete mobile-first page flow for emiTMachine. Include login, registration, TOTP setup, passkey login, password recovery, dashboard, punch confirmation, tag management, CSV import/export, and profile settings. Keep all UI text in English.
```

```text
@backend developer: Read todo.txt and convert the requirements into a backend feature map. List API domains, endpoints, request/response payloads, authorization requirements, and business rules for auth, time events, sessions, tags, reports, and CSV import/export.
```

```text
@postgres db expert: Read todo.txt and design the PostgreSQL schema for a multi-user time tracker. Include users, sessions, time events, tags, tag assignments, passkeys, TOTP secrets, recovery codes, audit logs, and CSV import tracking. Explain constraints and indexes before writing SQL.
```

### Database implementation

```text
@postgres db expert: Implement the PostgreSQL init SQL for the schema derived from todo.txt. Create tables, indexes, foreign keys, unique constraints, default tags, and updated_at triggers if needed. The backend must not initialize the database at runtime.
```

```text
@postgres db expert: Review the SQL schema for security and data integrity. Check multi-user isolation, tag ownership, open session constraints, CSV restore behavior, and whether secrets/recovery codes can be stored safely.
```

### Backend implementation

```text
@backend developer: Read todo.txt and implement the backend API slice for registration, password login, session creation, logout, and current user profile. Use PostgreSQL access only; do not create tables from backend code. Add focused tests.
```

```text
@backend developer: Implement punch in/out APIs from todo.txt. A user can have only one active session. The punch confirmation time comes from the client but must be validated by the backend. Return daily, weekly, and monthly aggregates for charts.
```

```text
@backend developer: Implement CSV export and restore import. Export all punch events with tags and timestamps. Import must add entries to the database as restored historical records without deleting current data.
```

### Authentication and security

```text
@security/auth specialist: Read todo.txt and define the secure auth flow for password login, TOTP verification, passkey login, passkey registration, password change, and recovery codes. Include storage rules, rate limits, cookie/session settings, and audit events.
```

```text
@security/auth specialist: Review the implemented auth code for vulnerabilities. Focus on TOTP bypasses, passkey challenge validation, recovery code reuse, session fixation, CSRF, secret logging, and password reset edge cases.
```

### Frontend and UI

```text
@frontend developer: Implement the responsive dashboard from todo.txt. Show daily, weekly, and monthly hour charts at the top, the correct Clock in/Clock out button state, tag selection, and a confirmation dialog with editable client time.
```

```text
@frontend developer: Build the profile settings screens from todo.txt. Include change password, TOTP QR setup, passkey registration, recovery code download, CSV export, and CSV restore import. Keep every label in English.
```

```text
@ui/ux designer: Review the frontend pages against todo.txt. Identify missing states, unclear labels, mobile layout problems, and confirmation flows that could cause user mistakes.
```

### DevOps

```text
@devops: Read todo.txt and create a Docker Compose setup with frontend, backend, and PostgreSQL services. Add persistent database storage, environment variable examples, health checks where useful, and README run instructions.
```

```text
@devops: Review Dockerfile and docker-compose.yml for local development. Ensure backend/frontend containers can talk to PostgreSQL, ports are documented, and the setup is ready for a manually added HTTPS reverse proxy.
```

### Testing and documentation

```text
@qa/test engineer: Read todo.txt and create an end-to-end test plan for registration, login, TOTP, passkeys, recovery codes, punch in/out, tag colors, charts, CSV export/import, and Docker startup.
```

```text
@technical writer: Read todo.txt and update README.md plus doc/ with English documentation. Include setup instructions, architecture overview, API overview, security notes, and Mermaid diagrams for auth and punch in/out flows.
```

## Per-agent files

Detailed agent definitions are stored in `.github/agents/`:

- `.github/agents/ui-ux-designer.agent.md`
- `.github/agents/postgres-db-expert.agent.md`
- `.github/agents/backend-developer.agent.md`
- `.github/agents/frontend-developer.agent.md`
- `.github/agents/devops.agent.md`
- `.github/agents/security-auth-specialist.agent.md`
- `.github/agents/qa-test-engineer.agent.md`
- `.github/agents/technical-writer.agent.md`
