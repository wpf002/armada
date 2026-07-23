/**
 * Fillout intake pipeline (Phase 5) — the ONE place a registration submission
 * becomes graph data. Used by the webhook receiver, the backfill command, and
 * the nightly reconcile so behavior never diverges.
 *
 * Invariant #4: submissions are immutable — we store the raw JSON verbatim and
 * derive a Person; a re-sync never overwrites a hand-edited field. Idempotent on
 * filloutSubmissionId. Identity resolution follows §8 (auto-link ≥ 0.95;
 * 0.6–0.95 → NEEDS_REVIEW; < 0.6 → new PROSPECT).
 */
import { prisma, scoreCandidates, type CandidatePerson, type MatchCandidate } from '@armada/db';
import {
  FIELD_MAP,
  cleanText,
  normalizeEmail,
  normalizePhone,
  parseYesNo,
  splitName,
  FILLOUT_FORM_ID,
} from '@armada/fillout';

// --- Parsing ---------------------------------------------------------------

interface ParsedRegistrant {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  maritalStatus: 'SINGLE' | 'MARRIED' | 'ENGAGED' | 'DIVORCED' | 'WIDOWED' | null;
  occupation: string | null;
  churchAffiliation: string | null;
  attendedBefore: boolean | null;
  heardAboutUs: string | null;
  prayerRequest: string | null;
  lookingFor: string | null;
}

interface RawQuestion {
  id?: string;
  name?: string;
  value?: unknown;
}

/** Accept several webhook envelope shapes and return the questions array + ids. */
function extractSubmission(payload: Record<string, unknown>): {
  submissionId: string | null;
  submittedAt: Date;
  formId: string;
  questions: RawQuestion[];
} {
  const sub = (payload.submission ?? payload) as Record<string, unknown>;
  const submissionId =
    (sub.submissionId as string) ?? (payload.submissionId as string) ?? null;
  const timeStr =
    (sub.submissionTime as string) ??
    (sub.lastUpdatedAt as string) ??
    (payload.submissionTime as string) ??
    null;
  const submittedAt = timeStr ? new Date(timeStr) : new Date();
  const formId =
    (payload.formId as string) ?? (sub.formId as string) ?? FILLOUT_FORM_ID;
  const questions = (sub.questions as RawQuestion[]) ?? (payload.questions as RawQuestion[]) ?? [];
  return { submissionId, submittedAt, formId, questions };
}

const MARITAL: Record<string, ParsedRegistrant['maritalStatus']> = {
  single: 'SINGLE',
  married: 'MARRIED',
  engaged: 'ENGAGED',
  divorced: 'DIVORCED',
  widowed: 'WIDOWED',
};

/** Map answers to fields by question label (the field-map's current labels).
 *  Question IDs are preferred once metadata is synced, but labels work today. */
function parseAnswers(questions: RawQuestion[]): ParsedRegistrant {
  const byLabel = new Map<string, unknown>();
  const byId = new Map<string, unknown>();
  for (const q of questions) {
    if (q.name) byLabel.set(q.name.trim().toLowerCase(), q.value);
    if (q.id) byId.set(q.id, q.value);
  }
  const get = (label: string, id: string | null): string | null => {
    const raw = (id && byId.get(id)) ?? byLabel.get(label.trim().toLowerCase());
    return cleanText(typeof raw === 'string' ? raw : raw == null ? null : String(raw));
  };
  const val = (target: string) => {
    const entry = FIELD_MAP.find((f) => f.target === target);
    return entry ? get(entry.label, entry.questionId) : null;
  };

  const maritalRaw = val('maritalStatus');
  return {
    name: val('name'),
    email: normalizeEmail(val('email')),
    phone: normalizePhone(val('phone')),
    address: val('address'),
    maritalStatus: maritalRaw ? (MARITAL[maritalRaw.toLowerCase()] ?? null) : null,
    occupation: val('occupation'),
    churchAffiliation: val('churchAffiliation'),
    attendedBefore: parseYesNo(val('attendedBefore')),
    heardAboutUs: val('heardAboutUs'),
    prayerRequest: val('prayerRequest'),
    lookingFor: val('lookingFor'),
  };
}

// --- Matching --------------------------------------------------------------

async function candidatesFor(parsed: ParsedRegistrant): Promise<MatchCandidate[]> {
  if (!parsed.name && !parsed.email && !parsed.phone) return [];
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
  return scoreCandidates(
    { name: parsed.name ?? '', email: parsed.email, phone: parsed.phone, church: parsed.churchAffiliation },
    people,
  );
}

// --- Person creation / enrichment ------------------------------------------

async function createPersonFromSubmission(parsed: ParsedRegistrant): Promise<string> {
  const split = splitName(parsed.name);
  const person = await prisma.person.create({
    data: {
      firstName: split?.firstName || parsed.email || 'Unknown',
      lastName: split?.lastName ?? '',
      email: parsed.email,
      phone: parsed.phone,
      address: parsed.address,
      maritalStatus: parsed.maritalStatus,
      occupation: parsed.occupation,
      churchAffiliation: parsed.churchAffiliation,
      attendedBefore: parsed.attendedBefore,
      heardAboutUs: parsed.heardAboutUs,
      lookingFor: parsed.lookingFor,
      status: 'PROSPECT',
    },
  });
  return person.id;
}

/** Fill NULL fields only — never overwrite a hand-edited value (invariant #4). */
async function enrichPerson(personId: string, parsed: ParsedRegistrant) {
  const cur = await prisma.person.findUnique({ where: { id: personId } });
  if (!cur) return;
  const data: Record<string, unknown> = {};
  if (!cur.email && parsed.email) data.email = parsed.email;
  if (!cur.phone && parsed.phone) data.phone = parsed.phone;
  if (!cur.address && parsed.address) data.address = parsed.address;
  if (!cur.maritalStatus && parsed.maritalStatus) data.maritalStatus = parsed.maritalStatus;
  if (!cur.occupation && parsed.occupation) data.occupation = parsed.occupation;
  if (!cur.churchAffiliation && parsed.churchAffiliation) data.churchAffiliation = parsed.churchAffiliation;
  if (cur.attendedBefore == null && parsed.attendedBefore != null) data.attendedBefore = parsed.attendedBefore;
  if (!cur.heardAboutUs && parsed.heardAboutUs) data.heardAboutUs = parsed.heardAboutUs;
  if (!cur.lookingFor && parsed.lookingFor) data.lookingFor = parsed.lookingFor;
  if (Object.keys(data).length) await prisma.person.update({ where: { id: personId }, data });
}

async function attachSideEffects(personId: string, parsed: ParsedRegistrant) {
  // Prayer request → private Note (invariant #6: default LEADERS visibility).
  if (parsed.prayerRequest) {
    const exists = await prisma.note.findFirst({
      where: { subjectId: personId, body: parsed.prayerRequest, authorId: 'fillout' },
    });
    if (!exists) {
      await prisma.note.create({
        data: { subjectId: personId, authorId: 'fillout', body: parsed.prayerRequest, visibility: 'LEADERS' },
      });
    }
  }
  // §7 heuristic: mentions of leading/discipling others raise WANTS_TO_LEAD.
  if (parsed.lookingFor && /\b(lead|leading|discipl(e|ing) others|pour into|mentor others)\b/i.test(parsed.lookingFor)) {
    const exists = await prisma.interest.findFirst({
      where: { personId, type: 'WANTS_TO_LEAD', status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    if (!exists) await prisma.interest.create({ data: { personId, type: 'WANTS_TO_LEAD', status: 'OPEN' } });
  }
}

/** A registrant needs a reach-out. One open FollowUp per subject. */
async function ensureFollowUp(personId: string) {
  const exists = await prisma.followUp.findFirst({
    where: { subjectId: personId, status: { in: ['PENDING', 'CONTACTED', 'NO_RESPONSE'] } },
  });
  if (!exists) await prisma.followUp.create({ data: { subjectId: personId, status: 'PENDING' } });
}

// --- Ingest (the shared entry point) ---------------------------------------

export interface IngestResult {
  created: boolean;
  submissionId: string | null;
  intakeStatus: string;
  personId: string | null;
}

export async function ingestSubmission(payload: Record<string, unknown>): Promise<IngestResult> {
  const { submissionId, submittedAt, formId, questions } = extractSubmission(payload);
  if (!submissionId) throw new Error('submission missing submissionId');

  // Idempotent: a replayed webhook creates nothing new.
  const existing = await prisma.formSubmission.findUnique({
    where: { filloutSubmissionId: submissionId },
  });
  if (existing) {
    return {
      created: false,
      submissionId,
      intakeStatus: existing.intakeStatus,
      personId: existing.personId,
    };
  }

  const parsed = parseAnswers(questions);
  const candidates = await candidatesFor(parsed);
  const top = candidates[0];

  let intakeStatus: 'NEW' | 'NEEDS_REVIEW' | 'LINKED_EXISTING' | 'CREATED_NEW' = 'NEW';
  let personId: string | null = null;

  if (top && top.score >= 0.95) {
    personId = top.personId;
    intakeStatus = 'LINKED_EXISTING';
    await enrichPerson(personId, parsed);
  } else if (top && top.score >= 0.6) {
    intakeStatus = 'NEEDS_REVIEW'; // admin decides in the queue
  } else {
    personId = await createPersonFromSubmission(parsed);
    intakeStatus = 'CREATED_NEW';
  }

  await prisma.formSubmission.create({
    data: {
      filloutFormId: formId,
      filloutSubmissionId: submissionId,
      submittedAt,
      raw: payload as object,
      intakeStatus,
      personId,
      matchCandidates: candidates.slice(0, 5) as object,
    },
  });

  if (personId) {
    await attachSideEffects(personId, parsed);
    await ensureFollowUp(personId);
  }

  await prisma.auditLog.create({
    data: { actorId: null, action: 'intake.ingest', entity: 'FormSubmission', entityId: submissionId, after: { intakeStatus, personId } },
  });

  return { created: true, submissionId, intakeStatus, personId };
}

/** Resolve a NEEDS_REVIEW submission by linking it to an existing person. */
export async function linkSubmission(submissionId: string, personId: string, reviewerId: string | null) {
  const sub = await prisma.formSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new Error('submission not found');
  const parsed = parseAnswers(extractSubmission(sub.raw as Record<string, unknown>).questions);
  await enrichPerson(personId, parsed);
  await attachSideEffects(personId, parsed);
  await ensureFollowUp(personId);
  await prisma.formSubmission.update({
    where: { id: submissionId },
    data: { personId, intakeStatus: 'LINKED_EXISTING', reviewedById: reviewerId, reviewedAt: new Date() },
  });
}

/** Resolve a NEEDS_REVIEW submission by creating a new person. */
export async function createFromSubmission(submissionId: string, reviewerId: string | null) {
  const sub = await prisma.formSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new Error('submission not found');
  const parsed = parseAnswers(extractSubmission(sub.raw as Record<string, unknown>).questions);
  const personId = await createPersonFromSubmission(parsed);
  await attachSideEffects(personId, parsed);
  await ensureFollowUp(personId);
  await prisma.formSubmission.update({
    where: { id: submissionId },
    data: { personId, intakeStatus: 'CREATED_NEW', reviewedById: reviewerId, reviewedAt: new Date() },
  });
  return personId;
}
