'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth browser client, pointed at the Fastify API. Sessions are cookie
 * based; `credentials: 'include'` sends them cross-port (same-site localhost).
 * The user object carries our additional fields (personId, role).
 */
/**
 * Better Auth treats a baseURL that already carries a path as the COMPLETE auth
 * base and appends endpoints straight onto it — only a bare origin gets the
 * default `/api/auth`. Behind the production proxy the API base is
 * `…/backend`, which made the client POST `/backend/sign-in/email` (404) while
 * every other call was fine. Spell the auth path out so both shapes agree.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const authClient = createAuthClient({
  baseURL: `${API_BASE.replace(/\/$/, '')}/api/auth`,
  fetchOptions: { credentials: 'include' },
});

export const { useSession, signIn, signOut } = authClient;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  personId: string;
  role: 'ADMIN' | 'LEADER' | 'MEMBER';
};
