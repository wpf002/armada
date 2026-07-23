/**
 * The permission model (§6). Field visibility is a single function,
 * `visibleFieldsFor(viewer, subject) -> Set<PersonField>`, called by every
 * serializer. Capability actions go through `can(viewer, action, ctx)`.
 *
 * NEVER enforce visibility in the UI layer (CLAUDE.md). "Mentor" is not a stored
 * role — it is derived from having an active MentorRelationship, so the viewer
 * carries its mentee set rather than a role flag.
 */

import {
  type Action,
  type PersonField,
  type Role,
  CONTACT_FIELDS,
  DIRECTORY_FIELDS,
  EXTENDED_PROFILE_FIELDS,
} from './roles';

/**
 * Everything about the viewer needed to resolve scope. Computed once per request
 * from active edges (memberships / mentorships), never from a stored "type".
 */
export interface Viewer {
  personId: string;
  role: Role;
  /** Group ids where the viewer holds an active LEADER or CO_LEADER membership. */
  leaderGroupIds: string[];
  /** Person ids of the viewer's active mentees. */
  menteePersonIds: string[];
  /** Group ids that the viewer's mentees actively lead (mentee "own groups"). */
  menteeGroupIds: string[];
}

/** The subject being viewed, with the group ids they're an active member of. */
export interface SubjectContext {
  personId: string;
  /** Group ids where the subject holds any active membership. */
  groupIds: string[];
}

function intersects(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/** The relationship between a viewer and a subject, derived from active edges. */
export interface Relationship {
  isSelf: boolean;
  isAdmin: boolean;
  /** Viewer leads a group the subject is an active member of. */
  leadsSubject: boolean;
  /** Subject is the viewer's mentee, or is in a group one of the viewer's
   *  mentees leads (own mentees + their groups). */
  mentorsSubject: boolean;
}

export function relationshipBetween(viewer: Viewer, subject: SubjectContext): Relationship {
  const isSelf = viewer.personId === subject.personId;
  const isAdmin = viewer.role === 'ADMIN';
  const leadsSubject = intersects(viewer.leaderGroupIds, subject.groupIds);
  const mentorsSubject =
    viewer.menteePersonIds.includes(subject.personId) ||
    intersects(viewer.menteeGroupIds, subject.groupIds);
  return { isSelf, isAdmin, leadsSubject, mentorsSubject };
}

/** Whether the viewer has scoped contact/prayer/notes access to the subject. */
function hasScopedAccess(rel: Relationship): boolean {
  return rel.isSelf || rel.isAdmin || rel.leadsSubject || rel.mentorsSubject;
}

/**
 * The set of Person fields a viewer may see on a subject. The ONE place field
 * visibility is decided.
 */
export function visibleFieldsFor(viewer: Viewer, subject: SubjectContext): Set<PersonField> {
  const rel = relationshipBetween(viewer, subject);
  const fields = new Set<PersonField>(DIRECTORY_FIELDS);

  // Contact info: self, admin, the subject's leader, or a mentor of the subject.
  if (hasScopedAccess(rel)) {
    for (const f of CONTACT_FIELDS) fields.add(f);
  }

  // Extended profile (marital status, occupation, bio, intake answers): the
  // person themselves and admins only — the matrix grants no one else these.
  if (rel.isSelf || rel.isAdmin) {
    for (const f of EXTENDED_PROFILE_FIELDS) fields.add(f);
  }

  return fields;
}

/**
 * Capability check for actions (§6). Membership management is scoped to the
 * specific group; everything else administrative is admin-only.
 */
export function can(
  viewer: Viewer,
  action: Action,
  ctx?: { subject?: SubjectContext; groupId?: string },
): boolean {
  const isAdmin = viewer.role === 'ADMIN';

  switch (action) {
    // Admin-only capabilities.
    case 'mentorship.manage':
    case 'user.manage':
    case 'intake.review':
    case 'person.merge':
    case 'event.manage':
      return isAdmin;

    // Manage membership of a specific group: admin, or a leader of that group.
    case 'group.manageMembership':
      if (isAdmin) return true;
      return ctx?.groupId != null && viewer.leaderGroupIds.includes(ctx.groupId);

    // View / create notes and view prayer requests: scoped access to the subject.
    case 'note.view':
    case 'note.create':
    case 'prayer.view': {
      if (!ctx?.subject) return isAdmin;
      const rel = relationshipBetween(viewer, ctx.subject);
      // prayer requests are also visible to the person themselves (§ invariant 6);
      // notes are not authored-about-self viewable by default, but scoped access
      // already covers leader/mentor/admin. Self may view their own prayer.
      if (action === 'prayer.view' && rel.isSelf) return true;
      return rel.isAdmin || rel.leadsSubject || rel.mentorsSubject;
    }

    default:
      return false;
  }
}
