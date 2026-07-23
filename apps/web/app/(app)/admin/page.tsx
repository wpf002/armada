'use client';

import Link from 'next/link';
import { API_BASE } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

export default function AdminHub() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  if (user && user.role !== 'ADMIN') return <p className="p-5 text-muted">Admins only.</p>;

  const cards = [
    { href: '/admin/users', title: 'Users & Roles', sub: 'Invite, Promote' },
    { href: '/registrations', title: 'Registrations', sub: 'Armada Sign-Ups' },
  ];

  return (
    <div className="px-4 pt-4">
      <p className="eyebrow">Admin</p>
      <h1 className="mb-4 display text-2xl text-ink">Manage</h1>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-card border border-line bg-surface p-4">
            <span className="block display text-lg text-ink">{c.title}</span>
            <span className="text-sm text-muted">{c.sub}</span>
          </Link>
        ))}
        <a
          href={`${API_BASE}/admin/export/people.csv`}
          className="rounded-card border border-line bg-surface p-4"
        >
          <span className="block display text-lg text-ink">Export CSV</span>
          <span className="text-sm text-muted">Permission-aware</span>
        </a>
      </div>
    </div>
  );
}
