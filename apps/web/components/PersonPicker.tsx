'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, personDisplayName, type DirectoryPerson } from '@/lib/api';

/**
 * Type-ahead over the directory. Used everywhere an admin has to name a person
 * — adding a leader to a group, pairing a mentor with a mentee — so the picker
 * behaves identically in each place and always resolves to a real Person id
 * (invariant #1: one Person per human, never a free-text name).
 */
export function PersonPicker({
  label,
  value,
  onChange,
  exclude = [],
  only,
  placeholder = 'Search People…',
}: {
  label?: string;
  value: DirectoryPerson | null;
  onChange: (p: DirectoryPerson | null) => void;
  /** Person ids that cannot be chosen (e.g. the already-picked mentor). */
  exclude?: string[];
  /** When set, ONLY these person ids may be chosen (e.g. leaders only). */
  only?: string[];
  placeholder?: string;
}) {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<{ people: DirectoryPerson[] }>('/people')
      .then((r) => setPeople(r.people))
      .catch(() => {});
  }, []);

  // Content keys so fresh-but-identical arrays don't re-trigger the filter.
  const excludeKey = exclude.join(',');
  const onlyKey = only ? only.join(',') : null;

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const allowed = onlyKey === null ? null : new Set(onlyKey.split(','));
    return people
      .filter((p) => !excludeKey.split(',').includes(p.id))
      .filter((p) => allowed === null || allowed.has(p.id))
      .filter((p) => personDisplayName(p).toLowerCase().includes(needle))
      .slice(0, 8);
    // `exclude`/`only` are fresh arrays each render; compare by content.
  }, [q, people, excludeKey, onlyKey]);

  if (value) {
    return (
      <div>
        {label && <p className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</p>}
        <div className="flex min-h-[44px] items-center justify-between rounded-lg border border-deep bg-sand/50 px-3">
          <span className="truncate font-medium text-ink">{personDisplayName(value)}</span>
          <button
            onClick={() => {
              onChange(null);
              setQ('');
            }}
            className="shrink-0 pl-3 text-sm text-muted hover:text-ink"
          >
            change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <p className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</p>}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-deep"
      />
      {results.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-lg border border-line bg-surface">
          {results.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onChange(p)}
                className="w-full px-3 py-2.5 text-left text-ink-soft hover:bg-sand"
              >
                {personDisplayName(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
