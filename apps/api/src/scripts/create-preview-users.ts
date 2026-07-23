/**
 * Preview logins for seeing the app as a leader / regular member.
 * They're excluded from the directory (see PREVIEW_EMAIL_SUFFIX).
 *
 *   pnpm --filter @armada/api exec tsx src/scripts/create-preview-users.ts
 */
import { prisma } from '@armada/db';
import { auth } from '../auth';

const PASSWORD = 'Preview123!';

async function ensure(email: string, name: string, role: 'LEADER' | 'MEMBER') {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  await prisma.user.update({ where: { email }, data: { role } });
  return (await prisma.user.findUnique({ where: { email } }))!;
}

async function main() {
  // Leader preview: give them a real group to lead so the leader views populate.
  const leader = await ensure('leader@preview.armada', 'Preview Leader', 'LEADER');
  const group = await prisma.discipleshipGroup.findFirst({
    where: { memberships: { some: { role: 'DISCIPLE', leftAt: null } } },
    select: { id: true },
  });
  if (group) {
    const already = await prisma.groupMembership.findFirst({
      where: { groupId: group.id, personId: leader.personId, leftAt: null },
    });
    if (!already) {
      await prisma.groupMembership.create({
        data: { groupId: group.id, personId: leader.personId, role: 'CO_LEADER' },
      });
    }
  }

  // Member preview: a plain member, in no group.
  await ensure('member@preview.armada', 'Preview Member', 'MEMBER');

  console.log('Preview logins ready (password: ' + PASSWORD + ')');
  console.log('  leader@preview.armada  → LEADER, co-leads a real group');
  console.log('  member@preview.armada  → MEMBER, no group');
  console.log('Both are hidden from the directory.');
}

main().then(async () => { await prisma.$disconnect(); }).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1);
});
