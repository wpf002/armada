'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { TabBar } from '@/components/TabBar';
import { Wordmark } from '@/components/Wordmark';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  useEffect(() => {
    if (!isPending && !session) router.replace('/login');
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <span className="animate-pulse">Loading…</span>
      </div>
    );
  }
  if (!session) return null;

  const initials =
    (user?.name ?? '?')
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <div className="mx-auto min-h-screen max-w-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-cream/85 px-4 py-3 backdrop-blur-md">
        <Link href="/home" aria-label="Home">
          <Wordmark />
        </Link>
        <Link
          href="/me"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-deep text-xs font-semibold text-cream"
          aria-label="Your profile"
        >
          {initials}
        </Link>
      </header>
      <main className="animate-fade-up pb-24">{children}</main>
      <TabBar />
    </div>
  );
}
