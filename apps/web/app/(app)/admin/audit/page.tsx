'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Log {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ logs: Log[] }>('/admin/audit?limit=200')
      .then((r) => setLogs(r.logs))
      .catch((e) => setErr(String(e)));
  }, []);
  if (err?.includes('403')) return <p className="p-5 text-muted">Admins only.</p>;

  return (
    <div className="px-4 pt-4">
      <p className="eyebrow">Audit log</p>
      <h1 className="mb-3 display text-2xl text-ink">Every write</h1>
      <ul className="flex flex-col divide-y divide-line text-sm">
        {logs.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="font-medium text-ink-soft">{l.action}</span>
              <span className="text-muted"> · {l.entity}</span>
              <span className="block truncate text-xs text-muted">{l.entityId}</span>
            </span>
            <span className="shrink-0 text-xs text-muted">
              {new Date(l.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
        {logs.length === 0 && <li className="py-4 text-muted">No entries yet.</li>}
      </ul>
    </div>
  );
}
