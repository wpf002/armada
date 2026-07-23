/**
 * Phase 3 gate: field-level visibility by role (§6).
 *
 *   pnpm --filter @armada/api exec tsx src/scripts/verify-visibility.ts
 *
 * Requires the API running on API_PORT and imported graph data. Links a test
 * LEADER user to a real imported leader, then asserts that a member, a leader,
 * and an admin each see exactly the Person fields §6 grants them.
 */
import { prisma } from '@armada/db';
import { auth } from '../auth';

const BASE = `http://localhost:${process.env.API_PORT ?? 4000}`;
// The browser sends its Origin on every request; Better Auth's CSRF check
// requires it to be a trusted origin. Mirror that here.
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0]!;

async function ensureUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) await auth.api.signUpEmail({ body: { email, password, name } });
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
  return cookies.join('; ');
}

async function getPerson(cookie: string, id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/people/${id}`, { headers: { cookie } });
  const json = (await res.json()) as { person?: Record<string, unknown> };
  return json.person ?? {};
}

let failures = 0;
function assert(label: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

async function main() {
  // Find a group with both a leader and a disciple.
  const disc = await prisma.groupMembership.findFirst({
    where: { role: 'DISCIPLE', leftAt: null },
    select: { groupId: true, personId: true },
  });
  if (!disc) throw new Error('no disciple memberships — run the importer first');
  const lead = await prisma.groupMembership.findFirst({
    where: { groupId: disc.groupId, role: { in: ['LEADER', 'CO_LEADER'] }, leftAt: null },
    select: { personId: true },
  });
  if (!lead) throw new Error('group has no leader');
  const outsider = await prisma.groupMembership.findFirst({
    where: { groupId: { not: disc.groupId }, role: 'DISCIPLE', leftAt: null },
    select: { personId: true },
  });

  const leaderPid = lead.personId;
  const discipleId = disc.personId;
  const outsiderId = outsider?.personId ?? discipleId;

  // Wire up users.
  await ensureUser('admin@armada.test', 'Password123!', 'Admin');
  await prisma.user.update({ where: { email: 'admin@armada.test' }, data: { role: 'ADMIN' } });
  await ensureUser('member@armada.test', 'Password123!', 'Member');
  await ensureUser('leader@armada.test', 'Password123!', 'Leader');
  // Link the leader user to the real imported leader person.
  await prisma.user.update({ where: { email: 'leader@armada.test' }, data: { personId: leaderPid, role: 'LEADER' } });

  const adminC = await signIn('admin@armada.test', 'Password123!');
  const memberC = await signIn('member@armada.test', 'Password123!');
  const leaderC = await signIn('leader@armada.test', 'Password123!');

  const memberPerson = await prisma.user.findUnique({ where: { email: 'member@armada.test' } });

  console.log(`\ngroup=${disc.groupId}\nleader=${leaderPid} disciple=${discipleId} outsider=${outsiderId}\n`);

  // MEMBER
  const mViewsDisc = await getPerson(memberC, discipleId);
  assert('member sees directory (firstName) on disciple', has(mViewsDisc, 'firstName'));
  assert('member does NOT see contact (phone/email/address) on disciple',
    !has(mViewsDisc, 'phone') && !has(mViewsDisc, 'email') && !has(mViewsDisc, 'address'));
  const mViewsSelf = await getPerson(memberC, memberPerson!.personId);
  assert('member sees extended profile (maritalStatus) on SELF',
    has(mViewsSelf, 'maritalStatus') && has(mViewsSelf, 'phone'));

  // LEADER
  const lViewsDisc = await getPerson(leaderC, discipleId);
  assert('leader sees contact (phone/email/address) on own-group disciple',
    has(lViewsDisc, 'phone') && has(lViewsDisc, 'email') && has(lViewsDisc, 'address'));
  assert('leader does NOT see extended profile (maritalStatus) on disciple',
    !has(lViewsDisc, 'maritalStatus'));
  if (outsiderId !== discipleId) {
    const lViewsOut = await getPerson(leaderC, outsiderId);
    assert('leader does NOT see contact on an outsider', !has(lViewsOut, 'phone'));
  }

  // ADMIN
  const aViewsDisc = await getPerson(adminC, discipleId);
  assert('admin sees contact + extended on anyone',
    has(aViewsDisc, 'phone') && has(aViewsDisc, 'maritalStatus'));

  console.log(`\n${failures === 0 ? 'ALL VISIBILITY CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
