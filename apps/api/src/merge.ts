/**
 * Person merge (§8) — a first-class admin operation.
 *
 * Reassigns every edge from `sourceId` onto `intoId`, preserves history (no hard
 * deletes — memberships/mentorships keep their rows), leaves a `mergedIntoId`
 * tombstone so old links resolve forward, and writes an audit log. Runs in a
 * single transaction. Respects the partial-unique invariants: when both people
 * hold the same active edge, the source's copy is ended rather than duplicated.
 */
import { prisma } from '@armada/db';

const ENRICHABLE = [
  'email',
  'phone',
  'address',
  'maritalStatus',
  'occupation',
  'churchAffiliation',
  'photoUrl',
  'bio',
  'preferredName',
  'heardAboutUs',
  'lookingFor',
  'attendedBefore',
] as const;

export async function mergePeople(actorId: string | null, sourceId: string, intoId: string) {
  if (sourceId === intoId) throw new Error('cannot merge a person into themselves');

  return prisma.$transaction(async (tx) => {
    const source = await tx.person.findUnique({ where: { id: sourceId } });
    const target = await tx.person.findUnique({ where: { id: intoId } });
    if (!source) throw new Error(`source person ${sourceId} not found`);
    if (!target) throw new Error(`target person ${intoId} not found`);
    if (source.mergedIntoId) throw new Error(`source ${sourceId} was already merged`);

    const now = new Date();

    // --- Group memberships: repoint; end the source copy on active conflict ---
    for (const m of await tx.groupMembership.findMany({ where: { personId: sourceId } })) {
      if (m.leftAt === null) {
        const conflict = await tx.groupMembership.findFirst({
          where: { groupId: m.groupId, personId: intoId, leftAt: null },
        });
        if (conflict) {
          await tx.groupMembership.update({ where: { id: m.id }, data: { leftAt: now } });
          continue;
        }
      }
      await tx.groupMembership.update({ where: { id: m.id }, data: { personId: intoId } });
    }

    // --- Mentorships (as mentor) ---
    for (const e of await tx.mentorRelationship.findMany({ where: { mentorId: sourceId } })) {
      if (e.menteeId === intoId) {
        // would become self-mentorship → end it
        if (e.endedAt === null) await tx.mentorRelationship.update({ where: { id: e.id }, data: { endedAt: now } });
        continue;
      }
      if (e.endedAt === null) {
        const conflict = await tx.mentorRelationship.findFirst({
          where: { mentorId: intoId, menteeId: e.menteeId, endedAt: null },
        });
        if (conflict) {
          await tx.mentorRelationship.update({ where: { id: e.id }, data: { endedAt: now } });
          continue;
        }
      }
      await tx.mentorRelationship.update({ where: { id: e.id }, data: { mentorId: intoId } });
    }

    // --- Mentorships (as mentee) ---
    for (const e of await tx.mentorRelationship.findMany({ where: { menteeId: sourceId } })) {
      if (e.mentorId === intoId) {
        if (e.endedAt === null) await tx.mentorRelationship.update({ where: { id: e.id }, data: { endedAt: now } });
        continue;
      }
      if (e.endedAt === null) {
        const conflict = await tx.mentorRelationship.findFirst({
          where: { mentorId: e.mentorId, menteeId: intoId, endedAt: null },
        });
        if (conflict) {
          await tx.mentorRelationship.update({ where: { id: e.id }, data: { endedAt: now } });
          continue;
        }
      }
      await tx.mentorRelationship.update({ where: { id: e.id }, data: { menteeId: intoId } });
    }

    // --- Simple repoints ---
    await tx.interest.updateMany({ where: { personId: sourceId }, data: { personId: intoId } });
    await tx.followUp.updateMany({ where: { subjectId: sourceId }, data: { subjectId: intoId } });
    await tx.followUp.updateMany({ where: { ownerId: sourceId }, data: { ownerId: intoId } });
    await tx.note.updateMany({ where: { subjectId: sourceId }, data: { subjectId: intoId } });
    await tx.formSubmission.updateMany({ where: { personId: sourceId }, data: { personId: intoId } });

    // --- Event RSVPs (unique per event+person): repoint, dedupe on conflict ---
    for (const r of await tx.eventRsvp.findMany({ where: { personId: sourceId } })) {
      const conflict = await tx.eventRsvp.findFirst({
        where: { eventId: r.eventId, personId: intoId },
      });
      if (conflict) await tx.eventRsvp.delete({ where: { id: r.id } });
      else await tx.eventRsvp.update({ where: { id: r.id }, data: { personId: intoId } });
    }

    // --- Enrich target NULLs from source, then tombstone source ---
    const enrich: Record<string, unknown> = {};
    for (const f of ENRICHABLE) {
      if (target[f] == null && source[f] != null) enrich[f] = source[f];
    }
    if (Object.keys(enrich).length > 0) {
      await tx.person.update({ where: { id: intoId }, data: enrich });
    }

    // Free the source email so the unique constraint doesn't block the tombstone.
    const merged = await tx.person.update({
      where: { id: sourceId },
      data: { mergedIntoId: intoId, status: 'REMOVED', email: null },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'person.merge',
        entity: 'Person',
        entityId: sourceId,
        before: JSON.parse(JSON.stringify({ source, target })),
        after: JSON.parse(JSON.stringify({ mergedIntoId: intoId, enriched: enrich })),
      },
    });

    return { sourceId, intoId, tombstone: merged.mergedIntoId };
  });
}
