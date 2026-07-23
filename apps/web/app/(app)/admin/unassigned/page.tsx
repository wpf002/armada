'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface P {
  id: string;
  name: string;
  status: string;
}

export default function UnassignedPage() {
  const [people, setPeople] = useState<P[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ people: P[] }>('/admin/unassigned')
      .then((r) => setPeople(r.people))
      .catch((e) => setErr(String(e)));
  }, []);
  if (err) return <p className="p-5 text-slate">{err.includes('403') ? 'Admins only.' : err}</p>;
  return (
    <div className="px-4 pt-4">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Falling through</p>
      <h1 className="mb-1 font-display text-2xl text-ink">{people.length} unassigned</h1>
      <p className="mb-3 text-sm text-slate">Active people with no group and no open interest.</p>
      <ul className="flex flex-col divide-y divide-grey-200">
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.id}`} className="flex items-center justify-between py-2">
              <span className="text-ink-soft">{p.name}</span>
              <span className="text-xs text-slate">{p.status.toLowerCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
