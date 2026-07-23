import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@armada/db';

/**
 * Better Auth (email/password, sessions, password reset).
 *
 * Invariant #1: one Person per human. Every User links to exactly one Person via
 * `personId`. On sign-up we create the Person first (in a `before` hook) and inject
 * its id, so the User row is never orphaned. `role` defaults to MEMBER at the DB
 * level; admins elevate roles later (never self-serve at sign-up → `input: false`).
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
  trustedOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim()),
  session: {
    // Browser-session only: the cookie is dropped when the browser closes, so
    // everyone signs in fresh each time. Also expire server-side after 12h.
    expiresIn: 60 * 60 * 12,
    cookieCache: { enabled: false },
  },
  advanced: {
    defaultCookieAttributes: {
      // No maxAge/expires => a session cookie.
      maxAge: undefined,
    },
  },
  emailAndPassword: {
    enabled: true,
    // Email delivery is wired in a later phase; don't block login on verification yet.
    requireEmailVerification: false,
    minPasswordLength: 8,
    // TODO(phase 8): send the reset email. For now Better Auth generates the token.
    sendResetPassword: async () => {
      /* no-op until transactional email is configured */
    },
  },
  user: {
    additionalFields: {
      // Not `required` at the request layer — the create hook always injects it
      // before the DB write (the column itself is NOT NULL).
      personId: { type: 'string', required: false, input: false },
      role: { type: 'string', required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Reuse an existing Person with this email (e.g. imported) rather than
          // creating a duplicate human — otherwise create a fresh PROSPECT→ACTIVE.
          const email = user.email.toLowerCase();
          const existing = await prisma.person.findUnique({ where: { email } });
          let personId = existing?.id;
          if (!personId) {
            const parts = (user.name ?? '').trim().split(/\s+/);
            const firstName = parts[0] || email;
            const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
            const person = await prisma.person.create({
              data: { firstName, lastName, email, status: 'ACTIVE' },
            });
            personId = person.id;
          }
          return { data: { ...user, personId } };
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
