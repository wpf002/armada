/**
 * Identity resolution for the import (§8).
 *
 * Scoring, strongest first:
 *   1. exact email (normalized)                       -> 1.0
 *   2. exact phone (E.164)                            -> 0.95
 *   3. exact normalized full name                     -> 0.85
 *   4. Levenshtein on full name >= 0.85               -> 0.6 (+church +heardAbout)
 *   5. nickname expansion before comparing
 *
 * Behavior: >= 0.95 auto-link · 0.6–0.95 NEEDS_REVIEW · < 0.6 create new PROSPECT.
 * The bulk import additionally treats a confirmed curated alias or an exact
 * normalized-name hit as the same person (the workbook is one org's dataset),
 * and records every such link in the report. No fuzzy match ever auto-merges.
 */

import { CONFIRMED_ALIASES, nicknameExpansions } from './aliases';

/** Trim, collapse whitespace, strip NBSP, lowercase for comparison. */
export function normalizeName(raw: string): string {
  return raw
    .replace(/[\u00A0\uFEFF\u200B]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Apply a confirmed alias, returning the canonical DISPLAY name (or the input). */
export function canonicalDisplayName(raw: string): string {
  const key = normalizeName(raw);
  return CONFIRMED_ALIASES[key] ?? raw.replace(/[\u00A0\uFEFF\u200B]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function splitName(display: string): { firstName: string; lastName: string } {
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1]! };
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]!;
  }
  return prev[n]!;
}

/** Similarity in [0,1] = 1 - dist/maxLen. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/** True if two full names are nickname-equivalent (same last name, nickname first). */
export function nicknameEquivalent(a: string, b: string): boolean {
  const sa = splitName(a);
  const sb = splitName(b);
  if (normalizeName(sa.lastName) !== normalizeName(sb.lastName)) return false;
  if (!sa.lastName || !sb.lastName) return false;
  const ea = nicknameExpansions(sa.firstName);
  const eb = nicknameExpansions(sb.firstName);
  for (const x of ea) if (eb.has(x)) return true;
  return false;
}

export interface MatchCandidate {
  personId: string;
  score: number;
  reason: string;
}

/** A minimal person shape the matcher compares against. */
export interface CandidatePerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  churchAffiliation: string | null;
}

function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/**
 * Score a source record against existing persons (§8). Returns candidates sorted
 * by score desc. Does not decide — the caller applies the auto-link / review /
 * create thresholds.
 */
export function scoreCandidates(
  source: {
    name: string;
    email?: string | null;
    phone?: string | null;
    church?: string | null;
  },
  existing: CandidatePerson[],
): MatchCandidate[] {
  const srcName = canonicalDisplayName(source.name);
  const out: MatchCandidate[] = [];

  for (const p of existing) {
    const pName = fullName(p);
    // 1. email
    if (source.email && p.email && source.email.toLowerCase() === p.email.toLowerCase()) {
      out.push({ personId: p.id, score: 1.0, reason: 'exact email' });
      continue;
    }
    // 2. phone
    if (source.phone && p.phone && source.phone === p.phone) {
      out.push({ personId: p.id, score: 0.95, reason: 'exact phone' });
      continue;
    }
    // 3. exact normalized name
    if (normalizeName(srcName) === normalizeName(pName)) {
      out.push({ personId: p.id, score: 0.85, reason: 'exact normalized name' });
      continue;
    }
    // 4/5. fuzzy + nickname
    const sim = nameSimilarity(srcName, pName);
    const nick = nicknameEquivalent(srcName, pName);
    if (sim >= 0.85 || nick) {
      let score = nick ? 0.7 : 0.6;
      let reason = nick ? `nickname-equivalent (${pName})` : `fuzzy name ${sim.toFixed(2)} (${pName})`;
      if (source.church && p.churchAffiliation && source.church.trim().toLowerCase() === p.churchAffiliation.trim().toLowerCase()) {
        score += 0.15;
        reason += ' +same church';
      }
      out.push({ personId: p.id, score: Math.min(score, 0.94), reason });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}
