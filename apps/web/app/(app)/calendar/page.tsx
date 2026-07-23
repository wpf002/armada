'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

interface EventItem {
  id: string;
  title: string;
  type: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  address: string | null;
  rsvpEnabled: boolean;
  visibility: string;
  myRsvp: 'YES' | 'NO' | 'MAYBE' | null;
  rsvpCount: number;
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [events, setEvents] = useState<EventItem[]>([]);
  const [subUrl, setSubUrl] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    api<{ events: EventItem[] }>('/events').then((r) => setEvents(r.events));
  }, []);
  useEffect(() => {
    load();
    api<{ url: string }>('/calendar/subscription').then((r) => setSubUrl(r.url));
  }, [load]);

  async function rsvp(id: string, status: 'YES' | 'NO' | 'MAYBE') {
    await api(`/events/${id}/rsvp`, { method: 'POST', body: JSON.stringify({ status }) });
    load();
  }

  // Group by month label.
  const groups = new Map<string, EventItem[]>();
  for (const e of events) {
    const label = new Date(e.startsAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(e);
  }

  return (
    <div className="px-4 pt-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-expanded text-xs uppercase tracking-[0.2em] text-slate">Calendar</p>
          <h1 className="mb-1 font-display text-2xl text-ink">Events</h1>
        </div>
        {user?.role === 'ADMIN' && (
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-lg bg-deep px-3 py-2 text-sm text-cream"
          >
            {showCreate ? 'Close' : '+ Event'}
          </button>
        )}
      </div>

      {showCreate && <CreateEvent onCreated={() => { setShowCreate(false); load(); }} />}

      {subUrl && (
        <div className="mb-4 mt-2 rounded-xl border border-grey-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate">Subscribe on your phone</p>
          <p className="mb-2 text-sm text-slate-dark">
            Add this URL as a calendar subscription — new events appear automatically.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={subUrl} className="min-w-0 flex-1 truncate rounded-lg border border-grey-300 px-2 py-1 text-xs" />
            <button
              onClick={() => navigator.clipboard?.writeText(subUrl)}
              className="shrink-0 rounded-lg bg-grey-200 px-3 py-1 text-sm text-slate-dark"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {[...groups.entries()].map(([label, evs]) => (
        <section key={label} className="mb-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate">{label}</p>
          <div className="flex flex-col gap-2">
            {evs.map((e) => (
              <div key={e.id} className="rounded-xl border border-grey-200 bg-white p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-ink-soft">{e.title}</span>
                  <span className="text-sm text-slate">
                    {new Date(e.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                  </span>
                </div>
                {(e.location || e.address) && (
                  <p className="text-sm text-slate">{[e.location, e.address].filter(Boolean).join(' · ')}</p>
                )}
                {e.visibility !== 'ALL' && (
                  <span className="mt-1 inline-block rounded-full bg-olive/15 px-2 py-0.5 text-[11px] text-olive">
                    {e.visibility.toLowerCase().replace('_', ' ')}
                  </span>
                )}
                {e.rsvpEnabled && (
                  <div className="mt-2 flex gap-2 text-sm">
                    {(['YES', 'MAYBE', 'NO'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => rsvp(e.id, s)}
                        className={`rounded-full px-3 py-1 ${e.myRsvp === s ? 'bg-deep text-cream' : 'bg-grey-200 text-slate-dark'}`}
                      >
                        {s.toLowerCase()}
                      </button>
                    ))}
                    <span className="ml-auto self-center text-xs text-slate">{e.rsvpCount} going</span>
                  </div>
                )}
                <a href={`${API_BASE}/events/${e.id}.ics`} className="mt-2 inline-block text-sm text-deep">
                  Add to calendar
                </a>
              </div>
            ))}
          </div>
        </section>
      ))}
      {events.length === 0 && <p className="text-slate">No upcoming events.</p>}
    </div>
  );
}

function CreateEvent({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'ALL' | 'LEADERS_ONLY' | 'ADMINS_ONLY'>('ALL');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await api('/events', {
      method: 'POST',
      body: JSON.stringify({
        title,
        startsAt: new Date(startsAt).toISOString(),
        location: location || undefined,
        rsvpEnabled: true,
        visibility,
      }),
    });
    setBusy(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="my-3 flex flex-col gap-2 rounded-xl border border-grey-200 bg-white p-3">
      <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-[40px] rounded-lg border border-grey-300 px-3" />
      <input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="min-h-[40px] rounded-lg border border-grey-300 px-3" />
      <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} className="min-h-[40px] rounded-lg border border-grey-300 px-3" />
      <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="min-h-[40px] rounded-lg border border-grey-300 px-3">
        <option value="ALL">Everyone</option>
        <option value="LEADERS_ONLY">Leaders only</option>
        <option value="ADMINS_ONLY">Admins only</option>
      </select>
      <button disabled={busy} className="min-h-[44px] rounded-lg bg-deep text-cream">
        {busy ? 'Creating…' : 'Create event'}
      </button>
    </form>
  );
}
