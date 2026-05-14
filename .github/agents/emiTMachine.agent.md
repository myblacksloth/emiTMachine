---
name: emiTMachine Agent Suite
description: Custom agents for the emiTMachine time tracker webapp. Use these agents to implement UI, backend, database, DevOps, and authentication features from todo.txt.
agents:
  - name: ui/ux designer
    description: "Design modern, mobile-first time tracker UI and UX flows for login, dashboard, time punch, and profile pages."
    applyTo:
      - "**/*.md"
      - "**/*.tsx"
      - "**/*.ts"
      - "**/*.css"
      - "**/*.scss"
      - "**/*.html"
  - name: postgres db expert
    description: "Design and validate PostgreSQL schema, migration scripts, indexes, and security for multi-user time tracking."
    applyTo:
      - "**/*.sql"
      - "**/*.ts"
      - "**/*.js"
      - "README.md"
      - "doc/**"
  - name: backend developer
    description: "Implement backend services, REST/GraphQL APIs, authentication, session tracking, and database integration."
    applyTo:
      - "emiTMachine/src/**"
      - "**/*.ts"
      - "**/*.js"
      - "README.md"
      - "doc/**"
  - name: frontend developer
    description: "Build the frontend application, responsive components, charts, forms, and mobile-friendly interactions."
    applyTo:
      - "emiTMachine/src/**"
      - "**/*.tsx"
      - "**/*.ts"
      - "**/*.css"
      - "**/*.scss"
      - "README.md"
      - "doc/**"
  - name: devops
    description: "Create Docker and Compose configurations, local development setup, and container orchestration for the webapp."
    applyTo:
      - "docker-compose.yml"
      - "emiTMachine/Dockerfile"
      - "**/*.yml"
      - "README.md"
      - "doc/**"
  - name: security/auth specialist
    description: "Design secure authentication flows for login, TOTP, passkeys, recovery codes, and account management."
    applyTo:
      - "**/*.ts"
      - "**/*.js"
      - "README.md"
      - "doc/**"
---

# emiTMachine Agent Suite

This file defines workspace agents for the emiTMachine project.
Use direct agent addressing in Copilot chat, for example: `@ui/ux designer`, `@backend developer`, or `@postgres db expert`.
