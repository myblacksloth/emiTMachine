# Agentic AI for emiTMachine

This document describes the agent-based workflow for the emiTMachine webapp project.
Use the base agents to divide work and keep implementation aligned with the requirements in `todo.txt`.

## Suggested agent workflow

1. `@ui/ux designer`
   - Read `todo.txt`
   - Propose page structure, navigation, and responsive behavior
   - Define the English text for pages, buttons, and labels

2. `@postgres db expert`
   - Design the PostgreSQL schema and init SQL
   - Add default tags and columns for authentication metadata
   - Ensure the backend only queries the DB without initializing it

3. `@backend developer`
   - Create API endpoints and service layers
   - Handle authentication, session punch in/out, tags, and reporting
   - Keep business rules in the backend, with data persistence in Postgres

4. `@frontend developer`
   - Build the responsive frontend components and dashboard
   - Display daily, weekly, monthly charts and punch state
   - Add forms for login, registration, TOTP setup, passkeys, and recovery

5. `@devops`
   - Configure Docker Compose and container services
   - Ensure the app runs locally with PostgreSQL
   - Prepare the environment for adding a reverse proxy and HTTPS later

6. `@security/auth specialist`
   - Validate authentication flows and account recovery logic
   - Design secure TOTP, passkey, and recovery code handling
   - Consider UX details for multi-factor flows

## Prompt examples for `todo.txt`

### General analysis prompt

`@backend developer: Read todo.txt and summarize the full feature set in English, including authentication flows, time entry behavior, reporting charts, tags, and the mobile-first requirement.`

### Database prompt

`@postgres db expert: Based on todo.txt, generate a PostgreSQL init script that creates tables for users, tags, time_entries, passkeys, totp_secret, recovery_codes, and audit logs. Include indexes and any necessary constraints. Do not include backend schema migration logic.`

### Backend prompt

`@backend developer: Read todo.txt and create a list of backend endpoints, HTTP methods, request/response payloads, and authorization requirements for login, registration, TOTP, passkeys, password recovery, punch in/out, tags, and reporting data.`

### Frontend prompt

`@frontend developer: Using todo.txt, design the dashboard page layout and component list for daily/weekly/monthly charts, punch in/out button states, tag color display, and profile management. Keep all interface text in English.`

### UI/UX prompt

`@ui/ux designer: Read todo.txt and produce a mobile-first UX flow for the entire application, including login, registration, TOTP setup, passkey login, profile settings, and time tracking dashboard.`

### DevOps prompt

`@devops: Read todo.txt and create a Docker Compose architecture for the webapp with a backend container, frontend container, and PostgreSQL database. Include volume mounting for DB persistence and environment variable examples.`

### Security prompt

`@security/auth specialist: From todo.txt, define the secure authentication and recovery flows for email/password login, TOTP, passkey registration/login, password change, and recovery code generation. Include what the app should do when TOTP is enabled or disabled.
`

## Practical usage tips

- Always reference `todo.txt` in the prompt so the agent uses the correct requirements.
- Ask agents to generate a plan first, then implement code in smaller slices.
- Use the `doc/` folder to store generated architecture diagrams and technical notes.
- Keep the README in English and include setup, running, and architecture sections.
