**Read the playbook first:** `../foundryRB/rb-playbook/AI-PLAYBOOK.md`. It tells you everything you need.

## Project orientation

- `docs/spec-v1.md` is the V1 source of truth; scope changes need the owner's approval.
- `docs/assumptions.md` records every choice the spec left open, with where to change it in code.
- Monorepo: `apps/web` (Next.js), `services/api` (HTTP API and composition root), `packages/*` (domain, pricing, ranking, engines, provider adapters).
- `pnpm test` and `pnpm typecheck` must pass before a commit.
