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

const STAGES: Array<{
  key: Interest['status'];
  label: string;
  next?: Interest['status'];
  nextLabel?: string;
  prev?: Interest['status'];
}> = [
  { key: 'OPEN', label: 'Open', next: 'IN_PROGRESS', nextLabel: 'Start' },
  { key: 'IN_PROGRESS', label: 'In Progress', next: 'PLACED', nextLabel: 'Place', prev: 'OPEN' },
  { key: 'PLACED', label: 'Placed', prev: 'IN_PROGRESS' },
];

export default function PipelinePage() {
  const [items, setItems] = useState<Interest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ interests: Interest[] }>('/interests?type=WANTS_DISCIPLESHIP').then((r) =>
      setItems(r.interests),
    );
  }, []);
  useEffect(() => load(), [load]);

  async function move(id: string, status: Interest['status']) {
    setBusy(id);
    try {
      await api(`/interests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-4 pt-5">
      <p className="eyebrow">Discipleship</p>
      <h1 className="display text-[26px]">Wants To Be Discipled</h1>
      <p className="mt-1 text-sm text-muted">
        Move People Through Open → In Progress → Placed. You Can Always Move Someone Back.
      </p>

      <div className="mt-5 flex flex-col gap-6">
        {STAGES.map((stage) => {
          const cards = items.filter((i) => i.status === stage.key);
          return (
            <section key={stage.key}>
              <p className="eyebrow mb-2">
                {stage.label} · {cards.length}
              </p>
              <div className="flex flex-col gap-2">
                {cards.map((i) => (
                  <div key={i.id} className="card p-4">
                    <Link href={`/people/${i.person.id}`} className="block min-w-0">
                      <span className="block font-medium text-ink">{i.person.name}</span>
                      {i.notes && <span className="block text-sm text-muted">{i.notes}</span>}
                      {i.assignedGroup && (
                        <span className="mt-1 block text-sm text-deep">
                          {i.assignedGroup.displayName}
                        </span>
                      )}
                    </Link>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {stage.prev && (
                        <button
                          disabled={busy === i.id}
                          onClick={() => move(i.id, stage.prev!)}
                          className="btn-ghost h-9 min-h-0 px-3 text-sm disabled:opacity-50"
                        >
                          ← Move Back
                        </button>
                      )}
                      {stage.next && (
                        <button
                          disabled={busy === i.id}
                          onClick={() => move(i.id, stage.next!)}
                          className="btn-deep h-9 min-h-0 px-4 text-sm disabled:opacity-50"
                        >
                          {stage.nextLabel} →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="rounded-card border border-dashed border-line px-4 py-4 text-center text-sm text-muted">
                    None
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
