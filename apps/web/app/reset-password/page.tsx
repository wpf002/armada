'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Wordmark } from '@/components/Wordmark';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) {
      setError(error.message ?? 'That reset link is invalid or has expired.');
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <div className="mt-8">
        <p className="card px-4 py-5 text-sm text-ink-soft">
          This reset link is missing its token. Request a new one.
        </p>
        <Link href="/forgot-password" className="btn-ghost mt-4 w-full">
          Request A New Link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p className="card px-4 py-5 text-sm text-ink-soft">Your password has been updated.</p>
        <Link href="/login" className="btn-olive">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-soft">New Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-[48px] rounded-full border border-line bg-surface px-4 outline-none focus:border-deep"
          autoComplete="new-password"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-soft">Confirm Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-[48px] rounded-full border border-line bg-surface px-4 outline-none focus:border-deep"
          autoComplete="new-password"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="btn-olive disabled:opacity-60">
        {busy ? 'Updating…' : 'Update Password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col px-5 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark height={38} />
        <div className="ocean mt-7 rounded-hero p-6 text-cream shadow-hero">
          <p className="eyebrow !text-cream/70">Reset Password</p>
          <p className="mt-2 font-slab text-[20px] leading-snug">Choose a new password.</p>
        </div>
        <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
