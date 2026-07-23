'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, type Hierarchy } from '@/lib/api';
import { HierarchyGraph } from '@/components/HierarchyGraph';
import { HierarchyAccordion } from '@/components/HierarchyAccordion';

type View = 'groups' | 'leaders' | 'mentors' | 'map';

interface Leader {
  id: string;
  name: string;
  photoUrl: string | null;
  groups: string[];
}
interface Mentor {
  id: string;
  name: string;
  mentees: Array<{ id: string; name: string }>;
}

const TABS: Array<{ key: View; label: string }> = [
  { key: 'groups', label: 'Groups' },
  { key: 'leaders', label: 'Leaders' },
  { key: 'mentors', label: 'Mentors' },
  { key: 'map', label: 'Hierarchy' },
];

export default function GroupsPage() {
  const params = useSearchParams();
  const initial = (params.get('view') as View) ?? 'groups';
  const [view, setView] = useState<View>(TABS.some((t) => t.key === initial) ? initial : 'groups');

  const [data, setData] = useState<Hierarchy | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [showMentorRing, setShowMentorRing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Hierarchy>('/hierarchy').then(setData).catch((e) => setError(String(e)));
    api<{ leaders: Leader[] }>('/leaders').then((r) => setLeaders(r.leaders)).catch(() => {});
    api<{ mentors: Mentor[] }>('/mentors').then((r) => setMentors(r.mentors)).catch(() => {});
  }, []);

  const heading =
    view === 'groups'
      ? `${data?.groups.length ?? ''} Groups`
      : view === 'leaders'
        ? `${leaders.length} Leaders`
        : view === 'mentors'
          ? `${mentors.length} Mentors`
          : 'The Fleet';

  return (
    <div className="px-4 pt-5">
      <p className="eyebrow">Discipleship Groups</p>
      <h1 className="display text-[26px]">{heading}</h1>

      {/* View tabs */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              view === t.key ? 'bg-deep text-cream' : 'border border-line text-ink-soft hover:bg-sand/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-red-700">{error}</p>}
      {!data && !error && <p className="mt-4 text-muted">Loading…</p>}

      <div className="mt-4">
        {/* Who's in a group */}
        {view === 'groups' && data && <HierarchyAccordion hierarchy={data} />}

        {/* Who is leading a group */}
        {view === 'leaders' && (
          <div className="card divide-y divide-line">
            {leaders.map((l) => (
              <Link key={l.id} href={`/people/${l.id}`} className="flex items-center justify-between px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{l.name}</span>
                  <span className="block truncate text-sm text-muted">{l.groups.join(' · ')}</span>
                </span>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            ))}
            {leaders.length === 0 && <p className="px-4 py-5 text-sm text-muted">No Leaders Yet.</p>}
          </div>
        )}

        {/* Who's mentoring leaders */}
        {view === 'mentors' && (
          <div className="flex flex-col gap-2.5">
            {mentors.map((m) => (
              <div key={m.id} className="card p-4">
                <Link href={`/people/${m.id}`} className="font-medium text-ink">
                  {m.name}
                </Link>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">
                  Mentoring {m.mentees.length}
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {m.mentees.map((x) => (
                    <li key={x.id}>
                      <Link href={`/people/${x.id}`} className="text-ink-soft underline-offset-2 hover:underline">
                        {x.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {mentors.length === 0 && (
              <p className="card px-4 py-5 text-sm text-muted">No Mentor Relationships Yet.</p>
            )}
          </div>
        )}

        {/* The network hierarchy */}
        {view === 'map' && data && (
          <>
            <div className="mb-3 flex items-center justify-end">
              <label className="flex shrink-0 items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={showMentorRing}
                  onChange={(e) => setShowMentorRing(e.target.checked)}
                />
                Mentors
              </label>
            </div>
            <div className="md:mx-[calc(50%-50vw)] md:w-screen md:px-6">
              <HierarchyGraph hierarchy={data} showMentors={showMentorRing} />
            </div>
          </>
        )}
      </div>

      {data && !data.fullGraph && (
        <p className="mt-4 text-sm text-muted">
          You&apos;re Seeing Your Own Group. Leaders And Mentors See The Whole Org.
        </p>
      )}
    </div>
  );
}
