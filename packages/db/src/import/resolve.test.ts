import { describe, expect, it } from 'vitest';
import {
  canonicalDisplayName,
  levenshtein,
  nameSimilarity,
  nicknameEquivalent,
  scoreCandidates,
  splitName,
  type CandidatePerson,
} from './resolve';

describe('canonicalDisplayName (confirmed aliases §2)', () => {
  it('canonicalizes confirmed collisions', () => {
    expect(canonicalDisplayName('Dillion Everett')).toBe('Dillon Everett');
    expect(canonicalDisplayName('Holden Phllipus')).toBe('Holden Philippus');
    expect(canonicalDisplayName('Robert Taafe')).toBe('Robert Taaffe');
    expect(canonicalDisplayName('Jon Mcguffin')).toBe('John Mcguffin');
  });
  it('leaves unknown names untouched (but trims NBSP/space)', () => {
    expect(canonicalDisplayName('  Kyle   Sullivan ')).toBe('Kyle Sullivan');
    expect(canonicalDisplayName('James ')).toBe('James');
  });
});

describe('splitName (last-space split)', () => {
  it('splits on the last space', () => {
    expect(splitName('Kyle Sullivan')).toEqual({ firstName: 'Kyle', lastName: 'Sullivan' });
    expect(splitName('Mary Jane Watson')).toEqual({ firstName: 'Mary Jane', lastName: 'Watson' });
  });
  it('single token has empty last name', () => {
    expect(splitName('Cameron')).toEqual({ firstName: 'Cameron', lastName: '' });
  });
});

describe('levenshtein + similarity', () => {
  it('measures edit distance', () => {
    expect(levenshtein('herrera', 'hererra')).toBe(2);
    expect(nameSimilarity('Javier Herrera', 'Javier Hererra')).toBeGreaterThan(0.85);
  });
});

describe('nicknameEquivalent (§8)', () => {
  it('matches nickname first names with same last name', () => {
    expect(nicknameEquivalent('Jon Smith', 'John Smith')).toBe(true);
    expect(nicknameEquivalent('Zack Jones', 'Zachary Jones')).toBe(true);
  });
  it('does not match different last names', () => {
    expect(nicknameEquivalent('Jon Smith', 'John Baker')).toBe(false);
  });
});

describe('scoreCandidates thresholds (§8)', () => {
  const people: CandidatePerson[] = [
    { id: 'a', firstName: 'Javier', lastName: 'Herrera', email: 'jh@x.com', phone: null, churchAffiliation: 'Watermark' },
    { id: 'b', firstName: 'Kyle', lastName: 'Sullivan', email: null, phone: '+12145551212', churchAffiliation: null },
  ];

  it('exact email scores 1.0 (auto-link band)', () => {
    const [top] = scoreCandidates({ name: 'Whatever', email: 'jh@x.com' }, people);
    expect(top?.score).toBe(1.0);
  });
  it('exact phone scores 0.95', () => {
    const [top] = scoreCandidates({ name: 'K S', phone: '+12145551212' }, people);
    expect(top?.score).toBe(0.95);
  });
  it('fuzzy name lands in the review band, capped below 0.95', () => {
    const [top] = scoreCandidates({ name: 'Javier Hererra', church: 'Watermark' }, people);
    expect(top?.score).toBeGreaterThanOrEqual(0.6);
    expect(top?.score).toBeLessThan(0.95);
  });
});
