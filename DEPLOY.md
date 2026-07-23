# Deploying Armada (Railway)

Three services + one database, all from this monorepo. Railway builds with Nixpacks;
each service sets its own **build** and **start** command and shares the repo.

## 1. Database

Add a **PostgreSQL** plugin. Railway sets `DATABASE_URL`. Reference it from each service.
Enable automated backups in the plugin settings (see also `scripts/backup.sh`).

## 2. Services

| Service | Build command | Start command |
|---|---|---|
| **api** | `pnpm install --frozen-lockfile && pnpm --filter @armada/db build && pnpm --filter @armada/api build` | `pnpm --filter @armada/db migrate:deploy && node apps/api/dist/index.js` |
| **web** | `pnpm install --frozen-lockfile && pnpm --filter @armada/db build && pnpm --filter @armada/web build` | `pnpm --filter @armada/web start` |
| **worker** | `pnpm install --frozen-lockfile && pnpm --filter @armada/db build && pnpm --filter @armada/worker build` | `node apps/worker/dist/index.js` |

The `api` start runs `prisma migrate deploy` first, so migrations apply on every deploy.

## 3. Environment variables

Shared: `DATABASE_URL` (from the plugin), `BETTER_AUTH_SECRET` (`openssl rand -base64 32`).

**api**: `API_PORT` (Railway sets `PORT` — map it), `API_HOST=0.0.0.0`, `WEB_ORIGIN=https://<web-domain>`,
`BETTER_AUTH_URL=https://<api-domain>`, `NEXT_PUBLIC_API_URL=https://<api-domain>`,
`FILLOUT_API_KEY`, `FILLOUT_WEBHOOK_SECRET`, `UPLOAD_DIR` (mount a volume for photos), `SENTRY_DSN` (optional).

**web**: `NEXT_PUBLIC_API_URL=https://<api-domain>`.

**worker**: `API_INTERNAL_URL=https://<api-domain>`, `FILLOUT_WEBHOOK_SECRET` (same as api),
`RECONCILE_CRON`, `DRIFT_CRON`.

## 4. After first deploy

1. **Register the Fillout webhook** (once):
   ```bash
   FILLOUT_API_KEY=… FILLOUT_WEBHOOK_SECRET=… \
     pnpm --filter @armada/api exec tsx src/scripts/register-webhook.ts https://<api-domain>
   ```
2. **Import the workbook** (once, against production):
   ```bash
   DATABASE_URL=… pnpm --filter @armada/db import:xlsx -- "Armada Leaders Info.xlsx"
   ```
   Resolve the review list in `packages/db/import-report.json` with the Armada team.
3. **Onboard the first admins** (Kyle Sullivan, Zack Plunkett, Dillon Everett, Chase Clement):
   ```bash
   ./scripts/onboard-admins.sh   # or run create:admin per person (see the script)
   ```
4. **Generate Armada Nights**: sign in as an admin and POST `/events/armada-night/generate`.

## 5. Health & rollback

- Health check path: `GET /health` on the api service.
- The api shuts down gracefully on `SIGTERM`, so Railway rolling deploys don't drop requests.
- Roll back from the Railway deployments list; migrations are additive — review before reverting schema.

## 6. Backups

Railway's managed Postgres backups plus, optionally, a scheduled `scripts/backup.sh` to off-box storage.
