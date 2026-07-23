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

export function registerFilloutRoutes(app: FastifyInstance) {
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
