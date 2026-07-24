/**
 * People directory + profiles (Phase 3).
 *
 * Field visibility is enforced HERE, server-side, by running the shared
 * `visibleFieldsFor(viewer, subject)` over live graph data — never in the UI
 * (CLAUDE.md). The Viewer is built from the requester's active edges (leader
 * memberships, mentees, mentees' groups); "mentor" scope is derived, not stored.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type GroupRole } from '@armada/db';
import {
  can,
  deriveGroupDisplayName,
  visibleFieldsFor,
  type PersonField,
  type SubjectContext,
  type Viewer,
} from '@armada/shared';
import type { AuthedUser } from './session';
import { requireAuth, requireRole } from './session';

const ACTIVE_LEADER: { in: GroupRole[] } = { in: ['LEADER', 'CO_LEADER'] };

/** Preview/demo logins are hidden from the directory. */
export const PREVIEW_EMAIL_SUFFIX = '@preview.armada';

function personName(p: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return `${p.preferredName?.trim() || p.firstName} ${p.lastName}`.trim();
}

/** Build the Viewer scope from a user's active edges. */
export async function buildViewer(user: AuthedUser): Promise<Viewer> {
  const leaderMemberships = await prisma.groupMembership.findMany({
    where: { personId: user.personId, leftAt: null, role: ACTIVE_LEADER },
    select: { groupId: true },
  });
  const mentees = await prisma.mentorRelationship.findMany({
    where: { mentorId: user.personId, endedAt: null },
    select: { menteeId: true },
  });
  const menteeIds = mentees.map((m) => m.menteeId);
  const menteeGroups = menteeIds.length
    ? await prisma.groupMembership.findMany({
        where: { personId: { in: menteeIds }, leftAt: null, role: ACTIVE_LEADER },
        select: { groupId: true },
      })
    : [];
  return {
    personId: user.personId,
    role: user.role,
    leaderGroupIds: leaderMemberships.map((m) => m.groupId),
    menteePersonIds: menteeIds,
    menteeGroupIds: menteeGroups.map((m) => m.groupId),
  };
}

/** A subject's active group memberships, with derived group display names. */
async function subjectGroups(personId: string) {
  const memberships = await prisma.groupMembership.findMany({
    where: { personId, leftAt: null },
    select: { groupId: true, role: true },
  });
  const out = [];
  for (const m of memberships) {
    const leaders = await prisma.groupMembership.findMany({
      where: { groupId: m.groupId, leftAt: null, role: ACTIVE_LEADER },
      select: { person: { select: { firstName: true, lastName: true, preferredName: true } } },
    });
    out.push({
      groupId: m.groupId,
      role: m.role,
      displayName: deriveGroupDisplayName(leaders.map((l) => l.person)),
    });
  }
  return out;
}

/** Serialize a person to ONLY the fields the viewer may see. */
function serialize(
  person: Record<string, unknown> & { id: string; firstName: string; lastName: string },
  allowed: Set<PersonField>,
  groups: Array<{ groupId: string; role: string; displayName: string }>,
) {
  const out: Record<string, unknown> = { id: person.id };
  const fieldList: PersonField[] = [
    'firstName',
    'lastName',
    'preferredName',
    'photoUrl',
    'churchAffiliation',
    'phone',
    'email',
    'address',
    'maritalStatus',
    'occupation',
    'bio',
    'status',
    'attendedBefore',
    'heardAboutUs',
    'lookingFor',
  ];
  for (const f of fieldList) {
    if (allowed.has(f)) out[f] = person[f] ?? null;
  }
  if (allowed.has('group')) out.groups = groups;
  return out;
}

export function registerPeopleRoutes(app: FastifyInstance) {
  // --- Directory list: name/photo/group/church for everyone (client search index) ---
  app.get('/people', { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({
        status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'ALUMNI', 'REMOVED']).optional(),
        groupId: z.string().uuid().optional(),
        unassigned: z.coerce.boolean().optional(),
      })
      .parse(request.query);

    const people = await prisma.person.findMany({
      where: {
        mergedIntoId: null,
        status: query.status ?? { not: 'REMOVED' },
        // Preview accounts exist to demo roles; keep them out of the directory.
        NOT: { email: { endsWith: PREVIEW_EMAIL_SUFFIX } },
        ...(query.groupId
          ? { memberships: { some: { groupId: query.groupId, leftAt: null } } }
          : {}),
        ...(query.unassigned ? { memberships: { none: { leftAt: null } } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        photoUrl: true,
        churchAffiliation: true,
        status: true,
      },
    });

    // Alphabetical by surname, falling back to first name when there's no
    // surname (imported records sometimes have only one name).
    people.sort((a, b) => {
      const ka = (a.lastName || a.firstName || '').toLowerCase();
      const kb = (b.lastName || b.firstName || '').toLowerCase();
      if (ka !== kb) return ka.localeCompare(kb);
      return (a.firstName || '').toLowerCase().localeCompare((b.firstName || '').toLowerCase());
    });

    // Directory fields are public to any authenticated viewer — no per-row scope.
    const withGroups = [];
    for (const p of people) {
      withGroups.push({ ...p, groups: await subjectGroups(p.id) });
    }
    return { people: withGroups };
  });

  // --- Profile: field-level visibility enforced server-side ---
  app.get('/people/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const person = await prisma.person.findUnique({ where: { id } });
    if (!person || person.mergedIntoId) {
      // follow the tombstone forward if merged
      if (person?.mergedIntoId) return reply.redirect(`/people/${person.mergedIntoId}`);
      return reply.status(404).send({ error: 'not found' });
    }
    const viewer = await buildViewer(request.authedUser!);
    const groups = await subjectGroups(id);
    const subject: SubjectContext = { personId: id, groupIds: groups.map((g) => g.groupId) };
    const allowed = visibleFieldsFor(viewer, subject);

    // Open discipleship intents, so the profile can show where they stand
    // (leading, being discipled, or looking to be placed).
    const interests = await prisma.interest.findMany({
      where: { personId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      select: { type: true, status: true },
    });
    // Two DIFFERENT relationships, deliberately kept apart:
    //
    //  · discipled by — the leaders of the D-group they sit in as a disciple.
    //  · mentored by  — their mentor, an explicit MentorRelationship edge.
    //
    // A leader is typically mentored by someone senior while also being
    // discipled by no one; conflating the two hides half the graph.
    // Ended memberships count here: someone who was discipled and has since
    // gone on to lead was still discipled by that person. History is the
    // product (invariant #2) — a finished discipleship is a fact, not a gap.
    const discipleMemberships = await prisma.groupMembership.findMany({
      where: { personId: id, role: 'DISCIPLE' },
      orderBy: [{ leftAt: 'desc' }, { joinedAt: 'desc' }],
      select: { groupId: true, leftAt: true },
    });
    const discipledBy: Array<{ id: string; name: string; current: boolean }> = [];
    for (const m of discipleMemberships) {
      const leaders = await prisma.groupMembership.findMany({
        where: { groupId: m.groupId, leftAt: null, role: ACTIVE_LEADER },
        select: {
          person: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
        },
      });
      for (const l of leaders) {
        if (!discipledBy.some((d) => d.id === l.person.id)) {
          discipledBy.push({
            id: l.person.id,
            name: personName(l.person),
            current: m.leftAt === null,
          });
        }
      }
    }
    // Active discipleship first, completed ones after.
    discipledBy.sort((a, b) => Number(b.current) - Number(a.current));

    const mentorEdge = await prisma.mentorRelationship.findFirst({
      where: { menteeId: id, endedAt: null },
      select: {
        mentor: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      },
    });
    const mentoredBy = mentorEdge
      ? { id: mentorEdge.mentor.id, name: personName(mentorEdge.mentor) }
      : null;

    return {
      person: {
        ...serialize(person as never, allowed, groups),
        interests,
        hasMentor: Boolean(mentoredBy),
        discipledBy,
        mentoredBy,
      },
    };
  });

  // --- Self-edit (own profile) or admin edit anyone ---
  const editableSchema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().optional(),
    preferredName: z.string().nullable().optional(),
    // Every field the profile's Details panel shows is editable from it.
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    lookingFor: z.string().nullable().optional(),
    heardAboutUs: z.string().nullable().optional(),
    occupation: z.string().nullable().optional(),
    churchAffiliation: z.string().nullable().optional(),
    maritalStatus: z
      .enum(['SINGLE', 'MARRIED', 'ENGAGED', 'DIVORCED', 'WIDOWED'])
      .nullable()
      .optional(),
    photoUrl: z.string().url().nullable().optional(),
  });

  app.patch('/people/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const user = request.authedUser!;
    const isSelf = user.personId === id;
    if (!isSelf && user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const data = editableSchema.parse(request.body);
    const before = await prisma.person.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'not found' });

    // Email is the unique login key — reject a collision with a clear message
    // rather than letting Prisma throw a raw constraint error.
    if (data.email) {
      const clash = await prisma.person.findUnique({ where: { email: data.email } });
      if (clash && clash.id !== id) {
        return reply.status(409).send({ error: 'That email already belongs to someone else' });
      }
    }

    const updated = await prisma.person.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        actorId: user.personId,
        action: 'person.update',
        entity: 'Person',
        entityId: id,
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(data)),
      },
    });
    return { person: { id: updated.id } };
  });

  // --- Photo upload (self or admin). Stored under UPLOAD_DIR, served at /uploads. ---
  const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
  const PUBLIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  const ALLOWED_IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

  app.post('/people/:id/photo', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const user = request.authedUser!;
    if (user.personId !== id && user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'no file' });
    const ext = extname(file.filename).toLowerCase();
    if (!ALLOWED_IMG.has(ext)) return reply.status(400).send({ error: 'unsupported image type' });

    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${id}-${randomUUID()}${ext}`;
    await pipeline(file.file, createWriteStream(join(UPLOAD_DIR, name)));
    const photoUrl = `${PUBLIC_BASE}/uploads/${name}`;
    await prisma.person.update({ where: { id }, data: { photoUrl } });
    return { photoUrl };
  });

  // --- Notes on a person ---------------------------------------------------
  // Who may read or write a note is decided by `can(...)` over live edges, not
  // by the caller: an admin anywhere, a leader on their own group's members, a
  // mentor on their mentees. PRIVATE_TO_AUTHOR notes stay with their author.

  app.get('/people/:id/notes', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const viewer = await buildViewer(request.authedUser!);
    const groups = await subjectGroups(id);
    const subject: SubjectContext = { personId: id, groupIds: groups.map((g) => g.groupId) };
    if (!can(viewer, 'note.view', { subject })) {
      return reply.status(403).send({ error: 'forbidden' });
    }

    const notes = await prisma.note.findMany({
      where: { subjectId: id },
      orderBy: { createdAt: 'desc' },
    });
    const visible = notes.filter(
      (n) =>
        n.visibility !== 'PRIVATE_TO_AUTHOR' ||
        n.authorId === viewer.personId ||
        viewer.role === 'ADMIN',
    );

    // Resolve author names in one query rather than per note.
    const authors = await prisma.person.findMany({
      where: { id: { in: [...new Set(visible.map((n) => n.authorId))] } },
      select: { id: true, firstName: true, lastName: true, preferredName: true },
    });
    const nameById = new Map(authors.map((a) => [a.id, personName(a)]));

    return {
      notes: visible.map((n) => ({
        id: n.id,
        body: n.body,
        visibility: n.visibility,
        createdAt: n.createdAt,
        authorId: n.authorId,
        authorName: nameById.get(n.authorId) ?? 'Unknown',
        canDelete: viewer.role === 'ADMIN' || n.authorId === viewer.personId,
      })),
      canWrite: can(viewer, 'note.create', { subject }),
    };
  });

  app.post('/people/:id/notes', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        body: z.string().trim().min(1).max(5000),
        visibility: z.enum(['PRIVATE_TO_AUTHOR', 'LEADERS', 'ADMINS']).default('LEADERS'),
      })
      .parse(request.body);

    const viewer = await buildViewer(request.authedUser!);
    const groups = await subjectGroups(id);
    const subject: SubjectContext = { personId: id, groupIds: groups.map((g) => g.groupId) };
    if (!can(viewer, 'note.create', { subject })) {
      return reply.status(403).send({ error: 'forbidden' });
    }

    const note = await prisma.note.create({
      data: {
        subjectId: id,
        authorId: viewer.personId,
        body: body.body,
        visibility: body.visibility,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: viewer.personId,
        action: 'note.create',
        entity: 'Note',
        entityId: note.id,
        before: undefined,
        after: { subjectId: id, visibility: note.visibility },
      },
    });
    return { note: { id: note.id } };
  });

  app.delete('/notes/:noteId', { preHandler: requireAuth }, async (request, reply) => {
    const { noteId } = z.object({ noteId: z.string().uuid() }).parse(request.params);
    const viewer = await buildViewer(request.authedUser!);
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return reply.status(404).send({ error: 'not found' });
    if (viewer.role !== 'ADMIN' && note.authorId !== viewer.personId) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    await prisma.note.delete({ where: { id: noteId } });
    await prisma.auditLog.create({
      data: {
        actorId: viewer.personId,
        action: 'note.delete',
        entity: 'Note',
        entityId: noteId,
        before: { subjectId: note.subjectId },
        after: undefined,
      },
    });
    return { ok: true };
  });

  // --- Admin: list directory including REMOVED / merge tombstones ---
  app.get('/admin/people', { preHandler: requireRole('ADMIN') }, async () => {
    const people = await prisma.person.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        mergedIntoId: true,
      },
    });
    return { people };
  });
}
