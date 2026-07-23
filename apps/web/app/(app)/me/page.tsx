'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE, api, personDisplayName, type Profile } from '@/lib/api';
import { signOut, useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Avatar } from '@/components/Avatar';

const MARITAL = ['', 'SINGLE', 'MARRIED', 'ENGAGED', 'DIVORCED', 'WIDOWED'];

export default function MePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const fileRef = useRef<HTMLInputElement>(null);

  const [person, setPerson] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.personId) return;
    api<{ person: Profile }>(`/people/${user.personId}`).then((r) => setPerson(r.person));
  }, [user?.personId]);

  if (!user || !person) return <p className="p-5 text-slate">Loading…</p>;

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
      setMsg('Photo updated.');
    } else {
      setMsg('Photo upload failed.');
    }
  }

  return (
    <div className="px-5 pt-4">
      <header className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative" aria-label="Change photo">
          <Avatar person={person} size={72} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-deep px-1.5 py-0.5 text-[10px] text-cream">
            edit
          </span>
        </button>
        <div>
          <h1 className="font-display text-2xl text-ink">{personDisplayName(person)}</h1>
          <p className="text-sm text-slate">{user.email}</p>
        </div>
      </header>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
      />

      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field label="Preferred name" value={person.preferredName ?? ''} onChange={(v) => set('preferredName', v)} />
        <Field label="Phone" value={person.phone ?? ''} onChange={(v) => set('phone', v)} />
        <Field label="Address" value={person.address ?? ''} onChange={(v) => set('address', v)} />
        <Field label="Occupation" value={person.occupation ?? ''} onChange={(v) => set('occupation', v)} />
        <Field label="Church" value={person.churchAffiliation ?? ''} onChange={(v) => set('churchAffiliation', v)} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-dark">Marital status</span>
          <select
            value={person.maritalStatus ?? ''}
            onChange={(e) => set('maritalStatus', e.target.value || null)}
            className="min-h-[44px] rounded-lg border border-grey-300 bg-white px-3"
          >
            {MARITAL.map((m) => (
              <option key={m} value={m}>
                {m ? m.toLowerCase() : '—'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-dark">Bio</span>
          <textarea
            value={person.bio ?? ''}
            onChange={(e) => set('bio', e.target.value)}
            rows={3}
            className="rounded-lg border border-grey-300 bg-white px-3 py-2"
          />
        </label>

        {msg && <p className="text-sm text-slate-dark">{msg}</p>}
        <button
          type="submit"
          disabled={saving}
          className="min-h-[48px] rounded-lg bg-deep font-medium text-cream disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <button
        onClick={async () => {
          await signOut();
          router.replace('/login');
        }}
        className="mt-6 w-full py-3 text-sm text-slate"
      >
        Sign out
      </button>
    </div>
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
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-dark">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] rounded-lg border border-grey-300 bg-white px-3 outline-none focus:border-deep"
      />
    </label>
  );
}
