/**
 * One-off: create the real Armada admins with a shared starter password, and
 * split the seed `admin@armada.test` account into its own generic "Admin".
 *
 *   pnpm --filter @armada/api tsx src/scripts/seed-admins.ts
 *
 * Care taken for invariant #1 (one Person per human): each new login links to
 * the person already in the graph rather than spawning a duplicate. Where a
 * person exists under a different email, Better Auth's create hook makes a stub
 * (it keys on the login email); we repoint the user to the canonical person and
 * delete the stub, preserving the canonical person's existing contact email.
 */
import { prisma } from '@armada/db';
import { auth } from '../auth';

const PASSWORD = 'Password123!';

const TARGETS: Array<{ email: string; name: string }> = [
  { email: 'wfoti71992@gmail.com', name: 'Will Foti' },
  { email: 'deverett@armadadiscipleship.org', name: 'Dillon Everett' },
  { email: 'scott.coy@me.com', name: 'Scott Coy' },
  { email: 'ksullivan@armadadiscipleship.org', name: 'Kyle Sullivan' },
  { email: 'zplunkett@armadadiscipleship.org', name: 'Zack Plunkett' },
  { email: 'zerenityc@icloud.com', name: 'Zerenity' },
];

/** The canonical person already in the graph for this human, if any. */
async function canonicalPersonId(email: string, name: string): Promise<string | null> {
  const byEmail = await prisma.person.findUnique({ where: { email }, select: { id: true } });
  if (byEmail) return byEmail.id;
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ');
  const byName = await prisma.person.findFirst({
    where: { firstName, lastName, mergedIntoId: null, status: { not: 'REMOVED' } },
    select: { id: true },
  });
  return byName?.id ?? null;
}

async function ensureAdmin(email: string, name: string, canonical: string | null) {
  const lower = email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: lower } });
  if (!user) {
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
    user = await prisma.user.findUnique({ where: { email: lower } });
  }
  if (!user) throw new Error(`sign-up failed for ${email}`);

  // Link to the canonical person; drop the stub the hook may have created.
  if (canonical && user.personId !== canonical) {
    const stub = user.personId;
    await prisma.user.update({ where: { id: user.id }, data: { personId: canonical } });
    await prisma.person.delete({ where: { id: stub } }).catch(() => {
      /* stub had references somehow — leave it */
    });
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN', name } });
  const p = await prisma.person.findUnique({
    where: { id: canonical ?? user.personId },
    select: { firstName: true, lastName: true },
  });
  console.log(`  ✓ ${email} → ADMIN (${p?.firstName} ${p?.lastName})`);
}

async function main() {
  // --- Split admin@armada.test off Kyle Sullivan into a generic "Admin" ------
  // It's currently linked to the real Kyle (who leads a group whose name is
  // derived from him), so renaming in place would rename his group. Instead we
  // give the seed login its own "Admin" person and hand Kyle his own login.
  const kyleEmail = 'ksullivan@armadadiscipleship.org';
  const seed = await prisma.user.findUnique({ where: { email: 'admin@armada.test' } });
  if (seed) {
    const seedPersonId = seed.personId;
    const seedPerson = await prisma.person.findUnique({ where: { id: seedPersonId } });
    // Only split if the seed login is still riding on a *named* person (Kyle).
    if (seedPerson && !(seedPerson.firstName === 'Admin' && !seedPerson.lastName)) {
      // Free the admin@armada.test email off Kyle so the generic Admin can take
      // it, and make Kyle's contact email his real one.
      await prisma.person.update({
        where: { id: seedPersonId },
        data: { email: kyleEmail },
      });
      const adminPerson = await prisma.person.create({
        data: { firstName: 'Admin', lastName: '', email: 'admin@armada.test', status: 'ACTIVE' },
      });
      await prisma.user.update({
        where: { id: seed.id },
        data: { personId: adminPerson.id, name: 'Admin', role: 'ADMIN' },
      });
      console.log('  ✓ admin@armada.test → generic "Admin" (Kyle kept his identity + group)');
    } else {
      console.log('  · admin@armada.test already split');
    }
  }

  console.log('\nSeeding admins:');
  for (const t of TARGETS) {
    const canonical = await canonicalPersonId(t.email, t.name);
    await ensureAdmin(t.email, t.name, canonical);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\nDone. Shared password: Password123!\n');
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
