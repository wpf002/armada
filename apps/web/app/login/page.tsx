'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { Wordmark } from '@/components/Wordmark';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn.email({ email, password });
    if (error) {
      setBusy(false);
      setError(error.message ?? 'Sign in failed');
      return;
    }
    // Full-page load so the app boots with the session cookie already set.
    window.location.assign('/home');
  }

  return (
    <main className="flex min-h-screen flex-col px-5 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <Wordmark height={38} />

        {/* Ocean hero with the mission, echoing the site's full-bleed imagery. */}
        <div className="ocean mt-7 rounded-hero p-6 text-cream shadow-hero">
          <p className="eyebrow !text-cream/70">The mission</p>
          <p className="mt-2 font-slab text-[22px] leading-snug">
            &ldquo;Go therefore and make disciples of all nations.&rdquo;
          </p>
          <p className="mt-2 text-sm text-cream/70">Matthew 28:19</p>
        </div>

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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-soft">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-[48px] rounded-full border border-line bg-surface px-4 outline-none transition-colors focus:border-deep"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="btn-olive mt-1 disabled:opacity-60">
            {busy ? 'Signing In…' : 'Sign In'}
          </button>
          <Link href="/forgot-password" className="text-center text-sm text-muted underline-offset-2 hover:text-ink">
            Forgot Your Password?
          </Link>
        </form>

        <p className="mt-auto pt-10 text-center text-xs text-muted">
          Armada Discipleship · Dallas, TX
        </p>
      </div>
    </main>
  );
}
