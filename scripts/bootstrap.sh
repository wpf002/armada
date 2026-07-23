#!/usr/bin/env bash
#
# Armada bootstrap — documents the Phase 0 monorepo layout and brings a fresh
# clone to a green gate. The scaffold is committed to the repo; this script is
# the reproducible "from zero" path and the local-dev on-ramp.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Armada monorepo layout"
cat <<'LAYOUT'
apps/web         Next.js web app + PWA
apps/api         Fastify API (Zod at every boundary)
apps/worker      node-cron worker (Fillout reconcile)
packages/db      Prisma schema + client + seed
packages/shared  Zod schemas, shared types, permission function
packages/ui      Design tokens + primitives
packages/fillout Fillout client + versioned field map
LAYOUT

echo "==> Ensuring .env exists"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    created .env from .env.example (edit secrets before running services)"
fi

echo "==> Installing dependencies (pnpm)"
pnpm install

echo "==> Generating Prisma client"
pnpm --filter @armada/db generate

echo "==> Building"
pnpm build

echo "==> Lint + typecheck"
pnpm lint
pnpm typecheck

cat <<'DONE'

==> Bootstrap complete.

Next:
  docker compose up -d        # local Postgres
  pnpm --filter @armada/db migrate   # (Phase 1) apply migrations
  pnpm dev                    # run web + api + worker
DONE
