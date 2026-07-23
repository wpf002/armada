# Armada

Discipleship relationship management for **Armada Discipleship** (Dallas, TX).

Armada is not a church directory and not a CRM. It is a **relationship graph with time** —
one `Person` row per human, and every role (leader, disciple, mentor) is an *edge*, not a
person type. Every question the org needs answered ("who's leading a group?", "who wants to be
discipled?", "who's falling through the cracks?") is a graph traversal.

See [`CLAUDE.md`](./CLAUDE.md) for the locked invariants that govern the whole build.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm + Turborepo |
| Web | Next.js (App Router), Tailwind, mobile-first PWA |
| API | Fastify, Zod at every boundary |
| DB | Postgres + Prisma |
| Auth | Better Auth (email/password, reset, sessions) |
| Jobs | node-cron worker (nightly Fillout reconcile) |
| Host | Railway |

## Project structure

```
apps/
  web/        Next.js web app + PWA
  api/        Fastify API
  worker/     node-cron worker (Fillout reconcile)
packages/
  db/         Prisma schema + client + seed
  shared/     Zod schemas, shared types, permission function
  ui/         Design tokens + primitives (brand pulled from armadadiscipleship.org)
  fillout/    Fillout API client + versioned field map
```

## Local setup

Prerequisites: Node ≥ 20, pnpm 9, Docker (for local Postgres).

```bash
cp .env.example .env         # fill in secrets
pnpm install
docker compose up -d         # local Postgres on :5432
pnpm --filter @armada/db generate
pnpm build
pnpm dev                     # web :3000 · api :4000 · worker
```

Or run the one-shot bootstrap:

```bash
./scripts/bootstrap.sh
```

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Key ones:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Auth (Phase 1) |
| `FILLOUT_API_KEY` / `FILLOUT_FORM_ID` / `FILLOUT_WEBHOOK_SECRET` | Registration intake (Phase 5) |
| `RECONCILE_CRON` | Nightly reconcile schedule |

## Scripts

| Command | Does |
|---|---|
| `pnpm build` | Build all apps + packages (Turborepo) |
| `pnpm dev` | Run web + api + worker in watch mode |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:migrate` | Apply Prisma migrations (Phase 1+) |

## Deploy

Railway, one service per app (`web`, `api`, `worker`) plus a managed Postgres. Set the env vars
above per service. Production migrations run via `pnpm --filter @armada/db migrate:deploy`.

## Build status

- **Phase 0 ✅** — monorepo scaffold, config, brand tokens, derived group-name helper.
- **Phase 1 ✅** — full Prisma schema (§5) + migration with partial unique indexes and the
  `mentor_not_mentee` CHECK; Better Auth (email/password, sessions, reset) with a Person-linking
  hook so every User maps to one Person; Fastify role-guard middleware; the `visibleFieldsFor` /
  `can` permission model in `packages/shared` with 27 tests covering every §6 matrix cell.
  Verified: admin logs in and reaches `/admin/ping`; a member gets 403.
- **Phase 2 (import + identity resolution)** is next.

### First admin

```bash
pnpm --filter @armada/api create:admin -- you@example.com 'a-strong-password' 'Your Name'
```

### Demo data

```bash
SEED_DEMO=1 pnpm --filter @armada/db seed
```
