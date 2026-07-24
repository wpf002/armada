export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Fetch the API with session cookies included. Throws on non-2xx. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON body when there actually is one. Fastify rejects a
  // bodyless request that claims `content-type: application/json` with a 400,
  // which is what silently broke every DELETE (remove member, end mentorship).
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) ?? {}) };
  if (init?.body != null && !('content-type' in headers) && !('Content-Type' in headers)) {
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    // Surface the API's own message ("That email already belongs to…") when it
    // sends one; fall back to the status line otherwise.
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body — nothing to add
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
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
  interests?: Array<{ type: string; status: string }>;
  hasMentor?: boolean;
  /** Leaders who disciple(d) them — `current: false` means it's completed.
   *  Not the same as a mentor. */
  discipledBy?: Array<{ id: string; name: string; current: boolean }>;
  /** Their mentor, from an active MentorRelationship. */
  mentoredBy?: { id: string; name: string } | null;
}

export interface GroupMemberNode {
  personId: string;
  name: string;
  photoUrl: string | null;
  role?: 'LEADER' | 'CO_LEADER' | 'DISCIPLE';
}

export interface GroupDetail {
  id: string;
  name: string | null;
  status: string;
  meetingDay: string | null;
  meetingTime: string | null;
  location: string | null;
  displayName: string;
  leaders: GroupMemberNode[];
  disciples: GroupMemberNode[];
  openCapacity: boolean;
}

export interface MentorNode {
  personId: string;
  name: string;
  photoUrl: string | null;
  menteeIds: string[];
}

export interface Hierarchy {
  fullGraph: boolean;
  groups: GroupDetail[];
  mentors: MentorNode[];
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
