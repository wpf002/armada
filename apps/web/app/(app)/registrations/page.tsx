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
interface FormRow {
  formId: string;
  name: string;
  isPublished: boolean;
  count: number;
  readable: boolean;
}

export default function RegistrationsPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [forms, setForms] = useState<FormRow[]>([]);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [selected, setSelected] = useState<FormRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ forms: FormRow[] }>('/registrations/forms')
      .then((r) => setForms(r.forms))
      .catch((e) => setErr(String(e)));
    api<{ registrants: Registrant[] }>('/registrations')
      .then((r) => setRegistrants(r.registrants))
      .catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => load(), [load]);

  const rows = useMemo(() => {
    if (!selected) return [];
    return registrants.filter((r) => r.formId === selected.formId);
  }, [registrants, selected]);

  if (user && user.role !== 'ADMIN') return <p className="p-5 text-muted">Admins Only.</p>;
  if (err?.includes('403')) return <p className="p-5 text-muted">Admins Only.</p>;

  // ---- Form picker ----
  if (!selected) {
    return (
      <div className="px-4 pt-5">
        <p className="eyebrow">Fillout</p>
        <h1 className="display text-[26px]">Registration Forms</h1>

        <div className="mt-5 flex flex-col gap-2.5">
          {forms.map((f) => (
            <button
              key={f.formId}
              onClick={() => f.count > 0 && setSelected(f)}
              disabled={f.count === 0}
              className={`flex min-h-[64px] items-center justify-between gap-3 rounded-card border px-4 py-3 text-left transition-colors ${
                f.count > 0
                  ? 'border-line bg-surface hover:bg-sand/50'
                  : 'cursor-default border-dashed border-line bg-transparent'
              }`}
            >
              <span className="min-w-0">
                <span
                  className={`block truncate font-medium ${f.count > 0 ? 'text-ink' : 'text-muted'}`}
                >
                  {f.name}
                </span>
                <span className="block text-sm text-muted">
                  {f.count > 0
                    ? `${f.count} Submission${f.count === 1 ? '' : 's'}`
                    : f.isPublished
                      ? 'Not Readable Through Fillout’s API'
                      : 'Draft — Not Published'}
                </span>
              </span>
              {f.count > 0 && <span className="shrink-0 text-muted">›</span>}
            </button>
          ))}
          {forms.length === 0 && (
            <p className="card px-4 py-6 text-center text-sm text-muted">No Forms Found.</p>
          )}
        </div>
      </div>
    );
  }

  // ---- One form's registrants ----
  return (
    <div className="px-4 pt-5">
      <button
        onClick={() => setSelected(null)}
        className="text-sm text-muted"
      >
        ← All Forms
      </button>
      <h1 className="display mt-2 text-[26px]">{selected.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {selected.count} Submission{selected.count === 1 ? '' : 's'}
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.submissionId} className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{r.name || '(No Name)'}</span>
              <span className="shrink-0 text-xs text-muted">
                {new Date(r.submittedAt).toLocaleDateString()}
              </span>
            </div>
            {(r.email || r.church) && (
              <p className="text-sm text-muted">{[r.email, r.church].filter(Boolean).join(' · ')}</p>
            )}
            {r.lookingFor && <p className="mt-1 text-sm text-ink-soft">{r.lookingFor}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip status={r.status} />
              {r.phone && (
                <a href={`tel:${r.phone}`} className="btn-olive h-9 min-h-0 px-4 text-sm">
                  Call
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
            No Submissions.
          </li>
        )}
      </ul>
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
