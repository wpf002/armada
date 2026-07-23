/**
 * Create (or elevate) an admin user.
 *
 *   pnpm --filter @armada/api create:admin -- <email> <password> "<name>"
 *
 * Signs the user up through Better Auth (so the password is hashed the same way
 * login expects) via the Person-linking hook, then elevates the role to ADMIN.
 * Idempotent: re-running for an existing email just ensures the ADMIN role.
 */
import { prisma } from '@armada/db';
import { auth } from '../auth';

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ') || 'Armada Admin';

  if (!email || !password) {
    console.error('Usage: create:admin -- <email> <password> "<name>"');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!existing) {
    await auth.api.signUpEmail({ body: { email, password, name } });
    console.log(`Created user ${email}`);
  } else {
    console.log(`User ${email} already exists`);
  }

  const user = await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { role: 'ADMIN' },
  });
  console.log(`Elevated ${user.email} to ADMIN (personId=${user.personId})`);
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
