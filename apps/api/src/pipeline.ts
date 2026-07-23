/**
 * Pipeline, follow-up, and dashboards (Phase 6).
 *
 * The four questions from §1 are each a graph traversal answerable in one query:
 *   - who leads a D-group  -> active LEADER/CO_LEADER memberships
 *   - who's in whose group -> group -> active memberships (see /groups)
 *   - who mentors leaders  -> active MentorRelationship edges
 *   - who wants discipling -> open WANTS_DISCIPLESHIP interests
 * Plus "who's falling through the cracks" -> people with zero active edges.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type GroupRole } from '@armada/db';
import { deriveGroupDisplayName } from '@armada/shared';
import { requireAuth, requireRole } from './session';
import { buildViewer } from './people';

const LEADER: GroupRole[] = ['LEADER', 'CO_LEADER'];
const STALE_DAYS = 14;

function personName(p: { firstName: string; lastName: string; preferredName: string | null }) {
  return `${p.preferredName?.trim() || p.firstName} ${p.lastName}`.trim();
}

async function groupDisplayName(groupId: string): Promise<string> {
  const leaders = await prisma.groupMembership.findMany({
    where: { groupId, leftAt: null, role: { in: LEADER } },
    select: { person: { select: { firstName: true, lastName: true, preferredName: true } } },
  });
  return deriveGroupDisplayName(
    leaders.map((l) => ({ firstName: personName(l.person), lastName: '' })),
  );
}

export function registerPipelineRoutes(app: FastifyInstance) {
  // ---- §1 Q1: who leads a D-group ----
  app.get('/leaders', { preHandler: requireAuth }, async () => {
    const memberships = await prisma.groupMembership.findMany({
      where: { leftAt: null, role: { in: LEADER } },
      select: {
        groupId: true,
        role: true,
        person: { select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true } },
      },
    });
    const byPerson = new Map<string, { id: string; name: string; photoUrl: string | null; groups: string[] }>();
    for (const m of memberships) {
      const gn = await groupDisplayName(m.groupId);
      const cur = byPerson.get(m.person.id) ?? {
        id: m.person.id,
        name: personName(m.person),
        photoUrl: m.person.photoUrl,
        groups: [],
      };
      cur.groups.push(gn);
      byPerson.set(m.person.id, cur);
    }
    return { leaders: [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  });

  // ---- §1 Q3: who mentors the leaders ----
  app.get('/mentors', { preHandler: requireAuth }, async () => {
    const edges = await prisma.mentorRelationship.findMany({
      where: { endedAt: null },
      select: {
        mentor: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
        mentee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      },
    });
    const byMentor = new Map<string, { id: string; name: string; mentees: Array<{ id: string; name: string }> }>();
    for (const e of edges) {
      const cur = byMentor.get(e.mentor.id) ?? { id: e.mentor.id, name: personName(e.mentor), mentees: [] };
      cur.mentees.push({ id: e.mentee.id, name: personName(e.mentee) });
      byMentor.set(e.mentor.id, cur);
    }
    return { mentors: [...byMentor.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  });

  // ---- §1 Q4: the discipleship pipeline board ----
  app.get('/interests', { preHandler: requireAuth }, async (request) => {
    const { type, status } = z
      .object({
        type: z.enum(['WANTS_DISCIPLESHIP', 'WANTS_TO_LEAD', 'WANTS_MENTOR']).optional(),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'PLACED', 'DECLINED']).optional(),
      })
      .parse(request.query);
    const rows = await prisma.interest.findMany({
      where: { type, status },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        notes: true,
        assignedGroupId: true,
        createdAt: true,
        person: { select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true } },
      },
    });
    const interests = [];
    for (const r of rows) {
      interests.push({
        id: r.id,
        type: r.type,
        status: r.status,
        notes: r.notes,
        createdAt: r.createdAt,
        person: { id: r.person.id, name: personName(r.person), photoUrl: r.person.photoUrl },
        assignedGroup: r.assignedGroupId
          ? { id: r.assignedGroupId, displayName: await groupDisplayName(r.assignedGroupId) }
          : null,
      });
    }
    return { interests };
  });

  app.post('/interests', { preHandler: requireAuth }, async (request, reply) => {
    const viewer = await buildViewer(request.authedUser!);
    if (viewer.role === 'MEMBER' && viewer.leaderGroupIds.length === 0) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const body = z
      .object({
        personId: z.string().uuid(),
        type: z.enum(['WANTS_DISCIPLESHIP', 'WANTS_TO_LEAD', 'WANTS_MENTOR']).default('WANTS_DISCIPLESHIP'),
        notes: z.string().optional(),
      })
      .parse(request.body);
    const existing = await prisma.interest.findFirst({
      where: { personId: body.personId, type: body.type, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    if (existing) return { ok: true, id: existing.id };
    const i = await prisma.interest.create({ data: { ...body, status: 'OPEN' } });
    return { ok: true, id: i.id };
  });

  app.patch('/interests/:id', { preHandler: requireAuth }, async (request, reply) => {
    const viewer = await buildViewer(request.authedUser!);
    if (viewer.role === 'MEMBER' && viewer.leaderGroupIds.length === 0) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'PLACED', 'DECLINED']).optional(),
        assignedGroupId: z.string().uuid().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(request.body);
    const before = await prisma.interest.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'not found' });
    const resolvedAt = body.status === 'PLACED' || body.status === 'DECLINED' ? new Date() : undefined;
    const i = await prisma.interest.update({ where: { id }, data: { ...body, resolvedAt } });
    await prisma.auditLog.create({
      data: { actorId: viewer.personId, action: 'interest.update', entity: 'Interest', entityId: id, before, after: i },
    });
    return { ok: true };
  });

  // ---- Follow-ups (the Reach Out replacement) ----
  app.get('/followups', { preHandler: requireAuth }, async (request) => {
    const viewer = await buildViewer(request.authedUser!);
    const { scope, status } = z
      .object({
        scope: z.enum(['mine', 'all']).default('mine'),
        status: z.enum(['PENDING', 'CONTACTED', 'NO_RESPONSE', 'NOT_INTERESTED', 'MOVED', 'COMPLETED']).optional(),
      })
      .parse(request.query);
    const where =
      scope === 'all' && viewer.role === 'ADMIN'
        ? { status }
        : { ownerId: viewer.personId, status };
    const rows = await prisma.followUp.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        status: true,
        dueAt: true,
        outcome: true,
        subject: { select: { id: true, firstName: true, lastName: true, preferredName: true, phone: true } },
      },
    });
    return {
      followups: rows.map((r) => ({
        id: r.id,
        status: r.status,
        dueAt: r.dueAt,
        outcome: r.outcome,
        subject: { id: r.subject.id, name: personName(r.subject), phone: r.subject.phone },
      })),
    };
  });

  app.patch('/followups/:id', { preHandler: requireAuth }, async (request, reply) => {
    const viewer = await buildViewer(request.authedUser!);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const fu = await prisma.followUp.findUnique({ where: { id } });
    if (!fu) return reply.status(404).send({ error: 'not found' });
    const isOwnerOrAdmin = viewer.role === 'ADMIN' || fu.ownerId === viewer.personId || fu.ownerId == null;
    if (!isOwnerOrAdmin) return reply.status(403).send({ error: 'forbidden' });
    const body = z
      .object({
        ownerId: z.string().uuid().nullable().optional(),
        status: z.enum(['PENDING', 'CONTACTED', 'NO_RESPONSE', 'NOT_INTERESTED', 'MOVED', 'COMPLETED']).optional(),
        outcome: z.string().nullable().optional(),
        dueAt: z.string().datetime().nullable().optional(),
      })
      .parse(request.body);
    const completedAt = body.status === 'COMPLETED' ? new Date() : undefined;
    await prisma.followUp.update({
      where: { id },
      data: {
        ...body,
        dueAt: body.dueAt === undefined ? undefined : body.dueAt ? new Date(body.dueAt) : null,
        completedAt,
      },
    });
    return { ok: true };
  });

  // ---- Leader + admin dashboards ----
  app.get('/dashboard', { preHandler: requireAuth }, async (request) => {
    const viewer = await buildViewer(request.authedUser!);

    // Leader view: my groups, my mentees, my open follow-ups.
    const myGroups = [];
    for (const gid of viewer.leaderGroupIds) {
      myGroups.push({ id: gid, displayName: await groupDisplayName(gid) });
    }
    const myMentees = await prisma.mentorRelationship.findMany({
      where: { mentorId: viewer.personId, endedAt: null },
      select: { mentee: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
    });
    const myFollowUps = await prisma.followUp.count({
      where: { ownerId: viewer.personId, status: { in: ['PENDING', 'CONTACTED', 'NO_RESPONSE'] } },
    });

    const base = {
      role: viewer.role,
      myGroups,
      myMentees: myMentees.map((m) => ({ id: m.mentee.id, name: personName(m.mentee) })),
      myOpenFollowUps: myFollowUps,
    };

    if (viewer.role !== 'ADMIN') return base;

    // Admin view: the actionable gaps.
    const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const [wantsDiscipleship, staleFollowUps, unassignedPeople] = await Promise.all([
      prisma.interest.count({ where: { type: 'WANTS_DISCIPLESHIP', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      // Stale = still pending and either overdue or never assigned an owner.
      prisma.followUp.count({
        where: { status: 'PENDING', OR: [{ dueAt: { lt: staleCutoff } }, { ownerId: null }] },
      }),
      prisma.person.count({
        where: { status: { in: ['ACTIVE', 'PROSPECT'] }, mergedIntoId: null, memberships: { none: { leftAt: null } } },
      }),
    ]);

    // Groups without a mentor: active groups where no active leader has an active mentor.
    const activeGroups = await prisma.discipleshipGroup.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true },
    });
    let groupsWithoutMentor = 0;
    let openCapacityLeaders = 0;
    for (const g of activeGroups) {
      const leaders = await prisma.groupMembership.findMany({
        where: { groupId: g.id, leftAt: null, role: { in: LEADER } },
        select: { personId: true },
      });
      const discCount = await prisma.groupMembership.count({
        where: { groupId: g.id, leftAt: null, role: 'DISCIPLE' },
      });
      if (leaders.length > 0 && discCount === 0) openCapacityLeaders++;
      const leaderIds = leaders.map((l) => l.personId);
      const mentored = leaderIds.length
        ? await prisma.mentorRelationship.count({ where: { menteeId: { in: leaderIds }, endedAt: null } })
        : 0;
      if (leaders.length > 0 && mentored === 0) groupsWithoutMentor++;
    }

    return {
      ...base,
      admin: {
        wantsDiscipleship,
        unassignedPeople,
        groupsWithoutMentor,
        openCapacityLeaders,
        staleFollowUps,
      },
    };
  });

  // Admin: the "falling through the cracks" list — active people with zero edges.
  app.get('/admin/unassigned', { preHandler: requireRole('ADMIN') }, async () => {
    const people = await prisma.person.findMany({
      where: {
        status: { in: ['ACTIVE', 'PROSPECT'] },
        mergedIntoId: null,
        memberships: { none: { leftAt: null } },
        interests: { none: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
      },
      orderBy: [{ lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, status: true },
      take: 300,
    });
    return { people: people.map((p) => ({ id: p.id, name: personName(p), status: p.status })) };
  });
}
