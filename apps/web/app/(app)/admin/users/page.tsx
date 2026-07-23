'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface U {
  id: string;
  email: string;
  role: 'ADMIN' | 'LEADER' | 'MEMBER';
  personId: string;
  name: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'MEMBER' as U['role'] });
  const [temp, setTemp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ users: U[] }>('/admin/users')
      .then((r) => setUsers(r.users))
      .catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => load(), [load]);

  async function setRole(id: string, role: U['role']) {
    try {
      await api(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      load();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setTemp(null);
    try {
      const r = await api<{ tempPassword: string }>('/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify(invite),
      });
      setTemp(r.tempPassword);
      setInvite({ email: '', name: '', role: 'MEMBER' });
      load();
    } catch (e) {
      setErr(String(e));
    }
  }

  if (err?.includes('403')) return <p className="p-5 text-slate">Admins only.</p>;

  return (
    <div className="px-4 pt-4">
      <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Users</p>
      <h1 className="mb-3 font-display text-2xl text-ink">{users.length} users</h1>

      <form onSubmit={sendInvite} className="mb-4 flex flex-col gap-2 rounded-xl border border-grey-200 bg-white p-3">
        <p className="text-xs uppercase tracking-wide text-slate">Invite a login</p>
        <input required type="email" placeholder="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="min-h-[40px] rounded-lg border border-grey-300 px-3" />
        <input placeholder="name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} className="min-h-[40px] rounded-lg border border-grey-300 px-3" />
        <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as U['role'] })} className="min-h-[40px] rounded-lg border border-grey-300 px-3">
          <option value="MEMBER">Member</option>
          <option value="LEADER">Leader</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className="min-h-[44px] rounded-lg bg-deep text-cream">Send invite</button>
      </form>

      {temp && (
        <p className="mb-3 rounded-lg bg-olive/10 p-3 text-sm text-olive">
          Temporary password (share once, they reset on login): <b>{temp}</b>
        </p>
      )}
      {err && !err.includes('403') && <p className="mb-2 text-sm text-red-600">{err}</p>}

      <ul className="flex flex-col divide-y divide-grey-200">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-2">
            <span className="min-w-0">
              <span className="block truncate text-ink-soft">{u.name}</span>
              <span className="block truncate text-sm text-slate">{u.email}</span>
            </span>
            <select
              value={u.role}
              onChange={(e) => setRole(u.id, e.target.value as U['role'])}
              className="rounded-lg border border-grey-300 px-2 py-1 text-sm"
            >
              <option value="MEMBER">Member</option>
              <option value="LEADER">Leader</option>
              <option value="ADMIN">Admin</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
