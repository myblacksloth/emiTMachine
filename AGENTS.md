# emiTMachine Agentic AI

This repository includes a set of workspace agents for implementing the emiTMachine time tracker.
They are intended to help you build the webapp in a structured way, using Copilot-style agent workflows.

## Base agents

- `ui/ux designer`: mobile-first UI and UX design for login, dashboard, time punches, tags and charts.
- `postgres db expert`: PostgreSQL schema, migrations, security, and database initialization scripts.
- `backend developer`: API design, authentication server, business logic, data access.
- `frontend developer`: frontend implementation, responsive views, charts, forms.
- `devops`: Docker Compose, container configuration, local development environment.
- `security/auth specialist`: TOTP, passkeys, recovery flows, secure account management.

## How to use

1. Reference the `todo.txt` file for requirements.
2. Ask a specific agent to analyze and implement a slice of work.
3. Use the example prompts below to start tasks.

## Example prompts

### Read and analyze requirements

- `@ui/ux designer: Read todo.txt and propose a complete page flow for login, registration, user profile, and time tracking dashboard. Include mobile-first behavior and key UX states.`
- `@backend developer: Read todo.txt and list the API endpoints needed for login, registration, TOTP, passkeys, and time entry management.`
- `@postgres db expert: Read todo.txt and design a PostgreSQL schema with tables for users, sessions, tags, time_entries, passkeys, TOTP and recovery codes.`

### Implement database and backend

- `@postgres db expert: Generate an init SQL file for PostgreSQL that creates the required tables, indexes, unique constraints, and default tags. The backend must only call the database and not initialize it.`
- `@backend developer: Create a backend architecture plan using Node.js/TypeScript that supports authentication, session punch in/out, tag management, and reporting.`
- `@security/auth specialist: Define the authentication flow for password login, TOTP verification, passkey registration/login, and password recovery via recovery codes.`

### Build frontend and UI

- `@frontend developer: Create the React/Next UI components and page structure for the time tracker dashboard, including daily/weekly/monthly hour charts and punch in/out controls.`
- `@ui/ux designer: Propose the exact layout and text labels in English for the login page, dashboard, confirmation popups, and profile settings.`

### DevOps and deployment

- `@devops: Review the current Docker Compose setup and suggest a complete local development stack with Postgres and backend/frontend services.`
- `@devops: Create a Docker Compose file and Dockerfile entries that launch the backend, frontend, and PostgreSQL with persistent storage.`

## Notes

- Keep the application language in English, even when requirements are written in Italian.
- Document the application in `README.md` and create technical architecture diagrams in `doc/` using Mermaid.
- Ensure the project is multi-user and mobile-responsive.
