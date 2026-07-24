'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Hierarchy } from '@/lib/api';

/**
 * Phone presentation of the same graph (<768px): a scrollable accordion of
 * groups, each expandable to leaders + disciples. Leaders with zero disciples
 * stay visible with an open-capacity badge (invariant #10).
 */
export function HierarchyAccordion({ hierarchy }: { hierarchy: Hierarchy }) {
  return (
    <div className="flex flex-col gap-2">
      {hierarchy.groups.map((g) => (
        <GroupRow key={g.id} g={g} />
      ))}
      {hierarchy.groups.length === 0 && <p className="text-muted">No Groups To Show.</p>}
    </div>
  );
}

function GroupRow({ g }: { g: Hierarchy['groups'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink-soft">{g.displayName}</span>
          <span className="text-xs text-muted">
            {g.leaders.length} Leader{g.leaders.length === 1 ? '' : 's'} · {g.disciples.length}{' '}
            Disciple{g.disciples.length === 1 ? '' : 's'}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {g.openCapacity && (
            <span className="rounded-full bg-olive/15 px-2 py-0.5 text-[11px] text-olive">Open</span>
          )}
          <span className="text-muted">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Leaders</p>
          <ul className="mb-3 flex flex-col gap-1">
            {g.leaders.map((l) => (
              <li key={l.personId}>
                <Link href={`/people/${l.personId}`} className="text-ink-soft">
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Disciples</p>
          {g.disciples.length === 0 ? (
            <p className="text-sm text-olive">Open Capacity — No Disciples Yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {g.disciples.map((d) => (
                <li key={d.personId}>
                  <Link href={`/people/${d.personId}`} className="text-ink-soft">
                    {d.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/groups/${g.id}`} className="mt-3 inline-block text-sm text-deep">
            Manage Group →
          </Link>
        </div>
      )}
    </div>
  );
}
