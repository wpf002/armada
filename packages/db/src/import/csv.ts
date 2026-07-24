/**
 * Generic sign-up CSV importer.
 *
 *   pnpm --filter @armada/db import:csv -- <file.csv> [--label "Rangers Signup"]
 *
 * Built for exports that Fillout's Forms API can't reach — notably Zite
 * documents, whose responses live in the Zite Database tab and export as CSV.
 *
 * Matches every row against the existing graph with the same §8 resolution the
 * xlsx importer uses (exact email > phone > normalized name), enriching NULL
 * fields on a match and creating a PROSPECT otherwise. Idempotent: re-running
 * changes nothing because matches resolve to the same people.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { prisma } from '../index';
import {
  canonicalDisplayName,
  scoreCandidates,
  splitName,
  type CandidatePerson,
} from './resolve';

/** Minimal RFC4180-ish parser: handles quoted fields, embedded commas, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const clean = (v: string | undefined): string | null => {
  const s = (v ?? '').replace(/[\u00A0\uFEFF\u200B]/g, ' ').trim();
  return s && s !== '\\n' ? s : null;
};

function normalizeEmail(v: string | undefined): string | null {
  const s = clean(v);
  return s ? s.toLowerCase() : null;
}

function normalizePhone(v: string | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return s.startsWith('+') ? s : null;
}

const MARITAL: Record<string, string> = {
  single: 'SINGLE',
  married: 'MARRIED',
  engaged: 'ENGAGED',
  divorced: 'DIVORCED',
  widowed: 'WIDOWED',
};

function normalizeMarital(v: string | undefined): string | null {
  const s = clean(v);
  return s ? (MARITAL[s.toLowerCase()] ?? null) : null;
}

/** Find a column index by any of the given header aliases. */
function col(headers: string[], ...aliases: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const labelIdx = args.indexOf('--label');
  const label = labelIdx >= 0 ? args[labelIdx + 1] : 'CSV import';
  const formIdx = args.indexOf('--form-id');
  const formId = formIdx >= 0 ? args[formIdx + 1] : null;
  if (!file) {
    console.error('\nUsage: import:csv -- <file.csv> [--label "Source"] [--form-id <filloutFormId>]\n');
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(resolvePath(file), 'utf8'));
  if (rows.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }
  const headers = rows[0]!;
  const iName = col(headers, 'name', 'full name');
  const iFirst = col(headers, 'first name', 'first');
  const iLast = col(headers, 'last name', 'last');
  const iEmail = col(headers, 'email', 'email address');
  const iPhone = col(headers, 'phone', 'phone number');
  // Optional profile columns — the membership questionnaire carries these.
  const iAddress = col(headers, 'address', 'home address');
  const iMarital = col(headers, 'marital status', 'martial status');
  const iOccupation = col(headers, 'occupation', 'job occupation');
  const iChurch = col(headers, 'church membership', 'church affiliation', 'church');
  const iLooking = col(headers, 'interest if not in group', 'interest', 'what are you looking for in armada?');
  const iRowId = col(headers, 'id', 'submission id');
  const iSubmitted = col(headers, 'submitted at', 'submitted', 'created at');

  if (iName < 0 && iFirst < 0) {
    console.error(`No name column found. Headers: ${headers.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n→ ${label}: ${rows.length - 1} rows from ${file}`);

  let created = 0;
  let matched = 0;
  let enriched = 0;
  let submissions = 0;

  for (const r of rows.slice(1)) {
    const rawName =
      iName >= 0 ? clean(r[iName]) : [clean(r[iFirst]), clean(r[iLast])].filter(Boolean).join(' ');
    const email = iEmail >= 0 ? normalizeEmail(r[iEmail]) : null;
    const phone = iPhone >= 0 ? normalizePhone(r[iPhone]) : null;
    if (!rawName && !email) continue;

    // Profile extras, only present on richer exports.
    const extras: Record<string, unknown> = {};
    if (iAddress >= 0) extras.address = clean(r[iAddress]);
    if (iMarital >= 0) extras.maritalStatus = normalizeMarital(r[iMarital]);
    if (iOccupation >= 0) extras.occupation = clean(r[iOccupation]);
    if (iChurch >= 0) extras.churchAffiliation = clean(r[iChurch]);
    if (iLooking >= 0) extras.lookingFor = clean(r[iLooking]);

    const people: CandidatePerson[] = await prisma.person.findMany({
      where: { mergedIntoId: null, status: { not: 'REMOVED' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        churchAffiliation: true,
      },
    });

    const display = canonicalDisplayName(rawName ?? email!);
    const candidates = scoreCandidates({ name: display, email, phone }, people);
    const top = candidates[0];

    let personId: string;
    let intakeStatus: 'LINKED_EXISTING' | 'CREATED_NEW';

    if (top && top.score >= 0.6) {
      matched++;
      personId = top.personId;
      intakeStatus = 'LINKED_EXISTING';
      // Fill blanks only — never overwrite what's already on file.
      const cur = await prisma.person.findUnique({ where: { id: top.personId } });
      const data: Record<string, unknown> = {};
      if (cur && !cur.email && email) data.email = email;
      if (cur && !cur.phone && phone) data.phone = phone;
      for (const [k, v] of Object.entries(extras)) {
        if (v != null && cur && (cur as Record<string, unknown>)[k] == null) data[k] = v;
      }
      if (Object.keys(data).length) {
        await prisma.person.update({ where: { id: top.personId }, data });
        enriched++;
      }
      console.log(`   = ${display} → ${top.reason}`);
    } else {
      const { firstName, lastName } = splitName(display);
      // Guard against a duplicate email colliding with the unique index.
      const emailTaken = email
        ? await prisma.person.findUnique({ where: { email } })
        : null;
      const made = await prisma.person.create({
        data: {
          firstName: firstName || display,
          lastName,
          email: emailTaken ? null : email,
          phone,
          status: 'PROSPECT',
          ...Object.fromEntries(Object.entries(extras).filter(([, v]) => v != null)),
        } as never,
      });
      created++;
      personId = made.id;
      intakeStatus = 'CREATED_NEW';
      console.log(`   + ${display} (new)`);
    }

    // Record the response itself, so the form shows its registrants in the
    // app. Zite documents are invisible to the Forms REST API, so a CSV export
    // is the only way their responses reach us — but once here they are
    // ordinary submissions. The row is stored verbatim (invariant #4).
    if (formId) {
      const rowId = iRowId >= 0 ? clean(r[iRowId]) : null;
      // Prefer the export's own row id; fall back to a hash of the row so a
      // re-import resolves to the same submission instead of duplicating it.
      const submissionId = `${formId}:${
        rowId ?? createHash('sha1').update(r.join('\u0001')).digest('hex').slice(0, 24)
      }`;
      const submittedRaw = iSubmitted >= 0 ? clean(r[iSubmitted]) : null;
      const submittedAt = submittedRaw ? new Date(submittedRaw) : new Date(0);
      const raw = Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null]));

      await prisma.formSubmission.upsert({
        where: { filloutSubmissionId: submissionId },
        // Re-import re-links the person but never rewrites the stored answers.
        update: { personId, intakeStatus },
        create: {
          filloutFormId: formId,
          filloutSubmissionId: submissionId,
          submittedAt: Number.isNaN(submittedAt.valueOf()) ? new Date(0) : submittedAt,
          raw,
          personId,
          intakeStatus,
        },
      });
      submissions++;
    }
  }

  console.log(
    `\n✓ ${matched} matched (${enriched} enriched with new contact info), ${created} created.` +
      (formId ? ` ${submissions} submissions recorded against ${formId}.` : '') +
      '\n',
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
