'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, personDisplayName, type DirectoryPerson } from '@/lib/api';
import { Avatar } from '@/components/Avatar';

export default function DirectoryPage() {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ people: DirectoryPerson[] }>('/people')
      .then((r) => setPeople(r.people))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Client-side index — instant filter, no server round trip per keystroke.
  const index = useMemo(
    () =>
      people.map((p) => ({
        p,
        hay: [
          personDisplayName(p),
          p.churchAffiliation ?? '',
          ...p.groups.map((g) => g.displayName),
        ]
          .join(' ')
          .toLowerCase(),
      })),
    [people],
  );

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return index.filter((x) => x.hay.includes(needle)).map((x) => x.p);
  }, [q, index, people]);

  return (
    <div className="px-4 pt-4">
      <header className="mb-3">
        <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Directory</p>
        <h1 className="font-display text-2xl text-ink">{people.length} people</h1>
      </header>

      <input
        type="search"
        placeholder="Search name, group, church…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-3 min-h-[44px] w-full rounded-lg border border-grey-300 bg-white px-3 outline-none focus:border-deep"
      />

      {loading && <p className="text-slate">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <ul className="flex flex-col divide-y divide-grey-200">
        {results.map((p) => {
          const primary = p.groups[0];
          return (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                className="flex min-h-[60px] items-center gap-3 py-2"
              >
                <Avatar person={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-soft">
                    {personDisplayName(p)}
                  </span>
                  <span className="block truncate text-sm text-slate">
                    {primary ? primary.displayName : 'No group'}
                    {p.churchAffiliation ? ` · ${p.churchAffiliation}` : ''}
                  </span>
                </span>
                {p.status === 'PROSPECT' && (
                  <span className="rounded-full bg-olive/15 px-2 py-0.5 text-[11px] text-olive">
                    new
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {!loading && results.length === 0 && (
          <li className="py-6 text-center text-slate">No matches.</li>
        )}
      </ul>
    </div>
  );
}
