'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

interface Candidate {
  personId: string;
  score: number;
  reason: string;
}
interface Submission {
  id: string;
  filloutSubmissionId: string;
  submittedAt: string;
  intakeStatus: string;
  personId: string | null;
  matchCandidates: Candidate[] | null;
  raw: unknown;
}

function preview(raw: unknown): { name: string; email: string } {
  const r = raw as { submission?: { questions?: Array<{ name?: string; value?: unknown }> }; questions?: Array<{ name?: string; value?: unknown }> };
  const qs = r?.submission?.questions ?? r?.questions ?? [];
  const find = (label: string) =>
    String(qs.find((q) => q.name?.toLowerCase() === label)?.value ?? '');
  return { name: find('name'), email: find('email') };
}

export default function IntakePage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [subs, setSubs] = useState<Submission[]>([]);
  const [tab, setTab] = useState<'NEEDS_REVIEW' | 'CREATED_NEW' | 'LINKED_EXISTING'>('NEEDS_REVIEW');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ submissions: Submission[] }>(`/admin/intake?status=${tab}`)
      .then((r) => setSubs(r.submissions))
      .catch((e) => setMsg(String(e)));
  }, [tab]);

  useEffect(() => load(), [load]);

  if (user && user.role !== 'ADMIN') {
    return <p className="p-5 text-slate">Admins only.</p>;
  }

  async function act(path: string, body?: object) {
    setMsg(null);
    try {
      await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      load();
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <div className="px-4 pt-4">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Intake queue</p>
      <h1 className="mb-3 font-display text-2xl text-ink">Registrations</h1>

      <div className="mb-3 flex gap-2 text-sm">
        {(['NEEDS_REVIEW', 'CREATED_NEW', 'LINKED_EXISTING'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 ${tab === t ? 'bg-deep text-cream' : 'bg-grey-200 text-slate-dark'}`}
          >
            {t.toLowerCase().replace('_', ' ')}
          </button>
        ))}
      </div>

      {msg && <p className="text-red-600">{msg}</p>}
      {subs.length === 0 && <p className="text-slate">Nothing here.</p>}

      <ul className="flex flex-col gap-3">
        {subs.map((s) => {
          const p = preview(s.raw);
          return (
            <li key={s.id} className="rounded-xl border border-grey-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-ink-soft">{p.name || '(no name)'}</span>
                <span className="text-xs text-slate">{new Date(s.submittedAt).toLocaleDateString()}</span>
              </div>
              {p.email && <p className="text-sm text-slate">{p.email}</p>}

              {tab === 'NEEDS_REVIEW' && (
                <>
                  <p className="mt-3 text-xs uppercase tracking-wide text-slate">Possible matches</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {(s.matchCandidates ?? []).map((c) => (
                      <li key={c.personId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-slate-dark">
                          {c.reason} · {Math.round(c.score * 100)}%
                        </span>
                        <button
                          onClick={() => act(`/admin/intake/${s.id}/link`, { personId: c.personId })}
                          className="shrink-0 rounded-lg bg-deep px-3 py-1 text-cream"
                        >
                          link
                        </button>
                      </li>
                    ))}
                    {(s.matchCandidates ?? []).length === 0 && (
                      <li className="text-sm text-slate">No candidates.</li>
                    )}
                  </ul>
                  <div className="mt-3 flex gap-2 text-sm">
                    <button
                      onClick={() => act(`/admin/intake/${s.id}/create`)}
                      className="rounded-lg border border-deep px-3 py-1 text-deep"
                    >
                      Create new person
                    </button>
                    <button
                      onClick={() => act(`/admin/intake/${s.id}/ignore`)}
                      className="rounded-lg border border-grey-300 px-3 py-1 text-slate"
                    >
                      Ignore
                    </button>
                  </div>
                </>
              )}

              {tab !== 'NEEDS_REVIEW' && s.personId && (
                <a href={`/people/${s.personId}`} className="mt-2 inline-block text-sm text-deep">
                  View person →
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
