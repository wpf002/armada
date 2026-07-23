/**
 * Register the Fillout webhook (run once per environment at deploy).
 *
 *   pnpm --filter @armada/api exec tsx src/scripts/register-webhook.ts <public-api-url>
 *
 * Points Fillout at POST <public-api-url>/webhooks/fillout?secret=<FILLOUT_WEBHOOK_SECRET>.
 * Needs FILLOUT_API_KEY. Fillout: POST /v1/api/webhook/create { formId, url }.
 */
import { FILLOUT_FORM_ID } from '@armada/fillout';

async function main() {
  const apiKey = process.env.FILLOUT_API_KEY;
  const secret = process.env.FILLOUT_WEBHOOK_SECRET ?? 'change-me';
  const publicUrl = process.argv[2] ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiKey) throw new Error('FILLOUT_API_KEY is required');
  if (!publicUrl) throw new Error('pass the public API url as an argument');

  const webhookUrl = `${publicUrl.replace(/\/$/, '')}/webhooks/fillout?secret=${encodeURIComponent(secret)}`;
  const res = await fetch('https://api.fillout.com/v1/api/webhook/create', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ formId: FILLOUT_FORM_ID, url: webhookUrl }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Fillout webhook/create -> ${res.status}: ${JSON.stringify(body)}`);
  console.log('Registered webhook:', body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
