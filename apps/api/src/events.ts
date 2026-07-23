/**
 * Events + calendar (Phase 7).
 *
 * Visibility scopes each event (ALL / LEADERS_ONLY / ADMINS_ONLY). The per-user
 * `.ics` subscription feed is signed with an HMAC token (no session — a calendar
 * app polls it), so an admin's event lands on a leader's phone automatically.
 * Armada Night recurs on the last Monday monthly at Communion Coffee.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Role, type Visibility } from '@armada/db';
import { requireAuth, requireRole, getAuthedUser } from './session';
import { buildViewer } from './people';

const SECRET = process.env.BETTER_AUTH_SECRET ?? 'dev-secret';
const ARMADA_NIGHT_LOCATION = 'Communion Coffee';
const ARMADA_NIGHT_ADDRESS = '514 Lockwood Dr, Richardson, TX 75080';

// --- Calendar subscription token (HMAC, no session) ------------------------
function calToken(userId: string): string {
  const sig = createHmac('sha256', SECRET).update(userId).digest('base64url');
  return `${userId}.${sig}`;
}
function verifyCalToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const userId = token.slice(0, dot);
  const expected = calToken(userId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

// --- Armada Night recurrence ----------------------------------------------
/** 7:00pm America/Chicago on the given day, correct across DST (no TZ library:
 *  try both Central offsets and keep whichever actually renders as 19:00). */
function central7pm(year: number, month: number, day: number): Date {
  for (const offset of [5, 6]) {
    const candidate = new Date(Date.UTC(year, month, day, 19 + offset, 0, 0));
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        hour12: false,
      }).format(candidate),
    );
    if (hour === 19) return candidate;
  }
  return new Date(Date.UTC(year, month, day, 24, 0, 0));
}

function firstMondayOfMonth(year: number, month: number): Date {
  // month is 0-indexed. Walk forward from the 1st to the first Monday.
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return central7pm(year, month, d.getUTCDate());
}

// --- ICS generation --------------------------------------------------------
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function toVEvent(e: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  address: string | null;
}): string {
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + 90 * 60 * 1000);
  const loc = [e.location, e.address].filter(Boolean).join(', ');
  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@armada`,
    `DTSTAMP:${icsDate(new Date(0))}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    loc ? `LOCATION:${icsEscape(loc)}` : '',
    e.description ? `DESCRIPTION:${icsEscape(e.description)}` : '',
    'END:VEVENT',
  ]
    .filter(Boolean)
    .join('\r\n');
}
function toVCalendar(events: Parameters<typeof toVEvent>[0][]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Armada//Discipleship//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Armada',
    ...events.map(toVEvent),
    'END:VCALENDAR',
  ].join('\r\n');
}

// --- Visibility ------------------------------------------------------------
async function visibleScopes(viewer: { role: Role; personId: string }): Promise<Visibility[]> {
  const scopes: Visibility[] = ['ALL'];
  const full = await buildViewer({ id: '', email: '', name: '', personId: viewer.personId, role: viewer.role });
  if (
    viewer.role === 'ADMIN' ||
    viewer.role === 'LEADER' ||
    full.leaderGroupIds.length > 0 ||
    full.menteePersonIds.length > 0
  ) {
    scopes.push('LEADERS_ONLY');
  }
  if (viewer.role === 'ADMIN') scopes.push('ADMINS_ONLY');
  return scopes;
}

export function registerEventRoutes(app: FastifyInstance) {
  // --- List (scoped) ---
  app.get('/events', { preHandler: requireAuth }, async (request) => {
    const scopes = await visibleScopes(request.authedUser!);
    const events = await prisma.event.findMany({
      where: { visibility: { in: scopes } },
      orderBy: { startsAt: 'asc' },
      include: { rsvps: { where: { personId: request.authedUser!.personId } }, _count: { select: { rsvps: true } } },
    });
    return {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        description: e.description,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
        address: e.address,
        rsvpEnabled: e.rsvpEnabled,
        visibility: e.visibility,
        myRsvp: e.rsvps[0]?.status ?? null,
        rsvpCount: e._count.rsvps,
      })),
    };
  });

  // --- Create (admin) ---
  app.post('/events', { preHandler: requireRole('ADMIN') }, async (request) => {
    const body = z
      .object({
        title: z.string().min(1),
        type: z.enum(['ARMADA_NIGHT', 'RETREAT', 'LEADER_TRAINING', 'GROUP_MEETING', 'SERVICE', 'OTHER']).default('OTHER'),
        description: z.string().optional(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().optional(),
        location: z.string().optional(),
        address: z.string().optional(),
        rsvpEnabled: z.boolean().default(false),
        visibility: z.enum(['ALL', 'LEADERS_ONLY', 'ADMINS_ONLY']).default('ALL'),
      })
      .parse(request.body);
    const e = await prisma.event.create({
      data: {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: request.authedUser!.personId, action: 'event.create', entity: 'Event', entityId: e.id, after: e },
    });
    return { event: { id: e.id } };
  });

  app.patch('/events/:id', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        location: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        rsvpEnabled: z.boolean().optional(),
        visibility: z.enum(['ALL', 'LEADERS_ONLY', 'ADMINS_ONLY']).optional(),
      })
      .parse(request.body);
    const e = await prisma.event.update({
      where: { id },
      data: {
        ...body,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt === undefined ? undefined : body.endsAt ? new Date(body.endsAt) : null,
      },
    });
    return { event: { id: e.id } };
  });

  app.delete('/events/:id', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.eventRsvp.deleteMany({ where: { eventId: id } });
    await prisma.event.delete({ where: { id } });
    return { ok: true };
  });

  // --- RSVP ---
  app.post('/events/:id/rsvp', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { status } = z.object({ status: z.enum(['YES', 'NO', 'MAYBE']) }).parse(request.body);
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return reply.status(404).send({ error: 'not found' });
    const personId = request.authedUser!.personId;
    await prisma.eventRsvp.upsert({
      where: { eventId_personId: { eventId: id, personId } },
      create: { eventId: id, personId, status },
      update: { status },
    });
    return { ok: true };
  });

  // --- Generate Armada Nights (admin) ---
  app.post('/events/armada-night/generate', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { months } = z.object({ months: z.number().min(1).max(24).default(12) }).parse(request.body ?? {});
    const now = new Date();
    let created = 0;
    for (let i = 0; i < months; i++) {
      const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const startsAt = firstMondayOfMonth(target.getUTCFullYear(), target.getUTCMonth());
      if (startsAt < now) continue;
      const title = 'Armada Night';
      const exists = await prisma.event.findFirst({
        where: { type: 'ARMADA_NIGHT', startsAt },
      });
      if (exists) continue;
      await prisma.event.create({
        data: {
          title,
          type: 'ARMADA_NIGHT',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
          location: ARMADA_NIGHT_LOCATION,
          address: ARMADA_NIGHT_ADDRESS,
          rsvpEnabled: true,
          visibility: 'ALL',
        },
      });
      created++;
    }
    return { created };
  });

  // --- My subscription URL ---
  app.get('/calendar/subscription', { preHandler: requireAuth }, async (request) => {
    const token = calToken(request.authedUser!.id);
    const base = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
    return { url: `${base}/calendar/feed.ics?token=${token}` };
  });

  // --- The subscription feed (token-auth, scoped). No session. ---
  app.get('/calendar/feed.ics', async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.query);
    const userId = verifyCalToken(token);
    if (!userId) return reply.status(401).send('invalid token');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.status(404).send('unknown');
    const scopes = await visibleScopes({ role: user.role, personId: user.personId });
    const events = await prisma.event.findMany({
      where: { visibility: { in: scopes } },
      orderBy: { startsAt: 'asc' },
    });
    reply.header('content-type', 'text/calendar; charset=utf-8');
    reply.header('content-disposition', 'inline; filename="armada.ics"');
    return toVCalendar(events);
  });

  // --- Single-event .ics download (for "add to calendar") ---
  app.get('/events/:id.ics', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    // Only ALL-visibility events are downloadable without auth; others require a session.
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return reply.status(404).send('not found');
    if (event.visibility !== 'ALL') {
      const user = await getAuthedUser(request);
      if (!user) return reply.status(401).send('unauthenticated');
    }
    reply.header('content-type', 'text/calendar; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="armada-event.ics"`);
    return toVCalendar([event]);
  });
}
