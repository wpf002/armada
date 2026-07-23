/**
 * Connect to Fillout and pull the registration form.
 *
 *   pnpm --filter @armada/api fillout:sync            # verify + import submissions
 *   pnpm --filter @armada/api fillout:sync -- --check # verify connection only
 *
 * Needs FILLOUT_API_KEY in .env. Prints the live question IDs so they can be
 * pinned into packages/fillout/field-map.ts (labels change; IDs don't).
 */
import { prisma } from '@armada/db';
import { FilloutClient, FILLOUT_FORM_ID } from '@armada/fillout';
import { ingestSubmission } from '../intake';

async function main() {
  const apiKey = process.env.FILLOUT_API_KEY;
  const formId = process.env.FILLOUT_FORM_ID || FILLOUT_FORM_ID;

  if (!apiKey) {
    console.error('\n✗ FILLOUT_API_KEY is not set.');
    console.error('  Add it to .env, then re-run:  FILLOUT_API_KEY="fo_live_..."\n');
    process.exit(1);
  }

  const client = new FilloutClient({ apiKey });

  // 1. Verify the key works and the form exists.
  console.log(`\n→ Checking form ${formId}…`);
  const meta = (await client.getFormMetadata(formId)) as {
    name?: string;
    questions?: Array<{ id: string; name: string; type?: string }>;
  };
  console.log(`✓ Connected: "${meta.name ?? formId}"`);
  console.log(`  ${meta.questions?.length ?? 0} questions:\n`);
  for (const q of meta.questions ?? []) {
    console.log(`    ${q.id}  ${q.name}${q.type ? `  (${q.type})` : ''}`);
  }

  if (process.argv.includes('--check')) {
    console.log('\n(--check: stopping before import)\n');
    return;
  }

  // 2. Pull every submission and run it through the normal intake pipeline.
  console.log('\n→ Importing submissions…');
  let offset = 0;
  let pulled = 0;
  let created = 0;
  for (;;) {
    const page = await client.getSubmissions(formId, { limit: 100, offset });
    const rows = page.responses ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      pulled++;
      const res = await ingestSubmission(r as unknown as Record<string, unknown>);
      if (res.created) created++;
    }
    offset += rows.length;
    if (rows.length < 100) break;
  }

  const total = await prisma.formSubmission.count();
  console.log(`✓ Pulled ${pulled}, newly imported ${created}. ${total} stored in total.`);
  console.log('  (Re-running is safe — submissions are idempotent.)\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('\n✗ Fillout sync failed:', (err as Error).message);
    console.error('  Check the API key is valid and the form ID is correct.\n');
    await prisma.$disconnect();
    process.exit(1);
  });
