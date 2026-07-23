import { prisma } from './index';

/**
 * PHASE 0 seed placeholder. Phase 1 seeds a handful of fake people + an admin
 * user; Phase 2 provides the real xlsx importer (`pnpm --filter db import:xlsx`).
 */
async function main() {
  const check = await prisma.healthCheck.create({ data: {} });
  console.log(`Seeded HealthCheck ${check.id}`);
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
