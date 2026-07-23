/**
 * Derived group display name — the ONE place this is computed (invariant #8).
 *
 * A group is identified by its leaders, not by a number. The stored `name`
 * ("Group 10") is an optional internal label only. List, detail, search, and
 * export must all call this so they never disagree.
 *
 * Co-leadership is the default assumption (invariant #9): callers always pass an
 * array of the group's *active* leaders (LEADER or CO_LEADER, `leftAt` null).
 */

export interface LeaderName {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}

function displayName(p: LeaderName): string {
  const first = p.preferredName?.trim() || p.firstName.trim();
  return `${first} ${p.lastName.trim()}`.trim();
}

/**
 * @param activeLeaders active LEADER / CO_LEADER memberships' people, any order.
 * @returns e.g. "Kyle Sullivan & Dillon Everett", "Kyle Sullivan's group",
 *          or "Unassigned group" when there is no active leader.
 */
export function deriveGroupDisplayName(activeLeaders: LeaderName[]): string {
  const names = activeLeaders.map(displayName).filter(Boolean);

  if (names.length === 0) return 'Unassigned group';
  if (names.length === 1) return `${names[0]}'s group`;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;

  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')} & ${last}`;
}
