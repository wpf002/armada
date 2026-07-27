# Deploying Armada (Railway)

Three services + one database, all from this monorepo. Railway builds with Nixpacks;
each service sets its own **build** and **start** command and shares the repo.

## 1. Database

Add a **PostgreSQL** plugin. Railway sets `DATABASE_URL`. Reference it from each service.
Enable automated backups in the plugin settings (see also `scripts/backup.sh`).

## 2. Services

| Service | Build command | Start command |
|---|---|---|
| **api** | `pnpm install --frozen-lockfile && pnpm turbo run build --filter=@armada/api` | `pnpm --filter @armada/db migrate:deploy && node apps/api/dist/index.js` |
| **web** | `pnpm install --frozen-lockfile && pnpm turbo run build --filter=@armada/web` | `pnpm --filter @armada/web start` |
| **worker** | `pnpm install --frozen-lockfile && pnpm turbo run build --filter=@armada/worker` | `node apps/worker/dist/index.js` |

Use **turbo**, not a chain of `pnpm --filter` builds: turbo follows `dependsOn: ["^build"]`
and compiles `shared` and `fillout` first. Building only `db` + the app fails with
`Cannot find module '@armada/shared'`.

On Railway these go in `NIXPACKS_BUILD_CMD` / `NIXPACKS_START_CMD` per service.

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

## 6. Gotchas that cost a deploy each

- **Listen on `PORT`.** Railway injects it and routes to it. `API_PORT=${{PORT}}` is *not*
  a valid reference — it arrives empty, coerces to 0, and Fastify binds a random port the
  proxy can't reach (every request 502s). The API reads `PORT` first, `API_PORT` locally.
- **Serve the API through the web app (`/backend`).** Two `*.up.railway.app` subdomains are
  different *sites*, so the session cookie is third-party — Safari blocks those by default
  and Chrome does in Incognito. Sign-in returns 200 and the app bounces back to `/login`,
  and it only "works" in permissive browsers. `API_PROXY_TARGET` turns on a Next rewrite so
  the browser only ever talks to one origin. Keep `BETTER_AUTH_URL` as the API's own origin:
  Better Auth derives its base path from it, and the proxied request still arrives at
  `/api/auth/*`.
- **The auth client needs the full `/api/auth` path.** Better Auth appends endpoints
  directly to a `baseURL` that already has a path, so `.../backend` alone yields
  `/backend/sign-in/email` (404). `auth-client.ts` spells the path out.
- **Env vars that get baked into a build belong in `turbo.json`'s `env`.** Nixpacks caches
  `node_modules/.cache`, so turbo will happily replay a build made before the variable
  changed — the deploy succeeds while shipping the old config.
- **Legacy: cross-site cookies.** `web-*.up.railway.app` and `api-*.up.railway.app` are different
  *sites* — `up.railway.app` is on the Public Suffix List. A `SameSite=Lax` session cookie
  is never sent, so sign-in succeeds and bounces to `/login`. The API sets
  `SameSite=None; Secure` when `BETTER_AUTH_URL` and `WEB_ORIGIN` are different HTTPS hosts.
  Custom domains sharing one registrable domain avoid this entirely.
- **Renaming a service domain breaks auth.** `WEB_ORIGIN` on the api feeds both CORS and
  Better Auth's `trustedOrigins`; if the web domain changes and this doesn't, sign-in
  returns `403 INVALID_ORIGIN`. Update it and redeploy the api.
- **Photo uploads need a volume.** Without one, `UPLOAD_DIR` is container-local and every
  photo disappears on redeploy: `railway volume add --mount-path /app/uploads` on the api.
- **`UPLOAD_DIR` must exist at boot.** `@fastify/static` refuses to register otherwise and
  the process dies before listening. The API now creates it on startup.

## 7. Copying local data up

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
LOCAL="${DATABASE_URL%%\?*}"                 # psql rejects prisma's ?schema=public
pg_dump -Fc --data-only --no-owner --no-privileges \
  --exclude-table=_prisma_migrations -f /tmp/armada-data.dump "$LOCAL"
pg_restore --data-only --disable-triggers --no-owner --no-privileges \
  --single-transaction -d "$PROD_DATABASE_URL" /tmp/armada-data.dump
```

`--exclude-table=_prisma_migrations` keeps the target's own migration history.
`--disable-triggers` is required: `Person.mergedIntoId` is a self-referencing FK.
**Delete the dump afterwards — it contains everyone's personal data.**
