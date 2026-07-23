/**
 * Ingest normalizers. Watch for `"\n"` as a literal string for empty answers,
 * and `\xa0` non-breaking spaces (§7). Normalize both at ingest.
 */

// NBSP, BOM / zero-width no-break, and zero-width space.
const IRREGULAR_WHITESPACE = /[\u00A0\uFEFF\u200B]/g;

/** Collapse NBSP / BOM / zero-width, trim, and treat the literal "\n"
 *  empty-answer sentinel as null. */
export function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.replace(IRREGULAR_WHITESPACE, ' ').trim();
  if (cleaned === '' || cleaned === '\\n' || cleaned === '\n') return null;
  return cleaned;
}

/** Lowercase + trim an email; null if empty. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.toLowerCase() : null;
}

/**
 * Best-effort E.164 for US numbers. Digits only; prefix +1 for 10-digit,
 * keep 11-digit starting with 1. Returns null if it can't be made sensible —
 * never guess a wrong number into the graph.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (cleaned.startsWith('+')) return cleaned;
  return null;
}

/** Yes/No -> boolean; anything empty/unknown -> null. */
export function parseYesNo(value: string | null | undefined): boolean | null {
  const cleaned = cleanText(value)?.toLowerCase();
  if (!cleaned) return null;
  if (cleaned.startsWith('y')) return true;
  if (cleaned.startsWith('n')) return false;
  return null;
}

/** Split a full name on the LAST space. 3+ parts are flagged for the review queue. */
export function splitName(value: string | null | undefined): {
  firstName: string;
  lastName: string;
  needsReview: boolean;
} | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '', needsReview: true };
  const lastName = parts[parts.length - 1]!;
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName, needsReview: parts.length > 2 };
}
