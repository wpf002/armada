/**
 * Fillout field map — VERSIONED, keyed by question ID, never by label (§7).
 * Labels get edited ("Martial Status" is misspelled in the live form and
 * someone will fix it); question IDs are stable. When the form changes, add a
 * new version here rather than mutating the old one.
 *
 * PHASE 0: the target-field mapping and normalization intent are captured. The
 * actual Fillout question IDs are filled in during Phase 5 once we read the form
 * metadata (`GET /forms/{formId}/metadata`) — Fillout assigns the IDs, so they
 * must come from the live form, not be invented here.
 */

export const FILLOUT_FORM_ID = 'dHqhm2ovxQus';

/** Target person/intake field an answer maps to. */
export type TargetField =
  | 'name' // -> firstName + lastName (split on last space; 3-part -> review queue)
  | 'phone' // normalize to E.164
  | 'email' // lowercase + trim
  | 'address'
  | 'maritalStatus'
  | 'occupation'
  | 'churchAffiliation' // trim (data has "Watermark " with trailing space)
  | 'attendedBefore' // Yes/No -> bool; "\n" -> null
  | 'heardAboutUs' // often names an existing member — use as a match signal
  | 'prayerRequest' // -> Note, visibility = LEADERS
  | 'lookingFor'; // heuristic: mentions of leading/discipling raise WANTS_TO_LEAD

export interface FieldMapEntry {
  /** Fillout question ID — filled from form metadata in Phase 5. */
  questionId: string | null;
  /** Human label as last seen on the form, for reference only. */
  label: string;
  target: TargetField;
}

/** Ordered by the current registration form. Fill `questionId` in Phase 5. */
export const FIELD_MAP_V1: FieldMapEntry[] = [
  { questionId: null, label: 'Name', target: 'name' },
  { questionId: null, label: 'Phone Number', target: 'phone' },
  { questionId: null, label: 'Email', target: 'email' },
  { questionId: null, label: 'Address', target: 'address' },
  { questionId: null, label: 'Martial Status', target: 'maritalStatus' },
  { questionId: null, label: 'Job Occupation', target: 'occupation' },
  { questionId: null, label: 'Church Affiliation', target: 'churchAffiliation' },
  { questionId: null, label: 'Attended Before?', target: 'attendedBefore' },
  { questionId: null, label: 'How did you hear about us?', target: 'heardAboutUs' },
  { questionId: null, label: 'Prayer Requests', target: 'prayerRequest' },
  { questionId: null, label: 'What are you looking for in Armada?', target: 'lookingFor' },
];

export const FIELD_MAP = FIELD_MAP_V1;
