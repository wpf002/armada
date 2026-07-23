/**
 * Admin surface (Phase 8): user/role management + invite, audit log viewer,
 * permission-aware CSV export, and bulk archive/status operations.
 *
 * Exports run through `visibleFieldsFor` (invariant: visibility is enforced in
 * the serializer, never the UI) so a column is only present when the requester
 * may see it. Archive is a soft status change — no hard deletes (invariant #2).
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@armada/db';
import { deriveGroupDisplayName, visibleFieldsFor, type PersonField } from '@armada/shared';
import { auth } from './auth';
import { requireRole } from './session';
import { buildViewer } from './people';

function personName(p: { firstName: string; lastName: string; preferredName: string | null }) {
  return `${p.preferredName?.trim() || p.firstName} ${p.lastName}`.trim();
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registerAdminRoutes(app: FastifyInstance) {
  // ---- Users + roles ----
  app.get('/admin/users', { preHandler: requireRole('ADMIN') }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        person: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
      },
    });
    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        personId: u.person.id,
        name: personName(u.person),
      })),
    };
  });

  app.patch('/admin/users/:id/role', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { role } = z.object({ role: z.enum(['ADMIN', 'LEADER', 'MEMBER']) }).parse(request.body);
    // Don't allow removing the last admin.
    if (role !== 'ADMIN') {
      const target = await prisma.user.findUnique({ where: { id } });
      if (target?.role === 'ADMIN') {
        const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (admins <= 1) return reply.status(400).send({ error: 'cannot demote the last admin' });
      }
    }
    const before = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    const u = await prisma.user.update({ where: { id }, data: { role } });
    await prisma.auditLog.create({
      data: { actorId: request.authedUser!.personId, action: 'user.role', entity: 'User', entityId: id, before: before ?? undefined, after: { role } },
    });
    return { ok: true, role: u.role };
  });

  // ---- Invite: create a login for a person (temp password, admin shares it) ----
  app.post('/admin/users/invite', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { email, name, role } = z
      .object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z.enum(['ADMIN', 'LEADER', 'MEMBER']).default('MEMBER'),
      })
      .parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return reply.status(409).send({ error: 'user already exists' });

    const tempPassword = randomBytes(9).toString('base64url');
    await auth.api.signUpEmail({ body: { email, password: tempPassword, name: name ?? email } });
    await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role } });
    await prisma.auditLog.create({
      data: { actorId: request.authedUser!.personId, action: 'user.invite', entity: 'User', entityId: email, after: { role } },
    });
    // Returned once so the admin can share it; the user resets on first login.
    return { ok: true, email, tempPassword, role };
  });

  // ---- Audit log viewer ----
  app.get('/admin/audit', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { entity, entityId, limit } = z
      .object({
        entity: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.coerce.number().min(1).max(500).default(100),
      })
      .parse(request.query);
    const logs = await prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { logs };
  });

  // ---- Bulk status / archive (soft) ----
  app.post('/admin/people/bulk', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { ids, status } = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum(['ACTIVE', 'INACTIVE', 'ALUMNI', 'PROSPECT', 'REMOVED']),
      })
      .parse(request.body);
    const result = await prisma.person.updateMany({ where: { id: { in: ids } }, data: { status } });
    await prisma.auditLog.create({
      data: {
        actorId: request.authedUser!.personId,
        action: 'person.bulkStatus',
        entity: 'Person',
        entityId: `${ids.length} people`,
        after: { status, count: result.count },
      },
    });
    return { ok: true, updated: result.count };
  });

  // ---- Permission-aware CSV export ----
  app.get('/admin/export/people.csv', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const viewer = await buildViewer(request.authedUser!);
    const people = await prisma.person.findMany({
      where: { mergedIntoId: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const columns: PersonField[] = [
      'firstName',
      'lastName',
      'preferredName',
      'email',
      'phone',
      'address',
      'churchAffiliation',
      'maritalStatus',
      'occupation',
      'status',
    ];
    const header = ['id', ...columns, 'group'];
    const lines = [header.join(',')];

    for (const p of people) {
      const memberships = await prisma.groupMembership.findMany({
        where: { personId: p.id, leftAt: null },
        select: { groupId: true },
      });
      const subject = { personId: p.id, groupIds: memberships.map((m) => m.groupId) };
      const allowed = visibleFieldsFor(viewer, subject);

      // Derived group name (only if the viewer may see 'group').
      let groupName = '';
      if (allowed.has('group') && memberships[0]) {
        const leaders = await prisma.groupMembership.findMany({
          where: { groupId: memberships[0].groupId, leftAt: null, role: { in: ['LEADER', 'CO_LEADER'] } },
          select: { person: { select: { firstName: true, lastName: true, preferredName: true } } },
        });
        groupName = deriveGroupDisplayName(leaders.map((l) => l.person));
      }

      const row = [
        p.id,
        ...columns.map((c) => (allowed.has(c) ? csvCell((p as Record<string, unknown>)[c]) : '')),
        csvCell(groupName),
      ];
      lines.push(row.join(','));
    }

    await prisma.auditLog.create({
      data: { actorId: viewer.personId, action: 'people.export', entity: 'Person', entityId: `${people.length} rows` },
    });

    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="armada-people.csv"');
    return lines.join('\n');
  });
}
