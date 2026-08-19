'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export interface FormRow {
  formId: string;
  name: string;
  isPublished: boolean;
  count: number;
  readable: boolean;
  /** Public link to send people, or null for an unpublished draft. */
  shareUrl: string | null;
  archived: boolean;
}

/**
 * One form: tap the body to read its responses, or copy the public link to
 * send it. A form Fillout can't serve gets no link rather than a dead one.
 */
export function FormCard({
  f,
  onOpen,
  onArchived,
}: {
  f: FormRow;
  onOpen: () => void;
  onArchived: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.shareUrl ?? '');
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    if (!f.shareUrl) return;
    try {
      await navigator.clipboard.writeText(f.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked outside a secure context; the link is still
      // reachable through Open, so fail quietly rather than alarming anyone.
    }
  }

  async function saveLink() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/registrations/forms/${f.formId}`, {
        method: 'PATCH',
        body: JSON.stringify({ shareUrl: draft.trim() }),
      });
      setEditing(false);
      onArchived();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      await api(`/registrations/forms/${f.formId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !f.archived }),
      });
      onArchived();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface">
      <button
        onClick={onOpen}
        className="flex w-full min-h-[64px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sand/50"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{f.name}</span>
          <span className="block text-sm text-muted">
            {f.count > 0
              ? `${f.count} Submission${f.count === 1 ? '' : 's'}`
              : f.isPublished
                ? 'No Responses Retrieved'
                : 'Draft'}
          </span>
        </span>
        <span className="shrink-0 text-muted">›</span>
      </button>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        {f.shareUrl ? (
          <>
            <button
              onClick={copy}
              className="h-8 rounded-full border border-line px-3 text-[13px] text-ink transition-colors hover:bg-sand"
            >
              {copied ? 'Copied' : 'Copy Link'}
            </button>
            <a
              href={f.shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 rounded-full border border-line px-3 text-[13px] leading-8 text-ink transition-colors hover:bg-sand"
            >
              Open
            </a>
          </>
        ) : (
          <span className="text-[13px] text-muted">No link yet</span>
        )}
        <button
          onClick={() => {
            setDraft(f.shareUrl ?? '');
            setEditing((v) => !v);
          }}
          className="h-8 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-sand"
        >
          {f.shareUrl ? 'Edit Link' : 'Set Link'}
        </button>
        <button
          onClick={toggleArchive}
          disabled={busy}
          className="ml-auto h-8 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-sand disabled:opacity-50"
        >
          {f.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>

      {editing && (
        <div className="border-t border-line px-4 py-3">
          <label className="eyebrow" htmlFor={`link-${f.formId}`}>
            Public Link
          </label>
          <input
            id={`link-${f.formId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
            className="mt-1.5 w-full rounded-full border border-line bg-cream/50 px-4 py-2 text-sm text-ink outline-none focus:border-olive"
          />
          <p className="mt-1.5 text-xs text-muted">
            Paste the link people should open. Leave it empty to fall back to the default
            Fillout address.
          </p>
          {err && <p className="mt-1.5 text-xs text-red-600">{err}</p>}
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={saveLink}
              disabled={busy}
              className="btn-olive h-9 min-h-0 px-4 text-sm disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-9 rounded-full border border-line px-4 text-sm text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
