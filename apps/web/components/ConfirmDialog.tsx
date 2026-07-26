'use client';

import { useEffect } from 'react';

/**
 * A single, on-theme confirmation modal for destructive actions (removing a
 * member, a leader, a mentorship). Deliberately quiet: cream card, brand lines,
 * one warm-red confirm — no full-bleed red, no alarm iconography. Escape or a
 * backdrop tap cancels, so it's easy to back out of.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Remove',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-hero border border-line bg-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="display text-xl text-ink">{title}</h2>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:bg-sand disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-[#a3402f] px-4 py-2 text-sm font-medium text-cream hover:bg-[#8f3729] disabled:opacity-50"
          >
            {busy ? 'Removing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
