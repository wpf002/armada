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

      <div className="grid grid-cols-2 gap-3">
        <HomeCard href="/directory" title="Directory" subtitle="Find anyone" />
        <HomeCard href="/me" title="My profile" subtitle="View & edit" />
        <HomeCard href="/groups" title="Groups" subtitle="Hierarchy" />
        <HomeCard href="/calendar" title="Calendar" subtitle="Coming soon" muted />
        {user?.role === 'ADMIN' && (
          <HomeCard href="/admin/intake" title="Intake queue" subtitle="New registrations" />
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
