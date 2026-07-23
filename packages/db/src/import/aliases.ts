/**
 * Curated identity knowledge for the import (§2 + §8).
 *
 * CONFIRMED_ALIASES are human-confirmed spelling collisions from the roadmap —
 * these are the ONLY silent merges (invariant #5 permits human-confirmed merges,
 * and the roadmap author confirmed these). Everything uncertain goes to PARKED
 * and is surfaced in the review report instead of merged.
 */

/** variant (normalized) -> canonical display name. Confirmed same human. */
export const CONFIRMED_ALIASES: Record<string, string> = {
  // §2 spelling collisions (confirmed pairs)
  'dante kreiger': 'Dante Krieger',
  'dillion everett': 'Dillon Everett',
  'hunter eichberger': 'Hunter Eichenberg',
  'javier hererra': 'Javier Herrera',
  'jon mcguffin': 'John Mcguffin',
  'steven lantz': 'Steven Lanz',
  // Diagram-confirmed correct spellings (§2: diagram is a 2nd independent source)
  'holden phllipus': 'Holden Philippus',
  'robert taafe': 'Robert Taaffe',
};

/**
 * Uncertain pairs — do NOT merge. If both names appear, emit a review item.
 * [nameA, nameB, reason]
 */
export const PARKED_PAIRS: Array<[string, string, string]> = [
  ['Pete Jones', 'Peterson Jones', 'Probable same person — needs confirmation (§12 Q1).'],
  ['Ben Johnson', 'Brett Johnson', 'Probably NOT the same person — verify (§12 Q2).'],
  [
    'Preston Bumgartner',
    'Preston Baumgartner',
    'Diagram says Bumgartner, workbook says Baumgartner — needs a human (§12 Q9).',
  ],
];

/** Placeholder tokens that must never become a real Person. */
export const PLACEHOLDER_NAMES = new Set([
  'pete ???',
  'cameron', // Group 29 disciple with no surname — surface, don't guess
  '???',
]);

/**
 * First-name nickname pairs (§8). Used to EXPAND both sides before fuzzy
 * comparison so nickname variants surface as review candidates — never to
 * auto-merge on their own.
 */
export const NICKNAMES: Array<[string, string]> = [
  ['jon', 'john'],
  ['pete', 'peter'],
  ['zack', 'zach'],
  ['zack', 'zachary'],
  ['matt', 'matthew'],
  ['tim', 'timothy'],
  ['ben', 'benjamin'],
  ['mike', 'michael'],
  ['chris', 'christopher'],
  ['nate', 'nathan'],
  ['nate', 'nathaniel'],
  ['alex', 'alexander'],
  ['will', 'william'],
  ['dan', 'daniel'],
  ['danny', 'daniel'],
  ['joe', 'joseph'],
  ['tom', 'thomas'],
  ['nick', 'nicholas'],
  ['sam', 'samuel'],
  ['josh', 'joshua'],
  ['andy', 'andrew'],
  ['drew', 'andrew'],
  ['greg', 'gregory'],
  ['rob', 'robert'],
  ['bob', 'robert'],
  ['jim', 'james'],
  ['jimmy', 'james'],
  ['jeff', 'jeffrey'],
  ['dave', 'david'],
  ['steve', 'steven'],
  ['cy', 'cyrus'],
];

/** Build a nickname lookup: name -> set of equivalent canonical forms. */
export function nicknameExpansions(first: string): Set<string> {
  const f = first.toLowerCase();
  const out = new Set<string>([f]);
  for (const [a, b] of NICKNAMES) {
    if (f === a) out.add(b);
    if (f === b) out.add(a);
  }
  return out;
}
