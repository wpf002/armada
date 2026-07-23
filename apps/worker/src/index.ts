import cron from 'node-cron';
import { z } from 'zod';

/**
 * Thin scheduler. The ingest/match/reconcile logic lives in apps/api (one place,
 * §7) — the worker just calls the API's internal endpoints on a schedule with
 * the shared secret. Webhooks fail; the nightly reconcile backstops them.
 */
const envSchema = z.object({
  RECONCILE_CRON: z.string().default('0 3 * * *'),
  DRIFT_CRON: z.string().default('0 4 * * 1'), // Mondays 4am
  API_INTERNAL_URL: z.string().default('http://localhost:4000'),
  FILLOUT_WEBHOOK_SECRET: z.string().default('change-me'),
});

const env = envSchema.parse(process.env);

async function callInternal(path: string, method: 'GET' | 'POST') {
  try {
    const res = await fetch(`${env.API_INTERNAL_URL}${path}`, {
      method,
      headers: { 'x-armada-secret': env.FILLOUT_WEBHOOK_SECRET },
    });
    const body = await res.json();
    console.log(`[worker] ${method} ${path} -> ${res.status}`, body);
  } catch (err) {
    console.error(`[worker] ${path} failed`, err);
  }
}

function main() {
  for (const [name, expr] of [
    ['RECONCILE_CRON', env.RECONCILE_CRON],
    ['DRIFT_CRON', env.DRIFT_CRON],
  ] as const) {
    if (!cron.validate(expr)) throw new Error(`Invalid ${name}: ${expr}`);
  }

  console.log(`[worker] reconcile: ${env.RECONCILE_CRON} · drift: ${env.DRIFT_CRON}`);
  cron.schedule(env.RECONCILE_CRON, () => {
    void callInternal('/internal/reconcile', 'POST');
  });
  cron.schedule(env.DRIFT_CRON, () => {
    void callInternal('/internal/metadata-drift', 'GET');
  });
}

main();
