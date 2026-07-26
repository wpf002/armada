import { describe, expect, it } from 'vitest';
import { deriveGroupDisplayName, groupPossessive } from './group-name';

const p = (firstName: string, lastName: string, preferredName?: string) => ({
  firstName,
  lastName,
  preferredName,
});

describe('deriveGroupDisplayName', () => {
  it('names a leaderless group', () => {
    expect(deriveGroupDisplayName([])).toBe('Unassigned Group');
  });

  it('makes a single leader possessive', () => {
    expect(deriveGroupDisplayName([p('Kyle', 'Sullivan')])).toBe("Kyle Sullivan's Group");
  });

  it('joins two co-leaders (invariant #9)', () => {
    expect(deriveGroupDisplayName([p('Britt', 'Neel'), p('Matt', 'Newville')])).toBe(
      'Britt Neel & Matt Newville',
    );
  });

  it('comma-joins three or more, ampersand before the last', () => {
    expect(
      deriveGroupDisplayName([p('A', 'One'), p('B', 'Two'), p('C', 'Three')]),
    ).toBe('A One, B Two & C Three');
  });

  it('prefers a preferred name', () => {
    expect(deriveGroupDisplayName([p('Robert', 'White', 'Bob')])).toBe("Bob White's Group");
  });
});

describe('groupPossessive', () => {
  it('leaves an already-possessive single-leader name alone', () => {
    // Appending here would read "Kyle Sullivan's Group's Group".
    expect(groupPossessive("Kyle Sullivan's Group")).toBe("Kyle Sullivan's Group");
  });

  it('leaves the unassigned name alone', () => {
    expect(groupPossessive('Unassigned Group')).toBe('Unassigned Group');
  });

  it('adds the suffix to a co-led name', () => {
    expect(groupPossessive('Britt Neel & Matt Newville')).toBe(
      "Britt Neel & Matt Newville's Group",
    );
  });

  it('adds the suffix to a three-leader name', () => {
    expect(groupPossessive('A One, B Two & C Three')).toBe("A One, B Two & C Three's Group");
  });

  it('capitalises Group consistently across both shapes', () => {
    const single = groupPossessive(deriveGroupDisplayName([p('Kyle', 'Sullivan')]));
    const coLed = groupPossessive(
      deriveGroupDisplayName([p('Britt', 'Neel'), p('Matt', 'Newville')]),
    );
    for (const name of [single, coLed]) expect(name.endsWith('Group')).toBe(true);
  });

  it('falls back rather than emitting a bare apostrophe', () => {
    expect(groupPossessive('   ')).toBe('the group');
  });

  it('round-trips every derived shape without doubling "Group"', () => {
    const shapes = [
      deriveGroupDisplayName([]),
      deriveGroupDisplayName([p('Kyle', 'Sullivan')]),
      deriveGroupDisplayName([p('Britt', 'Neel'), p('Matt', 'Newville')]),
      deriveGroupDisplayName([p('A', 'One'), p('B', 'Two'), p('C', 'Three')]),
    ];
    for (const s of shapes) {
      expect(groupPossessive(s).match(/group/gi)?.length).toBe(1);
    }
  });
});
