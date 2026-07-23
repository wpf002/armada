export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Fetch the API with session cookies included. Throws on non-2xx. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---- Shared response shapes ------------------------------------------------

export interface GroupRef {
  groupId: string;
  role: 'LEADER' | 'CO_LEADER' | 'DISCIPLE';
  displayName: string;
}

export interface DirectoryPerson {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  photoUrl: string | null;
  churchAffiliation: string | null;
  status: string;
  groups: GroupRef[];
}

/** A profile is a partial Person — only the fields the viewer may see are present. */
export interface Profile {
  id: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  photoUrl?: string | null;
  churchAffiliation?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  bio?: string | null;
  status?: string;
  attendedBefore?: boolean | null;
  heardAboutUs?: string | null;
  lookingFor?: string | null;
  groups?: GroupRef[];
}

export function personDisplayName(p: {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
}): string {
  const first = p.preferredName?.trim() || p.firstName?.trim() || '';
  return `${first} ${p.lastName?.trim() ?? ''}`.trim();
}

export function initials(p: { firstName?: string; lastName?: string }): string {
  return `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}
