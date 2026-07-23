/**
 * Armada xlsx importer (Phase 2).
 *
 *   pnpm --filter @armada/db import:xlsx -- [path] [--fresh]
 *
 * Reads the five sheets, resolves identities (§8), and writes the relationship
 * graph: Person rows, GroupMembership + MentorRelationship edges, Interests, and
 * prayer Notes. Produces a created/matched/needs-review/conflicts report.
 *
 * Idempotent: matches persons by email or exact normalized name, groups by name,
 * and every edge by its natural tuple — running twice changes nothing.
 * Invariant #11: the Pods column is dropped outright (never read into the graph).
 */
import { resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import ExcelJS from 'exceljs';
import type { MaritalStatus } from '../../generated/client';
import { prisma } from '../index';
import {
  canonicalDisplayName,
  normalizeName,
  splitName,
  scoreCandidates,
  type CandidatePerson,
} from './resolve';
import { PARKED_PAIRS, PLACEHOLDER_NAMES } from './aliases';
import { ImportReport } from './report';

const DEFAULT_PATH = resolvePath(homedir(), 'Downloads', 'Armada Leaders Info.xlsx');

// ------------------------------------------------------------------ helpers
type Cell = ExcelJS.CellValue;

function cellStr(v: Cell): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.replace(/[\u00A0\uFEFF\u200B]/g, ' ').replace(/\s+/g, ' ').trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof o.text === 'string') return cellStr(o.text);
    if (o.richText) return cellStr(o.richText.map((r) => r.text).join(''));
    if (o.result != null) return cellStr(o.result as Cell);
  }
  return null;
}

function isEmptyAnswer(s: string | null): boolean {
  return !s || s === '\\n' || s === '\n' || s.toLowerCase() === 'none';
}

function splitList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.replace(/[\u00A0\uFEFF\u200B]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeEmail(s: string | null): string | null {
  if (isEmptyAnswer(s)) return null;
  return s!.toLowerCase().trim();
}

function normalizePhone(s: string | null): string | null {
  if (isEmptyAnswer(s)) return null;
  const digits = s!.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return s!.trim() || null;
}

function parseYesNo(s: string | null): boolean | null {
  if (isEmptyAnswer(s)) return null;
  const t = s!.toLowerCase();
  if (t.startsWith('y')) return true;
  if (t.startsWith('n')) return false;
  return null;
}

const MARITAL: Record<string, MaritalStatus> = {
  single: 'SINGLE',
  married: 'MARRIED',
  engaged: 'ENGAGED',
  divorced: 'DIVORCED',
  widowed: 'WIDOWED',
};
function parseMarital(s: string | null): MaritalStatus | null {
  if (isEmptyAnswer(s)) return null;
  return MARITAL[s!.toLowerCase().trim()] ?? null;
}

function isPlaceholder(name: string): boolean {
  // A real person's name never contains '?' or '/' — those are divider/status
  // cells (e.g. Mentors sheet "Reassessment/Reassignment", "Pete ???").
  return PLACEHOLDER_NAMES.has(normalizeName(name)) || /[?/]/.test(name);
}

// ---------------------------------------------------------- person registry
interface PersonExtra {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  maritalStatus?: MaritalStatus | null;
  occupation?: string | null;
  churchAffiliation?: string | null;
  attendedBefore?: boolean | null;
  heardAboutUs?: string | null;
  lookingFor?: string | null;
  status?: 'PROSPECT' | 'ACTIVE';
}

class Registry {
  private byId = new Map<string, CandidatePerson>();
  private byEmail = new Map<string, string>();
  private byName = new Map<string, string>();

  constructor(private report: ImportReport) {}

  async load() {
    const people = await prisma.person.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        churchAffiliation: true,
      },
    });
    for (const p of people) this.index(p);
  }

  private index(p: CandidatePerson) {
    this.byId.set(p.id, p);
    if (p.email) this.byEmail.set(p.email.toLowerCase(), p.id);
    this.byName.set(normalizeName(`${p.firstName} ${p.lastName}`), p.id);
  }

  all(): CandidatePerson[] {
    return [...this.byId.values()];
  }

  /** Resolve to an existing person (email or exact normalized name) or create. */
  async getOrCreate(rawName: string, extra: PersonExtra = {}): Promise<string | null> {
    if (isPlaceholder(rawName)) return null;
    const display = canonicalDisplayName(rawName);
    const { firstName, lastName } = splitName(display);
    if (!firstName) return null;

    const email = normalizeEmail(extra.email ?? null);
    const nameKey = normalizeName(display);

    // 1. exact email
    let id = email ? this.byEmail.get(email) : undefined;
    // 2. exact normalized name
    if (!id) id = this.byName.get(nameKey);

    if (id) {
      const reason = email && this.byEmail.get(email) === id ? 'exact email' : 'exact normalized name';
      this.report.matched(display, id, reason);
      await this.enrich(id, firstName, lastName, extra, email);
      return id;
    }

    // create
    if (lastName === '' && !isPlaceholder(rawName)) {
      this.report.review({ kind: 'three-part-name', detail: `Single-token name "${display}" — verify surname.`, names: [display] });
    }
    const created = await prisma.person.create({
      data: {
        firstName,
        lastName,
        email,
        phone: normalizePhone(extra.phone ?? null),
        address: isEmptyAnswer(extra.address ?? null) ? null : extra.address ?? null,
        maritalStatus: extra.maritalStatus ?? null,
        occupation: isEmptyAnswer(extra.occupation ?? null) ? null : extra.occupation ?? null,
        churchAffiliation: isEmptyAnswer(extra.churchAffiliation ?? null)
          ? null
          : extra.churchAffiliation ?? null,
        attendedBefore: extra.attendedBefore ?? null,
        heardAboutUs: isEmptyAnswer(extra.heardAboutUs ?? null) ? null : extra.heardAboutUs ?? null,
        lookingFor: isEmptyAnswer(extra.lookingFor ?? null) ? null : extra.lookingFor ?? null,
        status: extra.status ?? 'PROSPECT',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        churchAffiliation: true,
      },
    });
    this.index(created);
    this.report.created(display);
    return created.id;
  }

  /** Fill NULL fields only — never overwrite existing values (invariant #4 spirit). */
  private async enrich(
    id: string,
    firstName: string,
    lastName: string,
    extra: PersonExtra,
    email: string | null,
  ) {
    const cur = await prisma.person.findUnique({ where: { id } });
    if (!cur) return;
    const data: Record<string, unknown> = {};
    if (!cur.email && email) data.email = email;
    if (!cur.phone && normalizePhone(extra.phone ?? null)) data.phone = normalizePhone(extra.phone ?? null);
    if (!cur.address && !isEmptyAnswer(extra.address ?? null)) data.address = extra.address;
    if (!cur.maritalStatus && extra.maritalStatus) data.maritalStatus = extra.maritalStatus;
    if (!cur.occupation && !isEmptyAnswer(extra.occupation ?? null)) data.occupation = extra.occupation;
    if (!cur.churchAffiliation && !isEmptyAnswer(extra.churchAffiliation ?? null))
      data.churchAffiliation = extra.churchAffiliation;
    if (cur.attendedBefore == null && extra.attendedBefore != null)
      data.attendedBefore = extra.attendedBefore;
    if (!cur.heardAboutUs && !isEmptyAnswer(extra.heardAboutUs ?? null))
      data.heardAboutUs = extra.heardAboutUs;
    if (!cur.lookingFor && !isEmptyAnswer(extra.lookingFor ?? null)) data.lookingFor = extra.lookingFor;
    // A leader/disciple appearing in the workbook is at least ACTIVE.
    if (cur.status === 'PROSPECT' && extra.status === 'ACTIVE') data.status = 'ACTIVE';
    if (email && cur.email && cur.email.toLowerCase() !== email) {
      this.report.review({
        kind: 'fuzzy-duplicate',
        detail: `Name "${firstName} ${lastName}" matched person ${id} but source email ${email} differs from ${cur.email}.`,
      });
    }
    if (Object.keys(data).length > 0) {
      await prisma.person.update({ where: { id }, data });
    }
  }
}

// -------------------------------------------------------------- edge helpers
async function ensureGroupByName(name: string): Promise<string> {
  const existing = await prisma.discipleshipGroup.findFirst({ where: { name } });
  if (existing) return existing.id;
  const g = await prisma.discipleshipGroup.create({ data: { name, status: 'ACTIVE' } });
  return g.id;
}

async function ensureMembership(
  groupId: string,
  personId: string,
  role: 'LEADER' | 'CO_LEADER' | 'DISCIPLE',
): Promise<'created' | 'exists'> {
  const existing = await prisma.groupMembership.findFirst({
    where: { groupId, personId, leftAt: null },
  });
  if (existing) return 'exists';
  await prisma.groupMembership.create({ data: { groupId, personId, role } });
  return 'created';
}

async function ensureMentorEdge(mentorId: string, menteeId: string): Promise<'created' | 'exists' | 'self'> {
  if (mentorId === menteeId) return 'self';
  const existing = await prisma.mentorRelationship.findFirst({
    where: { mentorId, menteeId, endedAt: null },
  });
  if (existing) return 'exists';
  await prisma.mentorRelationship.create({ data: { mentorId, menteeId } });
  return 'created';
}

async function ensureInterest(
  personId: string,
  type: 'WANTS_DISCIPLESHIP' | 'WANTS_TO_LEAD' | 'WANTS_MENTOR',
  notes?: string | null,
): Promise<void> {
  const existing = await prisma.interest.findFirst({
    where: { personId, type, status: { in: ['OPEN', 'IN_PROGRESS'] } },
  });
  if (existing) return;
  await prisma.interest.create({
    data: { personId, type, status: 'OPEN', notes: isEmptyAnswer(notes ?? null) ? null : notes },
  });
}

async function ensurePrayerNote(subjectId: string, body: string): Promise<void> {
  const existing = await prisma.note.findFirst({ where: { subjectId, body, authorId: 'import' } });
  if (existing) return;
  await prisma.note.create({
    data: { subjectId, authorId: 'import', body, visibility: 'LEADERS' },
  });
}

// ------------------------------------------------------------------- import
async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const pathArg = args.find((a) => !a.startsWith('--'));
  const filePath = pathArg ? resolvePath(pathArg) : DEFAULT_PATH;

  const report = new ImportReport();

  if (fresh) {
    console.log('--fresh: clearing imported graph (keeps auth/users)...');
    await prisma.note.deleteMany({ where: { authorId: 'import' } });
    await prisma.interest.deleteMany();
    await prisma.groupMembership.deleteMany();
    await prisma.mentorRelationship.deleteMany();
    await prisma.discipleshipGroup.deleteMany();
    await prisma.person.deleteMany({ where: { user: null } });
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  console.log(`Loaded ${filePath}`);

  const registry = new Registry(report);
  await registry.load();

  // ---- Leaders sheet: A name, B email, C phone, D notes, E Pods(DROP), F mentor, G questionaire, H reach-out
  const leadersSheet = wb.getWorksheet('Leaders');
  const leaderMentorPairs: Array<{ leader: string; mentor: string }> = [];
  const leaderRows: Array<{
    name: string;
    email: string | null;
    phone: string | null;
    mentor: string | null;
  }> = [];
  if (leadersSheet) {
    leadersSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const name = cellStr(row.getCell(1).value);
      if (!name) return;
      const email = cellStr(row.getCell(2).value);
      const phone = cellStr(row.getCell(3).value);
      const mentor = cellStr(row.getCell(6).value); // column E (Pods) intentionally skipped
      // defer async creation
      leaderRows.push({ name, email, phone, mentor });
    });
  }
  // (collected synchronously above; process now)
  for (const r of leaderRows) {
    const id = await registry.getOrCreate(r.name, {
      email: r.email,
      phone: r.phone,
      status: 'ACTIVE',
    });
    if (id) {
      report.count('leaders');
      if (r.mentor && !isPlaceholder(r.mentor)) leaderMentorPairs.push({ leader: r.name, mentor: r.mentor });
    }
  }

  // ---- Groups sheet: A group name, B leaders (csv), C disciples (csv)
  const groupsSheet = wb.getWorksheet('Groups');
  if (groupsSheet) {
    const rows: Array<{ name: string; leaders: string[]; disciples: string[] }> = [];
    groupsSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const name = cellStr(row.getCell(1).value);
      if (!name) return;
      rows.push({
        name,
        leaders: splitList(cellStr(row.getCell(2).value)),
        disciples: splitList(cellStr(row.getCell(3).value)),
      });
    });

    for (const g of rows) {
      const groupId = await ensureGroupByName(g.name);
      report.count('groups');
      const seenInGroup = new Set<string>();

      const addMember = async (rawName: string, role: 'LEADER' | 'CO_LEADER' | 'DISCIPLE') => {
        if (isPlaceholder(rawName)) {
          report.conflict({ kind: 'placeholder', detail: `${g.name}: placeholder member "${rawName}" — skipped, needs a real name.`, names: [rawName] });
          return;
        }
        const pid = await registry.getOrCreate(rawName, { status: 'ACTIVE' });
        if (!pid) return;
        if (seenInGroup.has(pid)) {
          report.conflict({ kind: 'self-referential', detail: `${g.name}: "${rawName}" listed twice (leader & disciple) — kept first role.`, names: [rawName] });
          return;
        }
        seenInGroup.add(pid);
        const res = await ensureMembership(groupId, pid, role);
        if (res === 'created') report.count('memberships');
      };

      // co-leadership is the norm: first leader LEADER, rest CO_LEADER
      for (let i = 0; i < g.leaders.length; i++) {
        await addMember(g.leaders[i]!, i === 0 ? 'LEADER' : 'CO_LEADER');
      }
      for (const d of g.disciples) await addMember(d, 'DISCIPLE');
    }
  }

  // ---- Mentors sheet: A mentees (csv), B mentor name, C email, D phone
  const mentorsSheet = wb.getWorksheet('Mentors');
  if (mentorsSheet) {
    const rows: Array<{ mentees: string[]; mentor: string; email: string | null; phone: string | null }> = [];
    mentorsSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const mentor = cellStr(row.getCell(2).value);
      if (!mentor) return;
      // Skip divider/status rows: a "mentor" with no mentees and no contact info
      // is not a person (e.g. "Reassessment/Reassignment").
      const menteesRaw = cellStr(row.getCell(1).value);
      const emailRaw = cellStr(row.getCell(3).value);
      const phoneRaw = cellStr(row.getCell(4).value);
      if (!menteesRaw && !emailRaw && !phoneRaw) return;
      rows.push({
        mentees: splitList(cellStr(row.getCell(1).value)),
        mentor,
        email: cellStr(row.getCell(3).value),
        phone: cellStr(row.getCell(4).value),
      });
    });

    for (const m of rows) {
      const mentorId = await registry.getOrCreate(m.mentor, {
        email: m.email,
        phone: m.phone,
        status: 'ACTIVE',
      });
      if (!mentorId) continue;
      report.count('mentors');
      for (const menteeName of m.mentees) {
        if (isPlaceholder(menteeName)) continue;
        const menteeId = await registry.getOrCreate(menteeName, { status: 'ACTIVE' });
        if (!menteeId) continue;
        const res = await ensureMentorEdge(mentorId, menteeId);
        if (res === 'created') report.count('mentorEdges');
        // orphaned mentee: has a mentor edge but leads no group → surface (§2)
        const leads = await prisma.groupMembership.findFirst({
          where: { personId: menteeId, leftAt: null, role: { in: ['LEADER', 'CO_LEADER'] } },
        });
        if (!leads) {
          report.review({ kind: 'orphaned-mentee', detail: `Mentee "${menteeName}" (mentor ${m.mentor}) leads no group — verify spelling or add their group.`, names: [menteeName, m.mentor] });
        }
      }
    }
  }

  // ---- Leaders.Mentor column → mentor edges (mentor → leader)
  for (const pair of leaderMentorPairs) {
    const leaderId = await registry.getOrCreate(pair.leader, { status: 'ACTIVE' });
    const mentorId = await registry.getOrCreate(pair.mentor, { status: 'ACTIVE' });
    if (leaderId && mentorId) {
      const res = await ensureMentorEdge(mentorId, leaderId);
      if (res === 'created') report.count('mentorEdges');
    }
  }

  // ---- New Guys: registrants (PROSPECT) with intake fields + prayer + heuristic interest
  const newGuys = wb.getWorksheet('New Guys');
  if (newGuys) {
    const rows: ExcelJS.Row[] = [];
    newGuys.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      if (cellStr(row.getCell(1).value)) rows.push(row);
    });
    for (const row of rows) {
      const name = cellStr(row.getCell(1).value)!;
      const lookingFor = cellStr(row.getCell(11).value);
      const id = await registry.getOrCreate(name, {
        phone: cellStr(row.getCell(2).value),
        email: cellStr(row.getCell(3).value),
        address: cellStr(row.getCell(4).value),
        maritalStatus: parseMarital(cellStr(row.getCell(5).value)),
        occupation: cellStr(row.getCell(6).value),
        churchAffiliation: cellStr(row.getCell(7).value),
        attendedBefore: parseYesNo(cellStr(row.getCell(8).value)),
        heardAboutUs: cellStr(row.getCell(9).value),
        lookingFor,
        status: 'PROSPECT',
      });
      if (!id) continue;
      report.count('newGuys');
      const prayer = cellStr(row.getCell(10).value);
      if (!isEmptyAnswer(prayer)) await ensurePrayerNote(id, prayer!);
      // §7 heuristic: mentions of leading/discipling others raise WANTS_TO_LEAD
      if (lookingFor && /\b(lead|leading|discipl(e|ing) others|pour into|mentor others)\b/i.test(lookingFor)) {
        await ensureInterest(id, 'WANTS_TO_LEAD', lookingFor);
      }
    }
  }

  // ---- Wants to Be Discipled: A name, B notes
  const wants = wb.getWorksheet('Wants to Be Discipled');
  if (wants) {
    const rows: Array<{ name: string; notes: string | null }> = [];
    wants.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const name = cellStr(row.getCell(1).value);
      if (!name) return;
      rows.push({ name, notes: cellStr(row.getCell(2).value) });
    });
    for (const w of rows) {
      const id = await registry.getOrCreate(w.name, { status: 'ACTIVE' });
      if (!id) continue;
      report.count('wantsDiscipleship');
      await ensureInterest(id, 'WANTS_DISCIPLESHIP', w.notes);
    }
  }

  // ---- Review pass: fuzzy duplicates across the whole directory (§8) --------
  const all = registry.all();
  const seenPairs = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    const a = all[i]!;
    const aName = `${a.firstName} ${a.lastName}`.trim();
    const candidates = scoreCandidates({ name: aName, email: a.email, phone: a.phone, church: a.churchAffiliation }, all.filter((p) => p.id !== a.id));
    for (const c of candidates) {
      if (c.score < 0.6 || c.score >= 0.95) continue;
      const key = [a.id, c.personId].sort().join(':');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const other = all.find((p) => p.id === c.personId)!;
      report.review({
        kind: 'fuzzy-duplicate',
        detail: `Possible duplicate: "${aName}" vs "${other.firstName} ${other.lastName}" — ${c.reason}. Merge if same person.`,
        names: [aName, `${other.firstName} ${other.lastName}`],
        score: c.score,
      });
    }
  }

  // ---- Parked collisions: surface if both spellings landed in the data -------
  for (const [nameA, nameB, reason] of PARKED_PAIRS) {
    const a = all.find((p) => normalizeName(`${p.firstName} ${p.lastName}`) === normalizeName(nameA));
    const b = all.find((p) => normalizeName(`${p.firstName} ${p.lastName}`) === normalizeName(nameB));
    if (a && b) {
      report.conflict({ kind: 'parked-collision', detail: `${nameA} vs ${nameB}: ${reason}`, names: [nameA, nameB] });
    } else {
      // even if only one appears, keep the question visible
      report.review({ kind: 'parked-collision', detail: `${nameA} / ${nameB}: ${reason} (only one present so far)`, names: [nameA, nameB] });
    }
  }

  report.count('peopleTotal', all.length);
  const outPath = resolvePath(__dirname, '..', '..', 'import-report.json');
  report.write(outPath);
  report.printSummary();
  console.log(`Full report: ${outPath}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
