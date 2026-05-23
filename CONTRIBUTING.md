# Contributing to emiTMachine

Thank you for your interest in contributing. Please read this guide before opening issues or submitting pull requests.

## Before you start

- Search [existing issues](../../issues) to avoid duplicates.
- For significant changes, open an issue first to discuss the approach before writing code.
- By contributing you agree that your work will be licensed under the same [Polyform Noncommercial License](./LICENSE) as the project.

## Development setup

**Requirements:** Docker, Docker Compose, Node.js 20+.

```bash
# Clone and start all services
git clone https://github.com/myblacksloth/emiTMachine
cd emiTMachine
docker compose up --build
```

The frontend runs at `http://localhost:5173` (proxy to the backend at port 4000).

### Running without Docker (backend only)

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL and other required vars
npm install
npm run dev
```

## Code style

- **Backend:** TypeScript strict mode, Zod for validation, no `any` unless unavoidable.
- **Frontend:** React 19, no external UI framework. Components stay in `App.tsx` unless clearly reusable.
- **CSS:** CSS custom properties defined in `:root`. Apple HIG–inspired design system.
- **SQL:** All schema changes go in `backend/db/init.sql`. No migration files for now.
- No comments unless the *why* is non-obvious. Self-documenting names are preferred.

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Make your changes with focused, atomic commits.
3. Update documentation in `doc/` if behavior changes.
4. Open a pull request using the provided template and describe *why* the change is needed.
5. PRs must pass CI checks before they are reviewed.

## Reporting security issues

Do **not** open public issues for security vulnerabilities. Send a private report via GitHub's [Security Advisories](../../security/advisories/new) feature.

## Questions

Open a [Discussion](../../discussions) rather than an issue for general questions or ideas.

---

## Keeping your fork up to date

Before starting new work or pulling a PR, make sure your local fork is synced with the original repository (`upstream`).

```bash
# 1. Add the original repository as a remote named 'upstream' (only needed once)
git remote add upstream [https://github.com/myblacksloth/emiTMachine](https://github.com/myblacksloth/emiTMachine)

# 2. Fetch the latest changes from upstream
git fetch upstream

# 3. Switch to your local main branch
git checkout main

# 4. Merge upstream/main into your local main branch
git merge upstream/main

# 5. Push the updated main branch to your GitHub fork (origin)
git push origin main


# ------------------------------------------

# if working with feature branch

git checkout your-feature-branch
git rebase main
```

<!-- 
`rebase` è generalmente preferibile in questi flussi di lavoro perché mantiene la cronologia dei commit lineare, il che si allinea perfettamente con la regola interna dei *"focused, atomic commits"*
-->
