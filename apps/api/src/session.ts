import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@armada/shared';
import { auth } from './auth';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  personId: string;
  role: Role;
}

/** Convert a Fastify request's headers into a web `Headers` object. */
function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value != null) {
      headers.append(key, value);
    }
  }
  return headers;
}

/** Resolve the current session, or null if unauthenticated. */
export async function getAuthedUser(request: FastifyRequest): Promise<AuthedUser | null> {
  const session = await auth.api.getSession({ headers: toHeaders(request) });
  if (!session?.user) return null;
  const u = session.user as unknown as {
    id: string;
    email: string;
    name: string;
    personId: string;
    role: Role;
  };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    personId: u.personId,
    role: u.role ?? 'MEMBER',
  };
}

/**
 * Fastify preHandler that enforces authentication and (optionally) a role
 * allow-list. Permission enforcement lives in the API layer, never the UI
 * (CLAUDE.md). On success, `request.authedUser` is populated.
 */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getAuthedUser(request);
    if (!user) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    request.authedUser = user;
  };
}

/** Just require a valid session, any role. */
export const requireAuth = requireRole();

declare module 'fastify' {
  interface FastifyRequest {
    authedUser?: AuthedUser;
  }
}
