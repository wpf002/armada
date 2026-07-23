/**
 * Role + field vocabulary shared across web/api/worker. Kept as string unions
 * (not a Prisma import) so `packages/shared` stays dependency-free and testable.
 * These mirror the Prisma enums in `packages/db`.
 */

export type Role = 'ADMIN' | 'LEADER' | 'MEMBER';

/** Every field of a Person that a serializer might expose. */
export type PersonField =
  // directory (public to any authenticated viewer)
  | 'firstName'
  | 'lastName'
  | 'preferredName'
  | 'photoUrl'
  | 'churchAffiliation'
  | 'group'
  // contact (scoped)
  | 'phone'
  | 'email'
  | 'address'
  // extended profile (self + admin only)
  | 'maritalStatus'
  | 'occupation'
  | 'bio'
  | 'status'
  | 'attendedBefore'
  | 'heardAboutUs'
  | 'lookingFor';

/** Name/photo/group/church — visible to every authenticated viewer (§6). */
export const DIRECTORY_FIELDS: readonly PersonField[] = [
  'firstName',
  'lastName',
  'preferredName',
  'photoUrl',
  'churchAffiliation',
  'group',
];

/** Phone/email/address — self, admin, the subject's group leader, or a mentor
 *  of the subject (own mentees + their groups). */
export const CONTACT_FIELDS: readonly PersonField[] = ['phone', 'email', 'address'];

/** Marital status, occupation, bio, status, and intake answers — self + admin. */
export const EXTENDED_PROFILE_FIELDS: readonly PersonField[] = [
  'maritalStatus',
  'occupation',
  'bio',
  'status',
  'attendedBefore',
  'heardAboutUs',
  'lookingFor',
];

/** Capability actions gated by `can()` (distinct from field visibility). */
export type Action =
  | 'group.manageMembership'
  | 'mentorship.manage'
  | 'user.manage'
  | 'intake.review'
  | 'person.merge'
  | 'event.manage'
  | 'note.view'
  | 'note.create'
  | 'prayer.view';
