'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth browser client, pointed at the Fastify API. Sessions are cookie
 * based; `credentials: 'include'` sends them cross-port (same-site localhost).
 * The user object carries our additional fields (personId, role).
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
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
