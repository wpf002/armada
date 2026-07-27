/**
 * Groups + the hierarchy graph (Phase 4).
 *
 * A group is identified by its leaders (invariant #8) — names are always derived
 * via `deriveGroupDisplayName`. Membership ends by setting `leftAt`, never by
 * deleting (invariant #2). Co-leadership is the default (invariant #9). A leader
 * with zero disciples is valid and stays visible (invariant #10).
 *
 * Hierarchy scope (§12 Q4): a plain MEMBER sees only their own group(s) + leader;
 * leaders, mentors, and admins see the whole org graph.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type GroupRole } from '@armada/db';
import { can, deriveGroupDisplayName } from '@armada/shared';
import { requireAuth, requireRole } from './session';
import { buildViewer } from './people';

interface PersonNode {
  personId: string;
  name: string;
  photoUrl: string | null;
  role?: GroupRole;
}

function nameOf(p: { firstName: string; lastName: string; preferredName: string | null }): string {
  return `${p.preferredName?.trim() || p.firstName} ${p.lastName}`.trim();
}

/**
 * Does this person function as a leader? Either they lead a group right now, or
 * they hold an elevated role (LEADER / ADMIN) — admins are leaders with extra
 * privileges, and shouldn't be excluded just because they lead no group today.
 */
async function isLeaderish(personId: string): Promise<boolean> {
  // Admin-only accounts aren't in the discipleship graph at all, so an elevated
  // role doesn't make them mentorable.
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { isParticipant: true },
  });
  if (!person?.isParticipant) return false;

  const leads = await prisma.groupMembership.findFirst({
    where: { personId, leftAt: null, role: { in: ['LEADER', 'CO_LEADER'] } },
    select: { id: true },
  });
  if (leads) return true;
  const user = await prisma.user.findUnique({ where: { personId }, select: { role: true } });
  return user?.role === 'LEADER' || user?.role === 'ADMIN';
}

/** Alphabetical by display name, case- and accent-insensitive. */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Assemble a group's active leaders + disciples with derived display name. */
async function groupWithMembers(groupId: string) {
  const group = await prisma.discipleshipGroup.findUnique({ where: { id: groupId } });
  if (!group) return null;
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, leftAt: null },
    select: {
      role: true,
      person: {
        select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true },
      },
    },
  });
  const leaders: PersonNode[] = [];
  const disciples: PersonNode[] = [];
  for (const m of memberships) {
    const node: PersonNode = {
      personId: m.person.id,
      name: nameOf(m.person),
      photoUrl: m.person.photoUrl,
      role: m.role,
    };
    if (m.role === 'DISCIPLE') disciples.push(node);
    else leaders.push(node);
  }
  // Sorted here so every consumer — list, detail, accordion, fleet diagram —
  // shows the same order. It also makes the derived name deterministic: the
  // same two co-leaders can no longer yield "A & B" on one group and "B & A"
  // on another purely from row order.
  leaders.sort(byName);
  disciples.sort(byName);
  return {
    id: group.id,
    name: group.name,
    status: group.status,
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime,
    location: group.location,
    displayName: deriveGroupDisplayName(leaders.map((l) => ({ firstName: l.name, lastName: '' }))),
    leaders,
    disciples,
    openCapacity: leaders.length > 0 && disciples.length === 0,
  };
}

export function registerGroupRoutes(app: FastifyInstance) {
  // --- List groups ---
  app.get('/groups', { preHandler: requireAuth }, async (request) => {
    const viewer = await buildViewer(request.authedUser!);
    const fullGraph =
      viewer.role !== 'MEMBER' || viewer.leaderGroupIds.length > 0 || viewer.menteePersonIds.length > 0;

    const where = fullGraph
      ? { status: { not: 'CLOSED' as const } }
      : { memberships: { some: { personId: viewer.personId, leftAt: null } } };

    const groups = await prisma.discipleshipGroup.findMany({
      where,
      select: { id: true },
    });
    const detailed = [];
    for (const g of groups) {
      const d = await groupWithMembers(g.id);
      if (d) detailed.push(d);
    }
    // By derived name, not createdAt — a group made today belongs in the
    // alphabet, not at the bottom of the list.
    detailed.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
    return { groups: detailed };
  });

  // --- Group detail ---
  app.get('/groups/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const detail = await groupWithMembers(id);
    if (!detail) return reply.status(404).send({ error: 'not found' });
    // Who may edit this group is decided here, by the same `can()` the write
    // routes use — so the UI can't drift from what the API will actually allow.
    const viewer = await buildViewer(request.authedUser!);
    return { group: { ...detail, canManage: can(viewer, 'group.manageMembership', { groupId: id }) } };
  });

  // --- Create (admin) ---
  app.post('/groups', { preHandler: requireRole('ADMIN') }, async (request) => {
    const body = z
      .object({
        name: z.string().optional(),
        meetingDay: z.string().optional(),
        meetingTime: z.string().optional(),
        location: z.string().optional(),
      })
      .parse(request.body);
    const g = await prisma.discipleshipGroup.create({ data: body });
    await audit(request.authedUser!.personId, 'group.create', 'DiscipleshipGroup', g.id, null, g);
    return { group: { id: g.id } };
  });

  // --- Update (admin) ---
  app.patch('/groups/:id', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().nullable().optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).optional(),
        meetingDay: z.string().nullable().optional(),
        meetingTime: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
      })
      .parse(request.body);
    const g = await prisma.discipleshipGroup.update({ where: { id }, data: body });
    return { group: { id: g.id, status: g.status } };
  });

  // --- Add member (admin, or a leader of that group) ---
  app.post('/groups/:id/members', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ personId: z.string().uuid(), role: z.enum(['LEADER', 'CO_LEADER', 'DISCIPLE']) })
      .parse(request.body);
    const viewer = await buildViewer(request.authedUser!);
    if (!can(viewer, 'group.manageMembership', { groupId: id })) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    // Idempotent: one active membership per (group, person).
    const existing = await prisma.groupMembership.findFirst({
      where: { groupId: id, personId: body.personId, leftAt: null },
    });
    if (existing) {
      if (existing.role !== body.role) {
        await prisma.groupMembership.update({ where: { id: existing.id }, data: { role: body.role } });
      }
      return { ok: true, membershipId: existing.id };
    }
    const m = await prisma.groupMembership.create({
      data: { groupId: id, personId: body.personId, role: body.role },
    });
    await audit(request.authedUser!.personId, 'membership.add', 'GroupMembership', m.id, null, m);
    return { ok: true, membershipId: m.id };
  });

  // --- Remove member: end the membership (leftAt), never delete ---
  app.delete('/groups/:id/members/:personId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, personId } = z
      .object({ id: z.string().uuid(), personId: z.string().uuid() })
      .parse(request.params);
    const viewer = await buildViewer(request.authedUser!);
    if (!can(viewer, 'group.manageMembership', { groupId: id })) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const m = await prisma.groupMembership.findFirst({
      where: { groupId: id, personId, leftAt: null },
    });
    if (!m) return reply.status(404).send({ error: 'not an active member' });
    const ended = await prisma.groupMembership.update({
      where: { id: m.id },
      data: { leftAt: new Date() },
    });
    await audit(request.authedUser!.personId, 'membership.end', 'GroupMembership', m.id, m, ended);
    return { ok: true };
  });

  // --- Mentorships (admin) ---
  app.post('/admin/mentorships', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { mentorId, menteeId } = z
      .object({ mentorId: z.string().uuid(), menteeId: z.string().uuid() })
      .parse(request.body);
    if (mentorId === menteeId) return reply.status(400).send({ error: 'a person cannot mentor themselves' });
    // Mentorship in Armada is leader care, so the mentee has to be a leader —
    // enforced here, not just in the picker, so the rule holds for any caller.
    // "Leader" means either leading a group today OR holding an elevated role:
    // an admin is a leader with extra privileges, and may not currently lead a
    // group, but still needs someone shepherding them.
    if (!(await isLeaderish(menteeId))) {
      return reply.status(400).send({ error: 'Only a leader can be mentored' });
    }
    const existing = await prisma.mentorRelationship.findFirst({
      where: { mentorId, menteeId, endedAt: null },
    });
    if (existing) return { ok: true, id: existing.id };
    const edge = await prisma.mentorRelationship.create({ data: { mentorId, menteeId } });
    await audit(request.authedUser!.personId, 'mentorship.add', 'MentorRelationship', edge.id, null, edge);
    return { ok: true, id: edge.id };
  });

  app.delete('/admin/mentorships/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const edge = await prisma.mentorRelationship.findUnique({ where: { id } });
    if (!edge || edge.endedAt) return reply.status(404).send({ error: 'not an active mentorship' });
    await prisma.mentorRelationship.update({ where: { id }, data: { endedAt: new Date() } });
    await audit(request.authedUser!.personId, 'mentorship.end', 'MentorRelationship', id, edge, null);
    return { ok: true };
  });

  // --- Hierarchy graph (scoped) ---
  app.get('/hierarchy', { preHandler: requireAuth }, async (request) => {
    const viewer = await buildViewer(request.authedUser!);
    const fullGraph =
      viewer.role !== 'MEMBER' || viewer.leaderGroupIds.length > 0 || viewer.menteePersonIds.length > 0;

    const groupWhere = fullGraph
      ? { status: { not: 'CLOSED' as const } }
      : { memberships: { some: { personId: viewer.personId, leftAt: null } } };

    const groupRows = await prisma.discipleshipGroup.findMany({
      where: groupWhere,
      select: { id: true },
    });
    const groups = [];
    for (const g of groupRows) {
      const d = await groupWithMembers(g.id);
      if (d) groups.push(d);
    }
    groups.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );

    // Mentor ring (full graph only): mentor -> the leaders/mentees they mentor.
    let mentors: Array<{
      personId: string;
      name: string;
      photoUrl: string | null;
      menteeIds: string[];
      // Named here so the diagram can draw a mentor's people even when a mentee
      // leads no group and so has no node of their own to borrow a name from.
      mentees: PersonNode[];
    }> = [];
    if (fullGraph) {
      const edges = await prisma.mentorRelationship.findMany({
        where: { endedAt: null },
        select: {
          mentee: {
            select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true },
          },
          mentor: {
            select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true },
          },
        },
      });
      const byMentor = new Map<
        string,
        { name: string; photoUrl: string | null; menteeIds: string[]; mentees: PersonNode[] }
      >();
      for (const e of edges) {
        const key = e.mentor.id;
        if (!byMentor.has(key)) {
          byMentor.set(key, {
            name: nameOf(e.mentor),
            photoUrl: e.mentor.photoUrl,
            menteeIds: [],
            mentees: [],
          });
        }
        const entry = byMentor.get(key)!;
        entry.menteeIds.push(e.mentee.id);
        entry.mentees.push({
          personId: e.mentee.id,
          name: nameOf(e.mentee),
          photoUrl: e.mentee.photoUrl,
        });
      }
      for (const v of byMentor.values()) v.mentees.sort(byName);
      mentors = [...byMentor.entries()].map(([personId, v]) => ({ personId, ...v })).sort(byName);
    }

    return { fullGraph, groups, mentors };
  });
}

async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      before: before ? JSON.parse(JSON.stringify(before)) : undefined,
      after: after ? JSON.parse(JSON.stringify(after)) : undefined,
    },
  });
}
