'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, personDisplayName, type DirectoryPerson, type GroupDetail } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<{ group: GroupDetail }>(`/groups/${id}`)
      .then((r) => setGroup(r.group))
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => load(), [load]);

  if (error) return <p className="p-5 text-red-600">{error}</p>;
  if (!group) return <p className="p-5 text-slate">Loading…</p>;

  // Admins always; a leader of THIS group may manage its membership.
  const canManage =
    user?.role === 'ADMIN' || group.leaders.some((l) => l.personId === user?.personId);

  async function removeMember(personId: string) {
    await api(`/groups/${id}/members/${personId}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="px-5 pt-4">
      <Link href="/groups" className="text-sm text-slate">
        ← Groups
      </Link>
      <h1 className="mt-2 font-display text-2xl text-ink">{group.displayName}</h1>
      {(group.meetingDay || group.location) && (
        <p className="text-sm text-slate">
          {[group.meetingDay, group.meetingTime, group.location].filter(Boolean).join(' · ')}
        </p>
      )}

      <Section title="Leaders">
        {group.leaders.map((l) => (
          <MemberRow
            key={l.personId}
            name={l.name}
            sub={l.role === 'CO_LEADER' ? 'co-leader' : 'leader'}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate">{title}</p>
      <div className="flex flex-col divide-y divide-grey-200">{children}</div>
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
        {sub && <span className="text-xs text-slate">{sub}</span>}
      </Link>
      {onRemove && (
        <button onClick={onRemove} className="text-sm text-slate hover:text-red-600">
          remove
        </button>
      )}
    </div>
  );
}

function AddMember({ groupId, onadded }: { groupId: string; onadded: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [role, setRole] = useState<'DISCIPLE' | 'LEADER' | 'CO_LEADER'>('DISCIPLE');

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
    <div className="mt-3 rounded-xl border border-grey-200 bg-white p-3">
      <div className="mb-2 flex gap-2 text-sm">
        {(['DISCIPLE', 'LEADER', 'CO_LEADER'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`rounded-full px-3 py-1 ${role === r ? 'bg-deep text-cream' : 'bg-grey-200 text-slate-dark'}`}
          >
            {r.toLowerCase().replace('_', '-')}
          </button>
        ))}
      </div>
      <input
        placeholder="Search people…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-grey-300 px-3"
      />
      <ul className="mt-2 flex flex-col divide-y divide-grey-200">
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
