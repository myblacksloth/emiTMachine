# emiTMachine

emiTMachine is a multi-user time tracking webapp.

## Agentic workflow

This repository includes workspace agents for planning and implementing the project from `todo.txt`.

- Main coordination file: `AGENTS.md`
- Per-agent definitions: `.github/agents/`
- Technical workflow notes: `doc/agentic-ai.md`

Start with prompts such as:

```text
@ui/ux designer: Read todo.txt and propose the complete mobile-first page flow for emiTMachine.
```

```text
@backend developer: Read todo.txt and list the required API endpoints, payloads, authorization requirements, and business rules.
```

```text
@postgres db expert: Read todo.txt and design the PostgreSQL schema and init SQL for the application.
```
