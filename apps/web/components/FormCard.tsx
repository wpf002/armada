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
          <span className="text-[13px] text-muted">Not published — no link to share</span>
        )}
        <button
          onClick={toggleArchive}
          disabled={busy}
          className="ml-auto h-8 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-sand disabled:opacity-50"
        >
          {f.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>
    </div>
  );
}
