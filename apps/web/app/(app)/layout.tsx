'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { SideNav } from '@/components/SideNav';
import { Wordmark } from '@/components/Wordmark';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;
  const [navOpen, setNavOpen] = useState(false);

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
    <>
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} user={user} />

      <div className="mx-auto min-h-screen max-w-2xl">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-cream/85 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-sand"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1e1c18" strokeWidth="1.9" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <Link href="/home" aria-label="Home">
              <Wordmark height={28} />
            </Link>
          </div>
          <Link
            href="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-deep text-xs font-semibold text-cream"
            aria-label="Your profile"
          >
            {initials}
          </Link>
        </header>
        <main className="animate-fade-up pb-16">{children}</main>
      </div>
    </>
  );
}
