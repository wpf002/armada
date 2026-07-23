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

## Status

**All 9 phases complete.** The app runs end-to-end locally (see setup above): sign in, browse
the 165-person directory, view the radial hierarchy, work the discipleship pipeline, manage
events, and administer users — all against the real imported workbook data. Ship steps live in
[`DEPLOY.md`](./DEPLOY.md).

## Build status

- **Phase 0 ✅** — monorepo scaffold, config, brand tokens, derived group-name helper.
- **Phase 1 ✅** — full Prisma schema (§5) + migration with partial unique indexes and the
  `mentor_not_mentee` CHECK; Better Auth (email/password, sessions, reset) with a Person-linking
  hook so every User maps to one Person; Fastify role-guard middleware; the `visibleFieldsFor` /
  `can` permission model in `packages/shared` with 27 tests covering every §6 matrix cell.
  Verified: admin logs in and reaches `/admin/ping`; a member gets 403.
- **Phase 2 ✅** — xlsx importer (`pnpm --filter @armada/db import:xlsx`) reads all five sheets,
  drops the dead Pods column, resolves identities (§8: email/phone/exact-name auto-link, curated
  aliases for the 8 confirmed collisions, fuzzy + nickname → review), and writes the graph
  (people, memberships, mentor edges, interests, prayer notes). Produces a
  created/matched/needs-review/conflicts report. Verified against the real workbook: 162 people,
  34 groups, 109 memberships, 52 mentor edges; **idempotent** (second run changes nothing);
  the 8 collisions merged, uncertain pairs + orphaned mentees + placeholders parked in the review
  list. Merge endpoint `POST /admin/people/:id/merge` reassigns all edges, tombstones the source,
  and audit-logs. 10 resolution unit tests.
- **Phase 3 ✅** — People API with **server-side field visibility**: `/people` (directory index),
  `/people/:id` (scoped via `visibleFieldsFor` over live graph edges), `PATCH /people/:id`
  (self/admin edit), `POST /people/:id/photo` (upload). Mobile-first PWA: login, home, directory
  with **instant client-side search**, profile pages with `tel:`/`mailto:`/maps deep links,
  self-edit + photo, bottom tab bar. Verified by a role smoke test (member/leader/admin each see
  exactly the §6 fields — 7/7) and in the browser against the real 165-person import.
- **Phase 4 ✅** — Group CRUD, membership management (ends via `leftAt`, never deletes), leader
  assignment, and mentor management, all admin/leader-scoped through `can()`. The signature
  **radial d3-force hierarchy** (`/groups`): anchor center, leader ring, disciple satellites,
  optional mentor ring, open-capacity affordance on zero-disciple leaders; **accordion fallback
  below 768px** — one data source, two presentations. Disciples see only their own group + leader;
  leaders/mentors/admins see the whole org. Verified in-browser against the real 34-group import
  (derived co-leader names, mentor tier, dual-role people).
- **Phase 5 ✅** — Fillout intake. `POST /webhooks/fillout` (shared-secret, idempotent on
  `filloutSubmissionId`) → shared ingest pipeline (`apps/api/src/intake.ts`): parse by field-map,
  §8 match (auto-link ≥0.95 / NEEDS_REVIEW / new PROSPECT), enrich NULLs only (invariant #4),
  prayer request → private Note, `WANTS_TO_LEAD` heuristic, auto FollowUp. Admin intake queue
  (link / create / ignore). Nightly reconcile + weekly metadata-drift run in `apps/worker` via
  secret-guarded internal endpoints; `register-webhook.ts` for deploy. Verified locally with
  simulated webhooks across all three bands; replaying a webhook creates nothing new.
- **Phase 6 ✅** — Pipeline + follow-up. The four §1 questions are one tap from home:
  `/leaders` (who leads), `/groups` (who's in whose group), `/mentors` (who mentors leaders),
  `/pipeline` (who wants discipling — an Open→In progress→Placed board). Follow-ups replace the
  Reach Out column (owner + status + outcome). Role-aware `/dashboard`: leaders see their groups,
  mentees, and open follow-ups; admins also see the actionable gaps (wants-discipling,
  open-capacity leaders, unassigned people, groups without a mentor, stale follow-ups). Verified
  against real data: 48 leaders, 12 mentors, 9 want discipling, 64 unassigned.
- **Phase 7 ✅** — Events calendar. Event CRUD (admin), RSVP, visibility scoping
  (ALL / LEADERS_ONLY / ADMINS_ONLY), Armada Night recurrence (last Monday monthly at Communion
  Coffee, 514 Lockwood Dr). Per-user **`.ics` subscription feed** signed with an HMAC token (no
  session — a calendar app polls it) plus single-event downloads. Verified: an admin's LEADERS_ONLY
  event appears in a leader's subscription feed (7 events) but is correctly absent from a member's
  feed (6 events).
- **Phase 8 ✅** — Admin surface: user list + role assignment (guards the last admin), invite flow
  (temp password), audit-log viewer (every write is recorded — verified), bulk status/archive
  (soft, no hard deletes), and a **permission-aware CSV export** that runs each row through
  `visibleFieldsFor` so columns are masked by the requester's scope. Verified: admin exports 167
  rows with full columns; a member gets 403.
- **Phase 9 ✅ (ship-ready)** — Installable **PWA** with a service worker that caches the app
  shell and serves the directory offline; API centralized error handling + graceful `SIGTERM`
  shutdown (verified); web error boundary. Deploy is documented end-to-end in
  [`DEPLOY.md`](./DEPLOY.md) (three Railway services + Postgres, migrations on deploy, webhook
  registration, workbook import). Ops scripts: `scripts/backup.sh` (pg_dump + retention),
  `scripts/onboard-admins.sh` (the four leadership admins). **The actual Railway deploy runs in
  your account** — everything it needs is in `DEPLOY.md`.

### Verify field visibility by role

```bash
pnpm --filter @armada/api exec tsx src/scripts/verify-visibility.ts
```

### Import the workbook

```bash
pnpm --filter @armada/db import:xlsx -- "~/Downloads/Armada Leaders Info.xlsx" --fresh
```

### First admin

```bash
pnpm --filter @armada/api create:admin -- you@example.com 'a-strong-password' 'Your Name'
```

### Demo data

```bash
SEED_DEMO=1 pnpm --filter @armada/db seed
```
