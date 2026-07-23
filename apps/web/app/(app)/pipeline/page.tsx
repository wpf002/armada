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

const STAGES: Array<{ key: Interest['status']; label: string }> = [
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'PLACED', label: 'Placed' },
];

export default function PipelinePage() {
  const [items, setItems] = useState<Interest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Interest['status'] | null>(null);

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
        Drag Someone Between Stages. You Can Always Move Them Back.
      </p>

      <div className="mt-5 flex flex-col gap-6">
        {STAGES.map((stage) => {
          const cards = items.filter((i) => i.status === stage.key);
          return (
            <section
              key={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.key);
              }}
              onDragLeave={() => setOverStage((s2) => (s2 === stage.key ? null : s2))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                if (dragId) move(dragId, stage.key);
                setDragId(null);
              }}
              className={`rounded-card p-2 transition-colors ${
                overStage === stage.key ? 'bg-olive/10 ring-2 ring-olive/40' : ''
              }`}
            >
              <p className="eyebrow mb-2 px-1">
                {stage.label} · {cards.length}
              </p>
              <div className="flex flex-col gap-2">
                {cards.map((i) => (
                  <div
                    key={i.id}
                    draggable
                    onDragStart={() => setDragId(i.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    className={`card cursor-grab p-4 active:cursor-grabbing ${
                      busy === i.id ? 'opacity-50' : ''
                    } ${dragId === i.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 select-none text-muted" aria-hidden>
                        ⠿
                      </span>
                      <Link href={`/people/${i.person.id}`} className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{i.person.name}</span>
                        {i.notes && <span className="block text-sm text-muted">{i.notes}</span>}
                        {i.assignedGroup && (
                          <span className="mt-1 block text-sm text-deep">
                            {i.assignedGroup.displayName}
                          </span>
                        )}
                      </Link>
                    </div>
                    {/* Touch fallback: dragging isn't available on most phones */}
                    <div className="mt-3 flex flex-wrap gap-2 md:hidden">
                      {STAGES.filter((s2) => s2.key !== stage.key).map((s2) => (
                        <button
                          key={s2.key}
                          disabled={busy === i.id}
                          onClick={() => move(i.id, s2.key)}
                          className="btn-ghost h-8 min-h-0 px-3 text-xs disabled:opacity-50"
                        >
                          → {s2.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                    Drag Someone Here
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
