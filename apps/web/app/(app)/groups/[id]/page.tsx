'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, personDisplayName, type DirectoryPerson, type GroupDetail } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<{ group: GroupDetail }>(`/groups/${id}`)
      .then((r) => setGroup(r.group))
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => load(), [load]);

  if (error) return <p className="p-5 text-red-600">{error}</p>;
  if (!group) return <p className="p-5 text-muted">Loading…</p>;

  // Admins always; a leader of THIS group may manage its membership.
  const canManage =
    user?.role === 'ADMIN' || group.leaders.some((l) => l.personId === user?.personId);

  async function removeMember(personId: string) {
    await api(`/groups/${id}/members/${personId}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="px-5 pt-4">
      <button onClick={() => router.back()} className="text-sm text-muted">
        ← Back
      </button>
      <h1 className="mt-2 display text-2xl text-ink">{group.displayName}</h1>
      {(group.meetingDay || group.location) && (
        <p className="text-sm text-muted">
          {[group.meetingDay, group.meetingTime, group.location].filter(Boolean).join(' · ')}
        </p>
      )}

      {user?.role === 'ADMIN' && (
        <>
          <button
            onClick={() => setEditing((e) => !e)}
            className="mt-2 text-sm text-deep underline-offset-2 hover:underline"
          >
            {editing ? 'Close' : 'Edit Group Details'}
          </button>
          {editing && (
            <EditGroup
              group={group}
              onSaved={() => {
                setEditing(false);
                load();
              }}
            />
          )}
        </>
      )}

      <Section title="Leaders">
        {group.leaders.map((l) => (
          <MemberRow
            key={l.personId}
            name={l.name}
            personId={l.personId}
            onRemove={canManage ? () => removeMember(l.personId) : undefined}
          />
        ))}
      </Section>

      <Section title={`Disciples (${group.disciples.length})`}>
        {group.openCapacity && (
          <p className="mb-2 rounded-lg bg-olive/10 px-3 py-2 text-sm text-olive">
            Open capacity — this leader has room for disciples.
          </p>
        )}
        {group.disciples.map((d) => (
          <MemberRow
            key={d.personId}
            name={d.name}
            personId={d.personId}
            onRemove={canManage ? () => removeMember(d.personId) : undefined}
          />
        ))}
      </Section>

      {canManage && (
        <button
          onClick={() => setAdding((a) => !a)}
          className="mt-4 rounded-lg border border-deep px-4 py-2 text-sm text-deep"
        >
          {adding ? 'Close' : '+ Add member'}
        </button>
      )}
      {adding && canManage && <AddMember groupId={id} onadded={() => { setAdding(false); load(); }} />}
    </div>
  );
}

/**
 * Meeting rhythm + lifecycle. The group NAME stays derived from its leaders
 * (invariant #8), so there is deliberately no name field here — change who
 * leads and the name follows.
 */
function EditGroup({ group, onSaved }: { group: GroupDetail; onSaved: () => void }) {
  const [meetingDay, setMeetingDay] = useState(group.meetingDay ?? '');
  const [meetingTime, setMeetingTime] = useState(group.meetingTime ?? '');
  const [location, setLocation] = useState(group.location ?? '');
  const [status, setStatus] = useState(group.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/groups/${group.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          meetingDay: meetingDay.trim() || null,
          meetingTime: meetingTime.trim() || null,
          location: location.trim() || null,
          status,
        }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const field = 'min-h-[44px] w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-deep';

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Meeting Day</span>
        <input value={meetingDay} onChange={(e) => setMeetingDay(e.target.value)} placeholder="Tuesday" className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Meeting Time</span>
        <input value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} placeholder="6:30 AM" className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Location</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Watermark, Dallas" className={field} />
      </label>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Status</p>
        <div className="flex gap-2 text-sm">
          {(['ACTIVE', 'PAUSED', 'CLOSED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 ${status === s ? 'bg-deep text-cream' : 'bg-sand text-ink-soft'}`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={save}
        disabled={busy}
        className="rounded-lg bg-deep py-2.5 text-sm font-medium text-cream disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</p>
      <div className="flex flex-col divide-y divide-line">{children}</div>
    </section>
  );
}

function MemberRow({
  name,
  sub,
  personId,
  onRemove,
}: {
  name: string;
  sub?: string;
  personId: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <Link href={`/people/${personId}`} className="min-w-0">
        <span className="block truncate text-ink-soft">{name}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </Link>
      {onRemove && (
        <button onClick={onRemove} className="text-sm text-muted hover:text-red-600">
          remove
        </button>
      )}
    </div>
  );
}

function AddMember({ groupId, onadded }: { groupId: string; onadded: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [role, setRole] = useState<'DISCIPLE' | 'LEADER'>('DISCIPLE');

  useEffect(() => {
    api<{ people: DirectoryPerson[] }>('/people').then((r) => setResults(r.people));
  }, []);

  const filtered = q
    ? results.filter((p) => personDisplayName(p).toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  async function add(personId: string) {
    await api(`/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ personId, role }),
    });
    onadded();
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-surface p-3">
      <div className="mb-2 flex gap-2 text-sm">
        {(['DISCIPLE', 'LEADER'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`rounded-full px-3 py-1 ${role === r ? 'bg-deep text-cream' : 'bg-sand text-ink-soft'}`}
          >
            {r === 'DISCIPLE' ? 'Disciple' : 'Leader'}
          </button>
        ))}
      </div>
      <input
        placeholder="Search people…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-line px-3"
      />
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {filtered.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2">
            <span className="text-ink-soft">{personDisplayName(p)}</span>
            <button onClick={() => add(p.id)} className="text-sm text-deep">
              add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
