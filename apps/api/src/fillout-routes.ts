/**
 * Fillout HTTP surface (Phase 5): the public webhook receiver, the admin intake
 * queue, and internal reconcile/drift endpoints the worker calls on a schedule.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '@armada/db';
import { FilloutClient, FIELD_MAP, FILLOUT_FORM_ID } from '@armada/fillout';
import { requireRole } from './session';
import {
  createFromSubmission,
  ingestSubmission,
  linkSubmission,
} from './intake';

const WEBHOOK_SECRET = process.env.FILLOUT_WEBHOOK_SECRET ?? 'change-me';

function secretOk(request: FastifyRequest): boolean {
  const header = request.headers['x-armada-secret'];
  const query = (request.query as { secret?: string })?.secret;
  const provided = (Array.isArray(header) ? header[0] : header) ?? query;
  return provided === WEBHOOK_SECRET;
}

/** Pull submissions from Fillout since the last cursor and ingest each. */
export async function reconcile(): Promise<{ skipped?: boolean; pulled: number; created: number }> {
  const apiKey = process.env.FILLOUT_API_KEY;
  if (!apiKey) return { skipped: true, pulled: 0, created: 0 };

  const client = new FilloutClient({ apiKey });
  const last = await prisma.formSubmission.findFirst({
    orderBy: { submittedAt: 'desc' },
    select: { submittedAt: true },
  });
  const afterDate = last?.submittedAt.toISOString();

  let created = 0;
  let pulled = 0;
  let offset = 0;
  // Paginate defensively; assume webhooks drop.
  for (;;) {
    const page = await client.getSubmissions(FILLOUT_FORM_ID, { limit: 100, offset, afterDate });
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
  return { pulled, created };
}

/** Compare the live form's questions to our field map; report drift. */
export async function metadataDrift(): Promise<{
  skipped?: boolean;
  missingInForm: string[];
  unmappedInForm: string[];
}> {
  const apiKey = process.env.FILLOUT_API_KEY;
  if (!apiKey) return { skipped: true, missingInForm: [], unmappedInForm: [] };
  const client = new FilloutClient({ apiKey });
  const meta = (await client.getFormMetadata(FILLOUT_FORM_ID)) as {
    questions?: Array<{ id: string; name: string }>;
  };
  const formLabels = new Set((meta.questions ?? []).map((q) => q.name.trim().toLowerCase()));
  const mappedLabels = new Set(FIELD_MAP.map((f) => f.label.trim().toLowerCase()));
  const missingInForm = FIELD_MAP.map((f) => f.label).filter(
    (l) => !formLabels.has(l.trim().toLowerCase()),
  );
  const unmappedInForm = (meta.questions ?? [])
    .map((q) => q.name)
    .filter((n) => !mappedLabels.has(n.trim().toLowerCase()));
  return { missingInForm, unmappedInForm };
}

/** Answer lookup by question label from a stored submission payload. */
function answer(raw: unknown, label: string): string | null {
  const r = raw as {
    submission?: { questions?: Array<{ name?: string; value?: unknown }> };
    questions?: Array<{ name?: string; value?: unknown }>;
  };
  const qs = r?.submission?.questions ?? r?.questions ?? [];
  const hit = qs.find((q) => q.name?.trim().toLowerCase() === label.toLowerCase());
  const v = hit?.value;
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== '\\n' ? s : null;
}

/** Cache the Fillout form-id → name map briefly so listing stays cheap. */
let formNameCache: { at: number; names: Record<string, string> } | null = null;
async function formNames(): Promise<Record<string, string>> {
  if (formNameCache && Date.now() - formNameCache.at < 5 * 60 * 1000) return formNameCache.names;
  const apiKey = process.env.FILLOUT_API_KEY;
  if (!apiKey) return {};
  try {
    const raw = (await new FilloutClient({ apiKey }).listForms()) as unknown;
    const arr = (Array.isArray(raw) ? raw : ((raw as { forms?: unknown[] })?.forms ?? [])) as Array<
      Record<string, unknown>
    >;
    const names: Record<string, string> = {};
    for (const f of arr) {
      const id = String(f.formId ?? f.id ?? '');
      if (id) names[id] = String(f.name ?? id);
    }
    formNameCache = { at: Date.now(), names };
    return names;
  } catch {
    return formNameCache?.names ?? {};
  }
}

export function registerFilloutRoutes(app: FastifyInstance) {
  // --- Every Fillout registration, grouped by the form it came from ---
  app.get('/registrations', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { status } = z
      .object({
        status: z
          .enum(['NEW', 'NEEDS_REVIEW', 'LINKED_EXISTING', 'CREATED_NEW', 'IGNORED'])
          .optional(),
      })
      .parse(request.query);

    const subs = await prisma.formSubmission.findMany({
      where: status ? { intakeStatus: status } : {},
      orderBy: { submittedAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        filloutFormId: true,
        submittedAt: true,
        personId: true,
        intakeStatus: true,
        matchCandidates: true,
        raw: true,
        person: { select: { phone: true, email: true, churchAffiliation: true } },
      },
    });

    const names = await formNames();

    // Candidate person names so the reviewer sees who they'd be linking to.
    const candidateIds = new Set<string>();
    for (const s of subs) {
      for (const c of (s.matchCandidates as Array<{ personId: string }> | null) ?? []) {
        candidateIds.add(c.personId);
      }
    }
    const candPeople = candidateIds.size
      ? await prisma.person.findMany({
          where: { id: { in: [...candidateIds] } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const candMap = new Map(
      candPeople.map((p) => [p.id, { name: `${p.firstName} ${p.lastName}`.trim(), email: p.email }]),
    );

    const registrants = subs.map((s) => ({
      submissionId: s.id,
      formId: s.filloutFormId,
      formName: names[s.filloutFormId] ?? s.filloutFormId,
      personId: s.personId,
      submittedAt: s.submittedAt,
      status: s.intakeStatus,
      name: answer(s.raw, 'Name') ?? '',
      email: answer(s.raw, 'Email') ?? s.person?.email ?? null,
      phone: answer(s.raw, 'Phone Number') ?? s.person?.phone ?? null,
      church: answer(s.raw, 'Church Affiliation') ?? s.person?.churchAffiliation ?? null,
      lookingFor: answer(s.raw, 'What are you looking for in Armada?'),
      candidates: ((s.matchCandidates as Array<{ personId: string; score: number; reason: string }> | null) ?? [])
        .slice(0, 4)
        .map((c) => ({
          personId: c.personId,
          score: c.score,
          reason: c.reason,
          name: candMap.get(c.personId)?.name ?? 'Unknown',
          email: candMap.get(c.personId)?.email ?? null,
        })),
    }));

    // Form summary for grouping in the UI.
    const byForm = new Map<string, { formId: string; formName: string; count: number }>();
    for (const r of registrants) {
      const cur = byForm.get(r.formId) ?? { formId: r.formId, formName: r.formName, count: 0 };
      cur.count++;
      byForm.set(r.formId, cur);
    }

    const needsReview = await prisma.formSubmission.count({
      where: { intakeStatus: 'NEEDS_REVIEW' },
    });

    return {
      registrants,
      forms: [...byForm.values()].sort((a, b) => b.count - a.count),
      needsReview,
    };
  });

  // --- Is the live Fillout form actually wired up? ---
  app.get('/registrations/connection', { preHandler: requireRole('ADMIN') }, async () => {
    const apiKey = process.env.FILLOUT_API_KEY;
    const stored = await prisma.formSubmission.count();
    if (!apiKey) {
      return {
        connected: false,
        formId: FILLOUT_FORM_ID,
        message: `No FILLOUT_API_KEY set, so the live form isn't being polled. ${stored} submission${stored === 1 ? '' : 's'} stored locally. Add the key and register the webhook to go live.`,
      };
    }
    try {
      const client = new FilloutClient({ apiKey });
      const meta = (await client.getFormMetadata(FILLOUT_FORM_ID)) as {
        questions?: Array<{ id: string }>;
      };
      return {
        connected: true,
        formId: FILLOUT_FORM_ID,
        message: `Connected to form ${FILLOUT_FORM_ID} (${meta.questions?.length ?? 0} questions). ${stored} submission${stored === 1 ? '' : 's'} received.`,
      };
    } catch (err) {
      return {
        connected: false,
        formId: FILLOUT_FORM_ID,
        message: `Could not reach Fillout: ${(err as Error).message}`,
      };
    }
  });

  // --- Public webhook receiver: verify secret, persist, match, 200 fast ---
  app.post('/webhooks/fillout', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!secretOk(request)) return reply.status(401).send({ error: 'bad secret' });
    try {
      const result = await ingestSubmission((request.body ?? {}) as Record<string, unknown>);
      return reply.status(200).send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // --- Admin intake queue ---
  app.get('/admin/intake', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { status } = z
      .object({
        status: z
          .enum(['NEW', 'NEEDS_REVIEW', 'LINKED_EXISTING', 'CREATED_NEW', 'IGNORED'])
          .optional(),
      })
      .parse(request.query);
    const submissions = await prisma.formSubmission.findMany({
      where: status ? { intakeStatus: status } : {},
      orderBy: { submittedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        filloutSubmissionId: true,
        submittedAt: true,
        intakeStatus: true,
        personId: true,
        matchCandidates: true,
        raw: true,
      },
    });
    return { submissions };
  });

  app.post('/admin/intake/:id/link', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { personId } = z.object({ personId: z.string().uuid() }).parse(request.body);
    try {
      await linkSubmission(id, personId, request.authedUser?.personId ?? null);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.post('/admin/intake/:id/create', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    try {
      const personId = await createFromSubmission(id, request.authedUser?.personId ?? null);
      return { ok: true, personId };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.post('/admin/intake/:id/ignore', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.formSubmission.update({
      where: { id },
      data: { intakeStatus: 'IGNORED', reviewedById: request.authedUser?.personId, reviewedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        actorId: request.authedUser?.personId ?? null,
        action: 'intake.ignore',
        entity: 'FormSubmission',
        entityId: id,
        after: { intakeStatus: 'IGNORED' },
      },
    });
    return { ok: true };
  });

  // --- Internal (worker-called, secret-guarded) ---
  app.post('/internal/reconcile', async (request, reply) => {
    if (!secretOk(request)) return reply.status(401).send({ error: 'bad secret' });
    return reconcile();
  });

  app.get('/internal/metadata-drift', async (request, reply) => {
    if (!secretOk(request)) return reply.status(401).send({ error: 'bad secret' });
    return metadataDrift();
  });
}
