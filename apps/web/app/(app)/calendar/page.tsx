'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE, api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface EventItem {
  id: string;
  title: string;
  type: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  address: string | null;
  visibility: string;
}

type View = 'list' | 'month';

const VIS_LABEL: Record<string, string> = {
  ALL: 'Everyone',
  LEADERS_ONLY: 'Leaders Only',
  ADMINS_ONLY: 'Admins Only',
};

/** ISO → the value a <input type="datetime-local"> expects, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default function CalendarPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const isAdmin = user?.role === 'ADMIN';

  const [events, setEvents] = useState<EventItem[]>([]);
  const [subUrl, setSubUrl] = useState('');
  const [view, setView] = useState<View>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [deleting, setDeleting] = useState<EventItem | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = useCallback(() => {
    api<{ events: EventItem[] }>('/events').then((r) => setEvents(r.events));
  }, []);
  useEffect(() => {
    load();
    api<{ url: string }>('/calendar/subscription').then((r) => setSubUrl(r.url));
  }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    setDelBusy(true);
    try {
      await api(`/events/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div className="px-4 pt-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="mb-1 display text-2xl text-ink">Events</h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setShowCreate((s) => !s);
              setEditing(null);
            }}
            className="rounded-full bg-deep px-3 py-2 text-sm text-cream"
          >
            {showCreate ? 'Close' : '+ Event'}
          </button>
        )}
      </div>

      {/* List / Month toggle */}
      <div className="mt-3 inline-flex rounded-full border border-line bg-surface p-1 text-sm">
        {(['list', 'month'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-full px-4 py-1.5 font-medium capitalize transition-colors ${
              view === v ? 'bg-deep text-cream' : 'text-ink-soft'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {showCreate && isAdmin && (
        <EventForm
          onDone={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {editing && isAdmin && (
        <EventForm
          event={editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {view === 'list' ? (
        <ListView
          events={events}
          isAdmin={isAdmin}
          onEdit={(e) => {
            setEditing(e);
            setShowCreate(false);
          }}
          onDelete={setDeleting}
        />
      ) : (
        <MonthView
          events={events}
          isAdmin={isAdmin}
          onEdit={(e) => {
            setEditing(e);
            setShowCreate(false);
          }}
          onDelete={setDeleting}
        />
      )}

      {subUrl && (
        <div className="mb-6 mt-5 rounded-card border border-line bg-surface p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Subscribe On Your Phone</p>
          <p className="mb-2 text-sm text-ink-soft">
            Add this URL as a calendar subscription — new events appear automatically.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={subUrl}
              className="min-w-0 flex-1 truncate rounded-lg border border-line px-2 py-1 text-xs"
            />
            <button
              onClick={() => navigator.clipboard?.writeText(subUrl)}
              className="shrink-0 rounded-lg bg-sand px-3 py-1 text-sm text-ink-soft"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.title ?? ''}?`}
        message="This removes the event and everyone's RSVPs for it. This can't be undone."
        confirmLabel="Delete"
        busy={delBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// --- List view (the original look) -----------------------------------------

function ListView({
  events,
  isAdmin,
  onEdit,
  onDelete,
}: {
  events: EventItem[];
  isAdmin: boolean;
  onEdit: (e: EventItem) => void;
  onDelete: (e: EventItem) => void;
}) {
  const groups = new Map<string, EventItem[]>();
  for (const e of events) {
    const label = new Date(e.startsAt).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(e);
  }

  if (events.length === 0) return <p className="mt-5 text-muted">No Upcoming Events.</p>;

  return (
    <div className="mt-4">
      {[...groups.entries()].map(([label, evs]) => (
        <section key={label} className="mb-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">{label}</p>
          <div className="flex flex-col gap-2">
            {evs.map((e) => (
              <EventCard key={e.id} event={e} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EventCard({
  event: e,
  isAdmin,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  isAdmin: boolean;
  onEdit: (e: EventItem) => void;
  onDelete: (e: EventItem) => void;
}) {
  const d = new Date(e.startsAt);
  return (
    <div className="card flex gap-4 p-4">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-deep py-2 text-cream">
        <span className="text-[10px] uppercase tracking-widest opacity-75">
          {d.toLocaleDateString(undefined, { month: 'short' })}
        </span>
        <span className="font-slab text-xl font-bold leading-none">{d.getDate()}</span>
        <span className="text-[10px] uppercase opacity-75">
          {d.toLocaleDateString(undefined, { weekday: 'short' })}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-ink">{e.title}</span>
          <span className="shrink-0 text-sm text-muted">
            {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        {(e.location || e.address) && (
          <p className="text-sm text-muted">{[e.location, e.address].filter(Boolean).join(' · ')}</p>
        )}
        {e.visibility !== 'ALL' && (
          <span className="mt-1 inline-block rounded-full bg-olive/15 px-2 py-0.5 text-[11px] text-olive">
            {VIS_LABEL[e.visibility]}
          </span>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={`${API_BASE}/events/${e.id}.ics`} className="text-sm font-medium text-deep">
            Add To Calendar
          </a>
          {isAdmin && (
            <>
              <button onClick={() => onEdit(e)} className="text-sm text-ink-soft hover:text-ink">
                Edit
              </button>
              <button
                onClick={() => onDelete(e)}
                className="text-sm text-muted hover:text-red-600"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Month grid view -------------------------------------------------------

function MonthView({
  events,
  isAdmin,
  onEdit,
  onDelete,
}: {
  events: EventItem[];
  isAdmin: boolean;
  onEdit: (e: EventItem) => void;
  onDelete: (e: EventItem) => void;
}) {
  // Start on the month of the first upcoming event, or the current month.
  const initial = events[0] ? new Date(events[0].startsAt) : new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(initial);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Build a 6-row grid starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, [cursor]);

  const eventsOn = (day: Date) => events.filter((e) => sameDay(new Date(e.startsAt), day));
  const selectedEvents = eventsOn(selected).sort(
    (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
  );
  const today = new Date();

  function step(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft hover:bg-sand"
        >
          ‹
        </button>
        <span className="font-slab text-lg font-semibold text-ink">{monthLabel}</span>
        <button
          onClick={() => step(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft hover:bg-sand"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] uppercase tracking-wide text-muted">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const has = eventsOn(day).length > 0;
          const isSel = sameDay(day, selected);
          const isToday = sameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelected(day)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                isSel
                  ? 'bg-deep text-cream'
                  : inMonth
                    ? 'text-ink hover:bg-sand'
                    : 'text-muted/50'
              } ${isToday && !isSel ? 'ring-1 ring-olive/50' : ''}`}
            >
              <span>{day.getDate()}</span>
              <span
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  has ? (isSel ? 'bg-cream' : 'bg-olive') : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Selected day's events */}
      <div className="mt-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          {selected.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            Nothing On This Day.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedEvents.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                isAdmin={isAdmin}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Create / edit form (shared) -------------------------------------------

function EventForm({
  event,
  onDone,
  onCancel,
}: {
  event?: EventItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [startsAt, setStartsAt] = useState(event ? toLocalInput(event.startsAt) : '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [visibility, setVisibility] = useState<'ALL' | 'LEADERS_ONLY' | 'ADMINS_ONLY'>(
    (event?.visibility as 'ALL' | 'LEADERS_ONLY' | 'ADMINS_ONLY') ?? 'ALL',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title,
        startsAt: new Date(startsAt).toISOString(),
        location: location.trim() || null,
        visibility,
      };
      if (event) {
        await api(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/events', { method: 'POST', body: JSON.stringify(payload) });
      }
      onDone();
    } catch (e2) {
      setErr(String(e2));
    } finally {
      setBusy(false);
    }
  }

  const field = 'min-h-[44px] rounded-lg border border-line bg-surface px-3 outline-none focus:border-deep';

  return (
    <form onSubmit={submit} className="my-3 flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{event ? 'Edit Event' : 'New Event'}</p>
      <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      <input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
      <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} className={field} />
      <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className={field}>
        <option value="ALL">Everyone</option>
        <option value="LEADERS_ONLY">Leaders Only</option>
        <option value="ADMINS_ONLY">Admins Only</option>
      </select>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-olive h-11 min-h-0 flex-1 text-sm">
          {busy ? 'Saving…' : event ? 'Save Changes' : 'Create Event'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost h-11 min-h-0 px-4 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
