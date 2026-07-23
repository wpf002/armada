import cron from 'node-cron';
import { z } from 'zod';

const envSchema = z.object({
  RECONCILE_CRON: z.string().default('0 3 * * *'),
  FILLOUT_FORM_ID: z.string().default('dHqhm2ovxQus'),
});

const env = envSchema.parse(process.env);

/**
 * Nightly Fillout reconcile. Pulls submissions since the last cursor and inserts
 * anything the webhook dropped (§7 — webhooks fail; assume it). Implemented in
 * Phase 5. Phase 0 registers the schedule so the worker runs cleanly.
 */
async function reconcile() {
  console.log(`[worker] reconcile tick for form ${env.FILLOUT_FORM_ID} — implemented in Phase 5`);
}

function main() {
  if (!cron.validate(env.RECONCILE_CRON)) {
    throw new Error(`Invalid RECONCILE_CRON: ${env.RECONCILE_CRON}`);
  }
  console.log(`[worker] scheduling Fillout reconcile: ${env.RECONCILE_CRON}`);
  cron.schedule(env.RECONCILE_CRON, () => {
    void reconcile();
  });
}

main();
