import { PrismaClient } from '../generated/client';

export * from '../generated/client';

/** Singleton Prisma client. Reused across hot reloads in dev. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
