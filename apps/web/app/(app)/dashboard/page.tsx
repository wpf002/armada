'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Dashboard {
  role: string;
  myGroups: Array<{ id: string; displayName: string }>;
  myMentees: Array<{ id: string; name: string }>;
  myOpenFollowUps: number;
  admin?: {
    wantsDiscipleship: number;
    unassignedPeople: number;
    groupsWithoutMentor: number;
    openCapacityLeaders: number;
    staleFollowUps: number;
  };
}

interface FollowUp {
  id: string;
  status: string;
  subject: { id: string; name: string; phone: string | null };
}

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);

  useEffect(() => {
    api<Dashboard>('/dashboard').then(setD);
    api<{ followups: FollowUp[] }>('/followups?scope=mine').then((r) => setFollowups(r.followups));
  }, []);

  if (!d) return <p className="p-5 text-muted">Loading…</p>;

  async function complete(id: string) {
    await api(`/followups/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
    setFollowups((f) => f.filter((x) => x.id !== id));
  }

  return (
    <div className="px-4 pt-4">
      <p className="eyebrow">Dashboard</p>
      <h1 className="mb-4 display text-2xl text-ink">Your work</h1>

      {d.admin && (
        <>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Org gaps</p>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Stat n={d.admin.wantsDiscipleship} label="want discipling" href="/pipeline" />
            <Stat n={d.admin.openCapacityLeaders} label="leaders with open capacity" href="/groups" />
            <Stat n={d.admin.unassignedPeople} label="unassigned people" href="/admin/unassigned" />
            <Stat n={d.admin.groupsWithoutMentor} label="groups without a mentor" href="/mentors" />
            <Stat n={d.admin.staleFollowUps} label="stale follow-ups" />
          </div>
        </>
      )}

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">My groups</p>
      <ul className="mb-4 flex flex-col gap-1">
        {d.myGroups.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="text-ink-soft">
              {g.displayName}
            </Link>
          </li>
        ))}
        {d.myGroups.length === 0 && <li className="text-sm text-muted">None.</li>}
      </ul>

      {d.myMentees.length > 0 && (
        <>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">My mentees</p>
          <ul className="mb-4 flex flex-col gap-1">
            {d.myMentees.map((m) => (
              <li key={m.id}>
                <Link href={`/people/${m.id}`} className="text-ink-soft">
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">
        My follow-ups ({followups.length})
      </p>
      <ul className="flex flex-col gap-2">
        {followups.map((f) => (
          <li key={f.id} className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
            <span>
              <Link href={`/people/${f.subject.id}`} className="block text-ink-soft">
                {f.subject.name}
              </Link>
              {f.subject.phone && (
                <a href={`tel:${f.subject.phone}`} className="text-sm text-deep">
                  {f.subject.phone}
                </a>
              )}
            </span>
            <button onClick={() => complete(f.id)} className="rounded-full bg-deep px-3 py-1 text-sm text-cream">
              Done
            </button>
          </li>
        ))}
        {followups.length === 0 && <li className="text-sm text-muted">No open follow-ups.</li>}
      </ul>
    </div>
  );
}

function Stat({ n, label, href }: { n: number; label: string; href?: string }) {
  const inner = (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="display text-3xl text-deep">{n}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
