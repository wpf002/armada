'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Leader {
  id: string;
  name: string;
  photoUrl: string | null;
  groups: string[];
}

export default function LeadersPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  useEffect(() => {
    api<{ leaders: Leader[] }>('/leaders').then((r) => setLeaders(r.leaders));
  }, []);
  return (
    <div className="px-4 pt-4">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Leaders</p>
      <h1 className="mb-3 font-display text-2xl text-ink">{leaders.length} leading a group</h1>
      <ul className="flex flex-col divide-y divide-grey-200">
        {leaders.map((l) => (
          <li key={l.id}>
            <Link href={`/people/${l.id}`} className="block py-2">
              <span className="block font-medium text-ink-soft">{l.name}</span>
              <span className="block text-sm text-slate">{l.groups.join(' · ')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
