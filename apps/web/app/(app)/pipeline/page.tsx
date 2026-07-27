'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Interest {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'PLACED' | 'DECLINED';
  notes: string | null;
  person: { id: string; name: string };
  assignedGroup: { id: string; displayName: string } | null;
}

const STAGES: Array<{ key: Interest['status']; label: string }> = [
  { key: 'OPEN', label: 'Open' },
  // The stored status stays IN_PROGRESS; Armada calls this stage Onboarding.
  { key: 'IN_PROGRESS', label: 'Onboarding' },
  { key: 'PLACED', label: 'Placed' },
];

export default function PipelinePage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as SessionUser | undefined)?.role === 'ADMIN';
  const [items, setItems] = useState<Interest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Interest['status'] | null>(null);
  const [removing, setRemoving] = useState<Interest | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  /** Live bounds of each stage column, for hit-testing a finger drag. */
  const stageRefs = useRef(new Map<Interest['status'], HTMLElement>());

  const load = useCallback(() => {
    if (!isAdmin) return;
    api<{ interests: Interest[] }>('/interests?type=WANTS_DISCIPLESHIP')
      .then((r) => setItems(r.interests))
      .catch(() => {});
  }, [isAdmin]);
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

  /**
   * Dragging runs on pointer events, not HTML5 drag-and-drop, whose `dragstart`
   * never fires from touch — on a phone the board was unusable.
   *
   * A long press anywhere on the card starts the drag, the way native reorder
   * UIs behave: a drag that only worked from the small grip is invisible when
   * the obvious thing to grab is the name. Moving before the press completes is
   * treated as a scroll and cancels it, so a 63-name list still scrolls
   * normally. Once dragging, a non-passive touchmove listener suppresses
   * scrolling — `touch-action` can't be changed mid-gesture.
   */
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const draggingRef = useRef(false);

  function stageAt(x: number, y: number): Interest['status'] | null {
    for (const [key, el] of stageRefs.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  }

  const endPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    draggingRef.current = false;
    setDragId(null);
    setOverStage(null);
  }, []);

  // Block scrolling only while a drag is actually in progress.
  useEffect(() => {
    if (!dragId) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [dragId]);

  function beginDrag(id: string) {
    draggingRef.current = true;
    setDragId(id);
    // A short buzz confirms the card is now held, as on native lists.
    navigator.vibrate?.(15);
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLElement>, id: string) {
    // Ignore the remove button and the name link.
    if ((e.target as HTMLElement).closest('a,button')) return;
    const timer = window.setTimeout(() => beginDrag(id), 220);
    pressRef.current = { id, x: e.clientX, y: e.clientY, timer };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLElement>) {
    const p = pressRef.current;
    if (!p) return;
    if (!draggingRef.current) {
      // Moved before the press matured — the user is scrolling, not dragging.
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
        window.clearTimeout(p.timer);
        pressRef.current = null;
      }
      return;
    }
    setOverStage(stageAt(e.clientX, e.clientY));
  }

  function onCardPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (draggingRef.current && dragId) {
      const target = stageAt(e.clientX, e.clientY);
      const card = items.find((i) => i.id === dragId);
      if (target && card && card.status !== target) move(dragId, target);
    }
    endPress();
  }

  // Remove from the queue = mark the interest DECLINED. It drops off the board
  // but the record survives (invariant #2, no hard deletes).
  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await api(`/interests/${removing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DECLINED' }),
      });
      setRemoving(null);
      load();
    } finally {
      setRemoveBusy(false);
    }
  }

  // Reachable by direct URL; the API refuses non-admins either way.
  if (session && !isAdmin) return <p className="p-5 text-muted">Admins Only.</p>;

  return (
    <div className="px-4 pt-5">
      <p className="eyebrow">Discipleship</p>
      <h1 className="display text-[26px]">Wants To Be Discipled</h1>
      <p className="mt-1 text-sm text-muted">
        Press and hold a name, then drag it to another stage.
      </p>

      <div className="mt-5 flex flex-col gap-6">
        {STAGES.map((stage) => {
          const cards = items.filter((i) => i.status === stage.key);
          return (
            <section
              key={stage.key}
              ref={(el) => {
                if (el) stageRefs.current.set(stage.key, el);
                else stageRefs.current.delete(stage.key);
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
                    onPointerDown={(e) => onCardPointerDown(e, i.id)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerUp}
                    onPointerCancel={onCardPointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`card select-none p-4 transition-shadow ${
                      busy === i.id ? 'opacity-50' : ''
                    } ${
                      dragId === i.id
                        ? 'scale-[1.02] shadow-lg ring-2 ring-olive/50'
                        : 'cursor-grab active:cursor-grabbing'
                    }`}
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
                      <button
                        onClick={() => setRemoving(i)}
                        aria-label={`Remove ${i.person.name} from the queue`}
                        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-muted hover:bg-sand hover:text-red-600"
                      >
                        ×
                      </button>
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

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.person.name ?? ''}?`}
        message={`${removing?.person.name} will be taken off the discipleship queue. You can re-add them from their profile.`}
        confirmLabel="Remove"
        busy={removeBusy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
