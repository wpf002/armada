'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

interface Candidate {
  personId: string;
  score: number;
  reason: string;
  name: string;
  email: string | null;
}
interface Registrant {
  submissionId: string;
  formId: string;
  formName: string;
  personId: string | null;
  submittedAt: string;
  status: string;
  name: string;
  email: string | null;
  phone: string | null;
  church: string | null;
  lookingFor: string | null;
  candidates: Candidate[];
}
interface FormRef {
  formId: string;
  formName: string;
  count: number;
}
interface Payload {
  registrants: Registrant[];
  forms: FormRef[];
  needsReview: number;
}
interface Connection {
  connected: boolean;
  formId: string;
  message: string;
}

export default function RegistrationsPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [data, setData] = useState<Payload | null>(null);
  const [conn, setConn] = useState<Connection | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [formFilter, setFormFilter] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Payload>('/registrations')
      .then(setData)
      .catch((e) => setErr(String(e)));
    api<Connection>('/registrations/connection').then(setConn).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.registrants.filter(
      (r) =>
        (!needsOnly || r.status === 'NEEDS_REVIEW') &&
        (formFilter === 'all' || r.formId === formFilter),
    );
  }, [data, needsOnly, formFilter]);

  // Group the visible rows by the form they came from.
  const grouped = useMemo(() => {
    const m = new Map<string, { formName: string; rows: Registrant[] }>();
    for (const r of visible) {
      const g = m.get(r.formId) ?? { formName: r.formName, rows: [] };
      g.rows.push(r);
      m.set(r.formId, g);
    }
    return [...m.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length);
  }, [visible]);

  async function act(id: string, path: string, body?: object) {
    setBusy(id);
    try {
      await api(`/admin/intake/${id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (user && user.role !== 'ADMIN') return <p className="p-5 text-muted">Admins Only.</p>;
  if (err?.includes('403')) return <p className="p-5 text-muted">Admins Only.</p>;

  return (
    <div className="px-4 pt-5">
      <p className="eyebrow">Fillout Sign-Ups</p>
      <h1 className="display text-[26px]">
        {data ? `${data.registrants.length} Registrations` : 'Registrations'}
      </h1>

      {/* Connection status */}
      {conn && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${conn.connected ? 'bg-olive' : 'bg-muted'}`}
          />
          <span className="text-sm text-muted">
            {conn.connected ? 'Fillout Connected' : 'Fillout Not Connected'}
          </span>
        </div>
      )}

      {/* Needs-review filter */}
      {data && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setNeedsOnly(false)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              !needsOnly ? 'bg-deep text-cream' : 'border border-line text-ink-soft'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setNeedsOnly(true)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              needsOnly ? 'bg-deep text-cream' : 'border border-line text-ink-soft'
            }`}
          >
            Needs Review
            {data.needsReview > 0 && (
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                  needsOnly ? 'bg-cream/25' : 'bg-olive/20 text-olive'
                }`}
              >
                {data.needsReview}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Form filter — full-width buttons stacked below */}
      {data && data.forms.length > 1 && (
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={() => setFormFilter('all')}
            className={`flex min-h-[48px] items-center justify-between rounded-card border px-4 text-left text-sm font-medium transition-colors ${
              formFilter === 'all'
                ? 'border-deep bg-deep text-cream'
                : 'border-line bg-surface text-ink-soft hover:bg-sand/50'
            }`}
          >
            <span>All Forms</span>
            <span className={formFilter === 'all' ? 'text-cream/70' : 'text-muted'}>
              {data.registrants.length}
            </span>
          </button>
          {data.forms.map((f) => (
            <button
              key={f.formId}
              onClick={() => setFormFilter(f.formId)}
              className={`flex min-h-[48px] items-center justify-between gap-3 rounded-card border px-4 text-left text-sm font-medium transition-colors ${
                formFilter === f.formId
                  ? 'border-deep bg-deep text-cream'
                  : 'border-line bg-surface text-ink-soft hover:bg-sand/50'
              }`}
            >
              <span className="min-w-0 truncate">{f.formName}</span>
              <span className={formFilter === f.formId ? 'text-cream/70' : 'text-muted'}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Grouped by form */}
      <div className="mt-5 flex flex-col gap-6">
        {grouped.map(([formId, group]) => (
          <section key={formId}>
            <p className="eyebrow mb-2">
              {group.formName} · {group.rows.length}
            </p>
            <ul className="flex flex-col gap-2.5">
              {group.rows.map((r) => (
                <li key={r.submissionId} className="card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{r.name || '(No Name)'}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {new Date(r.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {(r.email || r.church) && (
                    <p className="text-sm text-muted">
                      {[r.email, r.church].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {r.lookingFor && <p className="mt-1 text-sm text-ink-soft">{r.lookingFor}</p>}

                  {/* Review actions */}
                  {r.status === 'NEEDS_REVIEW' ? (
                    <div className="mt-3 rounded-2xl border border-olive/35 bg-olive/5 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-olive">
                        Possible Matches
                      </p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {r.candidates.map((c) => (
                          <li key={c.personId} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 text-sm">
                              <span className="block truncate text-ink">{c.name}</span>
                              <span className="block truncate text-xs text-muted">
                                {Math.round(c.score * 100)}% · {c.reason}
                              </span>
                            </span>
                            <button
                              disabled={busy === r.submissionId}
                              onClick={() =>
                                act(r.submissionId, 'link', { personId: c.personId })
                              }
                              className="btn-deep h-8 min-h-0 shrink-0 px-3 text-xs disabled:opacity-50"
                            >
                              Same Person
                            </button>
                          </li>
                        ))}
                        {r.candidates.length === 0 && (
                          <li className="text-sm text-muted">No Candidates.</li>
                        )}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          disabled={busy === r.submissionId}
                          onClick={() => act(r.submissionId, 'create')}
                          className="btn-olive h-9 min-h-0 px-4 text-sm disabled:opacity-50"
                        >
                          New Person
                        </button>
                        <button
                          disabled={busy === r.submissionId}
                          onClick={() => act(r.submissionId, 'ignore')}
                          className="btn-ghost h-9 min-h-0 px-4 text-sm disabled:opacity-50"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusChip status={r.status} />
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="btn-olive h-9 min-h-0 px-4 text-sm">
                          Call
                        </a>
                      )}
                      {r.personId && (
                        <Link
                          href={`/people/${r.personId}`}
                          className="btn-ghost h-9 min-h-0 px-4 text-sm"
                        >
                          View Profile
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {data && visible.length === 0 && (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            {needsOnly ? 'Nothing Left To Review.' : 'No Registrations Yet.'}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    LINKED_EXISTING: { label: 'Matched', cls: 'bg-sand text-ink-soft' },
    CREATED_NEW: { label: 'New Person', cls: 'bg-olive/15 text-olive' },
    NEEDS_REVIEW: { label: 'Needs Review', cls: 'bg-olive/20 text-olive' },
    IGNORED: { label: 'Ignored', cls: 'border border-dashed border-line text-muted' },
    NEW: { label: 'New', cls: 'bg-sand text-ink-soft' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-sand text-ink-soft' };
  return <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${s.cls}`}>{s.label}</span>;
}
