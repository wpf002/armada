'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { TabBar } from '@/components/TabBar';

/**
 * Authenticated app shell: guards the session and renders the mobile tab bar.
 * Redirects to /login when there is no session.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) router.replace('/login');
  }, [isPending, session, router]);

  if (isPending) {
    return <div className="flex min-h-screen items-center justify-center text-slate">Loading…</div>;
  }
  if (!session) return null;

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-20 lg:pb-8">
      {children}
      <TabBar />
    </div>
  );
}
