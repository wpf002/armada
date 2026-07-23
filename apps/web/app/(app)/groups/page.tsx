'use client';

import { useEffect, useState } from 'react';
import { api, type Hierarchy } from '@/lib/api';
import { HierarchyGraph } from '@/components/HierarchyGraph';
import { HierarchyAccordion } from '@/components/HierarchyAccordion';

export default function GroupsPage() {
  const [data, setData] = useState<Hierarchy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMentors, setShowMentors] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    api<Hierarchy>('/hierarchy')
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className="px-4 pt-4">
      <header className="mb-3 flex items-end justify-between">
        <div>
          <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Groups</p>
          <h1 className="font-display text-2xl text-ink">
            {data ? `${data.groups.length} groups` : 'Hierarchy'}
          </h1>
        </div>
        {data?.fullGraph && (
          <label className="flex items-center gap-2 text-sm text-slate-dark">
            <input
              type="checkbox"
              checked={showMentors}
              onChange={(e) => setShowMentors(e.target.checked)}
            />
            Mentors
          </label>
        )}
      </header>

      {error && <p className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate">Loading…</p>}

      {data &&
        (wide ? (
          <div className="rounded-2xl border border-grey-200 bg-white p-2">
            <HierarchyGraph hierarchy={data} showMentors={showMentors} />
          </div>
        ) : (
          <HierarchyAccordion hierarchy={data} />
        ))}

      {data && !data.fullGraph && (
        <p className="mt-4 text-sm text-slate">
          You&apos;re seeing your own group. Leaders and mentors see the whole org.
        </p>
      )}
    </div>
  );
}
