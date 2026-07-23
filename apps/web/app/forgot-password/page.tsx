'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { Wordmark } from '@/components/Wordmark';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? 'Could not send the reset link.');
      return;
    }
    // Always show the same confirmation so we don't leak which emails exist.
    setSent(true);
  }

  return (
    <main className="flex min-h-screen flex-col px-5 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark height={38} />

        <div className="ocean mt-7 rounded-hero p-6 text-cream shadow-hero">
          <p className="eyebrow !text-cream/70">Reset Password</p>
          <p className="mt-2 font-slab text-[20px] leading-snug">
            We&apos;ll email you a link to set a new password.
          </p>
        </div>

        {sent ? (
          <div className="mt-8 flex flex-col gap-4">
            <p className="card px-4 py-5 text-sm text-ink-soft">
              If an account exists for <span className="font-medium">{email}</span>, a reset link is
              on its way. Check your inbox and spam folder.
            </p>
            <Link href="/login" className="btn-ghost">
              Back To Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-soft">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[48px] rounded-full border border-line bg-surface px-4 outline-none transition-colors focus:border-deep"
                autoComplete="email"
              />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="btn-olive disabled:opacity-60">
              {busy ? 'Sending…' : 'Send Reset Link'}
            </button>
            <Link href="/login" className="text-center text-sm text-muted hover:text-ink">
              Back To Sign In
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
