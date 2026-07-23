/**
 * Connect to Fillout and pull registrations from every form in the account.
 *
 *   pnpm --filter @armada/api fillout:sync                 # all forms
 *   pnpm --filter @armada/api fillout:sync -- --check      # verify + list forms
 *   pnpm --filter @armada/api fillout:sync -- --form <id>  # a single form
 *
 * Needs FILLOUT_API_KEY in .env. Idempotent — re-running imports nothing new.
 */
import { prisma } from '@armada/db';
import { FilloutClient, EXCLUDED_FORM_IDS } from '@armada/fillout';
import { ingestSubmission } from '../intake';

interface FormRef {
  formId: string;
  name: string;
}

async function listForms(client: FilloutClient): Promise<FormRef[]> {
  const raw = (await client.listForms()) as unknown;
  const arr = (Array.isArray(raw) ? raw : ((raw as { forms?: unknown[] })?.forms ?? [])) as Array<
    Record<string, unknown>
  >;
  return arr
    .map((f) => ({
      formId: String(f.formId ?? f.id ?? ''),
      name: String(f.name ?? f.formId ?? 'Untitled Form'),
    }))
    .filter((f) => f.formId);
}

async function main() {
  const apiKey = process.env.FILLOUT_API_KEY;
  if (!apiKey) {
    console.error('\n✗ FILLOUT_API_KEY is not set. Add it to .env and re-run.\n');
    process.exit(1);
  }
  const client = new FilloutClient({ apiKey });

  const onlyIdx = process.argv.indexOf('--form');
  const onlyForm = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

  console.log('\n→ Listing forms…');
  let forms = await listForms(client);
  if (onlyForm) forms = forms.filter((f) => f.formId === onlyForm);
  const excluded = forms.filter((f) => EXCLUDED_FORM_IDS.includes(f.formId));
  forms = forms.filter((f) => !EXCLUDED_FORM_IDS.includes(f.formId));
  for (const f of excluded) console.log(`    (excluded: ${f.name})`);
  console.log(`✓ ${forms.length} form${forms.length === 1 ? '' : 's'}:`);
  for (const f of forms) console.log(`    ${f.formId}  ${f.name}`);

  if (process.argv.includes('--check')) {
    console.log('\n(--check: stopping before import)\n');
    return;
  }

  console.log('\n→ Importing submissions…');
  let grandPulled = 0;
  let grandCreated = 0;

  for (const form of forms) {
    let offset = 0;
    let pulled = 0;
    let created = 0;
    try {
      for (;;) {
        const page = await client.getSubmissions(form.formId, { limit: 150, offset });
        const rows = page.responses ?? [];
        if (rows.length === 0) break;
        for (const r of rows) {
          pulled++;
          const res = await ingestSubmission(
            r as unknown as Record<string, unknown>,
            form.formId,
          );
          if (res.created) created++;
        }
        offset += rows.length;
        if (rows.length < 150) break;
      }
      console.log(`    ${form.name}: pulled ${pulled}, new ${created}`);
    } catch (err) {
      const msg = (err as Error).message;
      // Draft/unpublished forms have no published version to query.
      const reason = msg.includes('flow snapshot')
        ? 'not published yet — no submissions'
        : msg;
      console.log(`    ${form.name}: skipped (${reason})`);
    }
    grandPulled += pulled;
    grandCreated += created;
  }

  const total = await prisma.formSubmission.count();
  console.log(`\n✓ Pulled ${grandPulled}, newly imported ${grandCreated}. ${total} stored in total.`);
  console.log('  (Re-running is safe — submissions are idempotent.)\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('\n✗ Fillout sync failed:', (err as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  });
