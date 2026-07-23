'use client';

import Link from 'next/link';
import { API_BASE } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

export default function AdminHub() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  if (user && user.role !== 'ADMIN') return <p className="p-5 text-slate">Admins only.</p>;

  const cards = [
    { href: '/admin/users', title: 'Users & roles', sub: 'Invite, promote' },
    { href: '/admin/intake', title: 'Intake queue', sub: 'New registrations' },
    { href: '/admin/audit', title: 'Audit log', sub: 'Who changed what' },
    { href: '/admin/unassigned', title: 'Unassigned', sub: 'Falling through' },
  ];

  return (
    <div className="px-4 pt-4">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Admin</p>
      <h1 className="mb-4 font-display text-2xl text-ink">Manage</h1>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-xl border border-grey-200 bg-white p-4">
            <span className="block font-display text-lg text-ink">{c.title}</span>
            <span className="text-sm text-slate">{c.sub}</span>
          </Link>
        ))}
        <a
          href={`${API_BASE}/admin/export/people.csv`}
          className="rounded-xl border border-grey-200 bg-white p-4"
        >
          <span className="block font-display text-lg text-ink">Export CSV</span>
          <span className="text-sm text-slate">Permission-aware</span>
        </a>
      </div>
    </div>
  );
}
