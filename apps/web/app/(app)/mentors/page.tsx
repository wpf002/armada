'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Mentor {
  id: string;
  name: string;
  mentees: Array<{ id: string; name: string }>;
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  useEffect(() => {
    api<{ mentors: Mentor[] }>('/mentors').then((r) => setMentors(r.mentors));
  }, []);
  return (
    <div className="px-4 pt-4">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Mentors</p>
      <h1 className="mb-3 font-display text-2xl text-ink">{mentors.length} mentoring leaders</h1>
      <ul className="flex flex-col gap-3">
        {mentors.map((m) => (
          <li key={m.id} className="rounded-xl border border-grey-200 bg-white p-4">
            <Link href={`/people/${m.id}`} className="font-medium text-ink-soft">
              {m.name}
            </Link>
            <ul className="mt-1 flex flex-wrap gap-x-2 text-sm text-slate">
              {m.mentees.map((x, i) => (
                <li key={x.id}>
                  <Link href={`/people/${x.id}`} className="text-slate-dark">
                    {x.name}
                  </Link>
                  {i < m.mentees.length - 1 && ' ·'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
