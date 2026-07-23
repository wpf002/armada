'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

export default function HomePage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  return (
    <div className="px-5 pt-8">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">
        Armada Discipleship
      </p>
      <h1 className="mb-1 font-display text-3xl text-ink">
        {user?.name ? `Hi, ${user.name.split(' ')[0]}` : 'Welcome'}
      </h1>
      <p className="mb-8 text-slate-dark">
        {user?.role === 'ADMIN'
          ? 'Admin'
          : user?.role === 'LEADER'
            ? 'Group leader'
            : 'Member'}
      </p>

      <p className="mb-2 font-expanded text-xs uppercase tracking-[0.2em] text-slate">Answers</p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <HomeCard href="/leaders" title="Leaders" subtitle="Who leads a group" />
        <HomeCard href="/groups" title="Groups" subtitle="Who's in whose group" />
        <HomeCard href="/mentors" title="Mentors" subtitle="Who mentors leaders" />
        <HomeCard href="/pipeline" title="Discipleship" subtitle="Who wants in" />
      </div>

      <p className="mb-2 font-expanded text-xs uppercase tracking-[0.2em] text-slate">You</p>
      <div className="grid grid-cols-2 gap-3">
        <HomeCard href="/dashboard" title="Dashboard" subtitle="Your work" />
        <HomeCard href="/directory" title="Directory" subtitle="Find anyone" />
        <HomeCard href="/me" title="My profile" subtitle="View & edit" />
        {user?.role === 'ADMIN' && (
          <HomeCard href="/admin" title="Admin" subtitle="Users, audit, export" />
        )}
      </div>
    </div>
  );
}

function HomeCard({
  href,
  title,
  subtitle,
  muted,
}: {
  href: string;
  title: string;
  subtitle: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[96px] flex-col justify-end rounded-xl border border-grey-200 bg-white p-4 ${
        muted ? 'opacity-60' : ''
      }`}
    >
      <span className="font-display text-lg text-ink">{title}</span>
      <span className="text-sm text-slate">{subtitle}</span>
    </Link>
  );
}
