'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A single, on-theme confirmation modal for destructive actions (removing a
 * member, a leader, a mentorship). Deliberately quiet: cream card, brand lines,
 * one warm-red confirm — no full-bleed red, no alarm iconography. Escape or a
 * backdrop tap cancels, so it's easy to back out of.
 *
 * Rendered through a portal to <body>. The app's <main> carries an
 * `animate-fade-up` transform, and a transformed ancestor becomes the
 * containing block for `position: fixed` — so without the portal this pinned
 * itself to the bottom of the *page* rather than the viewport, landing far
 * off-screen when fired from a row low in a long list.
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
  // Portals need the DOM, so only render after mount (SSR-safe).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      // Anchored near the top: the trigger is often a row far down a long list,
      // and a bottom sheet lands under the thumb, off-screen, or behind the
      // floating dev badge. Top keeps it in view wherever it was fired from.
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-20 backdrop-blur-sm"
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
    </div>,
    document.body,
  );
}
