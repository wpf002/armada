'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { API_BASE, api, personDisplayName, type Profile } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Avatar } from '@/components/Avatar';

interface Dashboard {
  role: string;
  myGroups: Array<{ id: string; displayName: string }>;
  myMentees: Array<{ id: string; name: string }>;
  myOpenFollowUps: number;
  admin?: {
    wantsDiscipleship: number;
    unassignedPeople: number;
    groupsWithoutMentor: number;
    openCapacityLeaders: number;
    staleFollowUps: number;
  };
}
interface FollowUp {
  id: string;
  subject: { id: string; name: string; phone: string | null };
}
interface Interest {
  id: string;
  person: { id: string; name: string };
}

const MARITAL = ['', 'SINGLE', 'MARRIED', 'ENGAGED', 'DIVORCED', 'WIDOWED'];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const fileRef = useRef<HTMLInputElement>(null);

  const [person, setPerson] = useState<Profile | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [wants, setWants] = useState<Interest[]>([]);
  const [intake, setIntake] = useState(0);
  const [tab, setTab] = useState<'work' | 'details'>('work');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadWork = useCallback(() => {
    api<Dashboard>('/dashboard').then(setDash).catch(() => {});
    api<{ followups: FollowUp[] }>('/followups?scope=mine')
      .then((r) => setFollowups(r.followups))
      .catch(() => {});
    api<{ interests: Interest[] }>('/interests?type=WANTS_DISCIPLESHIP&status=OPEN')
      .then((r) => setWants(r.interests))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.personId) return;
    api<{ person: Profile }>(`/people/${user.personId}`).then((r) => setPerson(r.person));
    loadWork();
  }, [user?.personId, loadWork]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api<{ registrants: unknown[] }>('/registrations')
        .then((r) => setIntake(r.registrants.length))
        .catch(() => {});
    }
  }, [user?.role]);

  if (!user || !person) return <p className="p-5 text-muted">Loading…</p>;

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setPerson((p) => (p ? { ...p, [k]: v } : p));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!person || !user) return;
    setSaving(true);
    setMsg(null);
    try {
      await api(`/people/${user.personId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          preferredName: person.preferredName || null,
          phone: person.phone || null,
          address: person.address || null,
          occupation: person.occupation || null,
          churchAffiliation: person.churchAffiliation || null,
          bio: person.bio || null,
          maritalStatus: person.maritalStatus || null,
        }),
      });
      setMsg('Saved.');
    } catch (err) {
      setMsg(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!user) return;
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch(`${API_BASE}/people/${user.personId}/photo`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    if (res.ok) {
      const { photoUrl } = (await res.json()) as { photoUrl: string };
      set('photoUrl', photoUrl);
      setMsg('Photo Updated.');
    } else {
      setMsg('Photo Upload Failed.');
    }
  }

  async function completeFollowUp(id: string) {
    await api(`/followups/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
    loadWork();
  }

  const isLeader = (dash?.myGroups.length ?? 0) > 0;
  const isAdmin = user.role === 'ADMIN';
  const hasWork = followups.length > 0 || (isAdmin && (wants.length > 0 || intake > 0));

  return (
    <div className="px-4 pt-5">
      {/* Identity */}
      <header className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative" aria-label="Change photo">
          <Avatar person={person} size={68} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-deep px-1.5 py-0.5 text-[10px] text-cream">
            Edit
          </span>
        </button>
        <div className="min-w-0">
          <p className="eyebrow">{greeting()}</p>
          <h1 className="display truncate text-[26px]">{personDisplayName(person)}</h1>
          <p className="text-sm capitalize text-muted">{user.role.toLowerCase()}</p>
        </div>
      </header>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
      />

      {/* Tabs */}
      <div className="mt-5 flex gap-2">
        {(['work', 'details'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === t ? 'bg-deep text-cream' : 'border border-line text-ink-soft'
            }`}
          >
            {t === 'work' ? 'Overview' : 'Account'}
          </button>
        ))}
      </div>

      {tab === 'work' && (
        <div className="mt-5 flex flex-col gap-6">
          {/* Action needed */}
          {hasWork ? (
            <section>
              <p className="eyebrow mb-2">Action Needed</p>
              <div className="card divide-y divide-line">
                {followups.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <Link href={`/people/${f.subject.id}`} className="min-w-0">
                      <span className="block truncate font-medium text-ink">{f.subject.name}</span>
                      <span className="text-sm text-muted">Reach Out</span>
                    </Link>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => completeFollowUp(f.id)}
                        className="btn-ghost h-9 min-h-0 px-3 text-sm"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ))}

                {isAdmin && wants.length > 0 && (
                  <Link href="/pipeline" className="flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="block font-medium text-ink">
                        {wants.length} Waiting To Be Discipled
                      </span>
                      <span className="truncate text-sm text-muted">
                        {wants.slice(0, 3).map((w) => w.person.name.split(' ')[0]).join(', ')}
                        {wants.length > 3 ? '…' : ''}
                      </span>
                    </span>
                    <span className="text-muted">›</span>
                  </Link>
                )}

                {isAdmin && intake > 0 && (
                  <Link href="/registrations" className="flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="block font-medium text-ink">
                        {intake} Registration{intake === 1 ? '' : 's'}
                      </span>
                      <span className="text-sm text-muted">From The Armada Sign-Up Form</span>
                    </span>
                    <span className="text-muted">›</span>
                  </Link>
                )}
              </div>
            </section>
          ) : (
            <p className="card px-4 py-5 text-sm text-muted">Nothing Needs You Right Now.</p>
          )}

          {/* Your group — leaders only */}
          {isLeader && (
            <section>
              <p className="eyebrow mb-2">
                Your {dash!.myGroups.length === 1 ? 'Group' : 'Groups'}
              </p>
              <div className="flex flex-col gap-2">
                {dash!.myGroups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/${g.id}`}
                    className="card flex items-center justify-between px-4 py-3.5"
                  >
                    <span className="font-medium text-ink">{g.displayName}</span>
                    <span className="text-muted">›</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Mentees */}
          {dash && dash.myMentees.length > 0 && (
            <section>
              <p className="eyebrow mb-2">Your Mentees</p>
              <div className="card divide-y divide-line">
                {dash.myMentees.map((m) => (
                  <Link key={m.id} href={`/people/${m.id}`} className="flex items-center justify-between px-4 py-3">
                    <span className="font-medium text-ink">{m.name}</span>
                    <span className="text-muted">›</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* The fleet — admins only */}
          {isAdmin && dash?.admin && (
            <section>
              <p className="eyebrow mb-2">The Fleet</p>
              <div className="grid grid-cols-2 gap-2.5">
                <Stat n={dash.admin.wantsDiscipleship} label="Want Discipling" href="/pipeline" tone="olive" />
                <Stat n={dash.admin.openCapacityLeaders} label="Leaders Available" href="/groups" tone="deep" />
                <Stat n={dash.admin.unassignedPeople} label="Unassigned" href="/directory" />
                <Stat n={dash.admin.groupsWithoutMentor} label="Groups Without A Mentor" href="/groups?view=mentors" />
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'details' && (
        <form onSubmit={save} className="mt-5 flex flex-col gap-4">
          <Field label="Preferred Name" value={person.preferredName ?? ''} onChange={(v) => set('preferredName', v)} />
          <Field label="Phone" value={person.phone ?? ''} onChange={(v) => set('phone', v)} />
          <Field label="Address" value={person.address ?? ''} onChange={(v) => set('address', v)} />
          <Field label="Occupation" value={person.occupation ?? ''} onChange={(v) => set('occupation', v)} />
          <Field label="Church" value={person.churchAffiliation ?? ''} onChange={(v) => set('churchAffiliation', v)} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-soft">Marital Status</span>
            <select
              value={person.maritalStatus ?? ''}
              onChange={(e) => set('maritalStatus', e.target.value || null)}
              className="min-h-[46px] rounded-full border border-line bg-surface px-4 capitalize"
            >
              {MARITAL.map((m) => (
                <option key={m} value={m}>
                  {m ? m.charAt(0) + m.slice(1).toLowerCase() : '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-soft">Bio</span>
            <textarea
              value={person.bio ?? ''}
              onChange={(e) => set('bio', e.target.value)}
              rows={3}
              className="rounded-card border border-line bg-surface px-4 py-3"
            />
          </label>
          {msg && <p className="text-sm text-ink-soft">{msg}</p>}
          <button type="submit" disabled={saving} className="btn-olive disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      )}
    </div>
  );
}

function Stat({
  n,
  label,
  href,
  tone,
}: {
  n: number;
  label: string;
  href: string;
  tone?: 'olive' | 'deep';
}) {
  const c = tone === 'olive' ? 'text-olive' : tone === 'deep' ? 'text-deep' : 'text-ink';
  return (
    <Link href={href} className="card px-4 py-3.5">
      <div className={`font-slab text-3xl font-bold ${c}`}>{n}</div>
      <div className="mt-0.5 text-[13px] leading-tight text-muted">{label}</div>
    </Link>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink-soft">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[46px] rounded-full border border-line bg-surface px-4 outline-none focus:border-deep"
      />
    </label>
  );
}
