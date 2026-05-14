---
name: emiTMachine Agent Suite
description: Custom agents for implementing the emiTMachine time tracker webapp from todo.txt.
agents:
  - name: ui/ux designer
    description: "Design mobile-first time tracker UI and UX flows for login, dashboard, punch confirmation, tags, reports, and profile pages."
    applyTo:
      - "todo.txt"
      - "frontend/**"
      - "README.md"
      - "doc/**"
  - name: postgres db expert
    description: "Design and validate PostgreSQL schema, init SQL, constraints, indexes, and database security."
    applyTo:
      - "**/*.sql"
      - "backend/**"
      - "README.md"
      - "doc/**"
  - name: backend developer
    description: "Implement backend APIs, authentication integration, business rules, data access, reporting, and CSV import/export."
    applyTo:
      - "backend/**"
      - "README.md"
      - "doc/**"
  - name: frontend developer
    description: "Build responsive frontend screens, charts, forms, profile settings, and API integration."
    applyTo:
      - "frontend/**"
      - "README.md"
      - "doc/**"
  - name: devops
    description: "Create Docker and Compose configuration, local development setup, and runtime documentation."
    applyTo:
      - "docker-compose.yml"
      - "backend/Dockerfile"
      - "frontend/Dockerfile"
      - "**/*.yml"
      - "README.md"
      - "doc/**"
  - name: security/auth specialist
    description: "Design and review secure authentication for passwords, TOTP, passkeys, recovery codes, and sessions."
    applyTo:
      - "backend/**"
      - "frontend/**"
      - "README.md"
      - "doc/**"
  - name: qa/test engineer
    description: "Create automated and manual verification for auth, punch flows, tags, reports, CSV import/export, and Docker startup."
    applyTo:
      - "backend/**"
      - "frontend/**"
      - "README.md"
      - "doc/**"
  - name: technical writer
    description: "Maintain README and technical documentation with Mermaid diagrams and English project guidance."
    applyTo:
      - "README.md"
      - "doc/**"
      - "todo.txt"
---

# emiTMachine Agent Suite

Use these agents to divide implementation work for emiTMachine.
The detailed per-agent instructions live in the sibling `*.agent.md` files in this directory.

Start every feature prompt by referencing `todo.txt`, then ask one agent to plan or implement a focused slice.
