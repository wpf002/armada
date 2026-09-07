/**
 * The discipleship pipeline board, in order.
 *
 * The board and every count that asks "is this person still waiting?" read from
 * here, so adding a stage is a one-line change rather than a hunt through nine
 * hard-coded status lists.
 */
export const INTEREST_STAGES = [
  { key: 'OPEN', label: 'Open' },
  // Stored as IN_PROGRESS since before the board had names; Armada calls it Onboarding.
  { key: 'IN_PROGRESS', label: 'Onboarding' },
  { key: 'PLACED', label: 'Placed' },
] as const;

export type InterestStage = (typeof INTEREST_STAGES)[number]['key'];

/**
 * Every status an interest can hold, including the off-board one and
 * ONBOARDED — retired as a stage (Armada treats onboarded as placed) but kept
 * valid so historical rows and audit entries still parse.
 *
 * Spelled out rather than derived from INTEREST_STAGES: `zod` and Prisma both
 * need a literal tuple, and mapping over the stages widens it to `string[]`.
 * The assertion below fails the build if the two ever drift apart.
 */
export const INTEREST_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'ONBOARDED',
  'PLACED',
  'DECLINED',
] as const;

export type InterestStatus = (typeof INTEREST_STATUSES)[number];

// Compile-time guard: every board stage must be a real status.
type _StagesAreStatuses = InterestStage extends InterestStatus ? true : never;
const _stagesAreStatuses: _StagesAreStatuses = true;
void _stagesAreStatuses;

/**
 * Someone is still in the pipeline until they're placed or declined. Used for
 * "wants discipleship" counts, the unassigned sweep, and duplicate checks, so
 * a person mid-onboarding is never double-added or reported as falling through.
 */
export const UNRESOLVED_INTEREST_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

/** Unresolved, plus PLACED — "already has this interest on record somewhere". */
export const EXISTING_INTEREST_STATUSES = ['OPEN', 'IN_PROGRESS', 'PLACED'] as const;

/** Reaching one of these ends the interest, so it stamps `resolvedAt`. */
export const RESOLVED_INTEREST_STATUSES = ['PLACED', 'DECLINED'] as const;
