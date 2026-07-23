'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

interface Registrant {
  submissionId: string;
  personId: string | null;
  submittedAt: string;
  name: string;
  email: string | null;
  phone: string | null;
  church: string | null;
  lookingFor: string | null;
  status: string;
}

interface Connection {
  connected: boolean;
  formId: string;
  message: string;
}

export default function RegistrationsPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [rows, setRows] = useState<Registrant[]>([]);
  const [conn, setConn] = useState<Connection | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ registrants: Registrant[] }>('/registrations')
      .then((r) => setRows(r.registrants))
      .catch((e) => setErr(String(e)));
    api<Connection>('/registrations/connection').then(setConn).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  if (user && user.role !== 'ADMIN') return <p className="p-5 text-muted">Admins Only.</p>;
  if (err?.includes('403')) return <p className="p-5 text-muted">Admins Only.</p>;

  return (
    <div className="px-4 pt-5">
      <p className="eyebrow">Armada Registration Form</p>
      <h1 className="display text-[26px]">
        {rows.length} Registration{rows.length === 1 ? '' : 's'}
      </h1>

      {/* Fillout connection status */}
      {conn && (
        <div
          className={`card mt-4 flex items-start gap-3 px-4 py-3 ${
            conn.connected ? '' : 'border-olive/40'
          }`}
        >
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
              conn.connected ? 'bg-olive' : 'bg-muted'
            }`}
          />
          <span className="text-sm">
            <span className="block font-medium text-ink">
              {conn.connected ? 'Fillout Connected' : 'Fillout Not Connected'}
            </span>
            <span className="block text-muted">{conn.message}</span>
          </span>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.submissionId} className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{r.name || '(No Name)'}</span>
              <span className="shrink-0 text-xs text-muted">
                {new Date(r.submittedAt).toLocaleDateString()}
              </span>
            </div>
            {r.church && <p className="text-sm text-muted">{r.church}</p>}
            {r.lookingFor && <p className="mt-1 text-sm text-ink-soft">{r.lookingFor}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.phone && (
                <a href={`tel:${r.phone}`} className="btn-olive h-9 min-h-0 px-4 text-sm">
                  Call
                </a>
              )}
              {r.email && (
                <a href={`mailto:${r.email}`} className="btn-ghost h-9 min-h-0 px-4 text-sm">
                  Email
                </a>
              )}
              {r.personId && (
                <Link href={`/people/${r.personId}`} className="btn-ghost h-9 min-h-0 px-4 text-sm">
                  View Profile
                </Link>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="card px-4 py-6 text-center text-sm text-muted">
            No One Has Filled Out The Registration Form Yet.
          </li>
        )}
      </ul>
    </div>
  );
}
