'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Interest {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'PLACED' | 'DECLINED';
  notes: string | null;
  person: { id: string; name: string };
  assignedGroup: { id: string; displayName: string } | null;
}

const COLUMNS: Array<{ key: Interest['status']; label: string; next?: Interest['status'] }> = [
  { key: 'OPEN', label: 'Open', next: 'IN_PROGRESS' },
  { key: 'IN_PROGRESS', label: 'In progress', next: 'PLACED' },
  { key: 'PLACED', label: 'Placed' },
];

export default function PipelinePage() {
  const [items, setItems] = useState<Interest[]>([]);

  const load = useCallback(() => {
    api<{ interests: Interest[] }>('/interests?type=WANTS_DISCIPLESHIP').then((r) => setItems(r.interests));
  }, []);
  useEffect(() => load(), [load]);

  async function move(id: string, status: Interest['status']) {
    await api(`/interests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  return (
    <div className="px-4 pt-4">
      <p className="eyebrow">Discipleship</p>
      <h1 className="mb-3 display text-2xl text-ink">Wants to be discipled</h1>

      <div className="flex flex-col gap-5">
        {COLUMNS.map((col) => {
          const cards = items.filter((i) => i.status === col.key);
          return (
            <section key={col.key}>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                {col.label} · {cards.length}
              </p>
              <div className="flex flex-col gap-2">
                {cards.map((i) => (
                  <div key={i.id} className="rounded-card border border-line bg-surface p-3">
                    <div className="flex items-center justify-between">
                      <Link href={`/people/${i.person.id}`} className="font-medium text-ink-soft">
                        {i.person.name}
                      </Link>
                      {col.next && (
                        <button
                          onClick={() => move(i.id, col.next!)}
                          className="rounded-full bg-deep px-3 py-1 text-sm text-cream"
                        >
                          → {col.next === 'IN_PROGRESS' ? 'Start' : 'Place'}
                        </button>
                      )}
                    </div>
                    {i.notes && <p className="mt-1 text-sm text-muted">{i.notes}</p>}
                    {i.assignedGroup && (
                      <p className="mt-1 text-sm text-deep">{i.assignedGroup.displayName}</p>
                    )}
                  </div>
                ))}
                {cards.length === 0 && <p className="text-sm text-muted">None.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
