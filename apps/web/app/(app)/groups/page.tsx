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
          <p className="eyebrow">Groups</p>
          <h1 className="display text-2xl text-ink">
            {data ? `${data.groups.length} groups` : 'Hierarchy'}
          </h1>
        </div>
        {data?.fullGraph && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
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
      {!data && !error && <p className="text-muted">Loading…</p>}

      {data &&
        (wide ? (
          /* Break out of the narrow column so the diagram has room to breathe. */
          <div className="md:mx-[calc(50%-50vw)] md:w-screen md:px-6">
            <HierarchyGraph hierarchy={data} showMentors={showMentors} />
          </div>
        ) : (
          <HierarchyAccordion hierarchy={data} />
        ))}

      {data && !data.fullGraph && (
        <p className="mt-4 text-sm text-muted">
          You&apos;re seeing your own group. Leaders and mentors see the whole org.
        </p>
      )}
    </div>
  );
}
