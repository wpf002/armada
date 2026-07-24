'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type DirectoryPerson, type Hierarchy } from '@/lib/api';
import { useSession, type SessionUser } from '@/lib/auth-client';
import { HierarchyGraph } from '@/components/HierarchyGraph';
import { HierarchyAccordion } from '@/components/HierarchyAccordion';
import { PersonPicker } from '@/components/PersonPicker';

type View = 'groups' | 'leaders' | 'mentors' | 'map';

interface Leader {
  id: string;
  name: string;
  photoUrl: string | null;
  groups: string[];
}
interface Mentor {
  id: string;
  name: string;
  mentees: Array<{ id: string; name: string; edgeId: string }>;
}

const TABS: Array<{ key: View; label: string }> = [
  { key: 'groups', label: 'Groups' },
  { key: 'leaders', label: 'Leaders' },
  { key: 'mentors', label: 'Mentors' },
  { key: 'map', label: 'Hierarchy' },
];

export default function GroupsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get('view') as View) ?? 'groups';
  const [view, setView] = useState<View>(TABS.some((t) => t.key === initial) ? initial : 'groups');

  const { data: session } = useSession();
  const isAdmin = (session?.user as SessionUser | undefined)?.role === 'ADMIN';

  const [data, setData] = useState<Hierarchy | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [showMentorRing, setShowMentorRing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingLeader, setAddingLeader] = useState(false);
  const [addingMentor, setAddingMentor] = useState(false);

  const load = useCallback(() => {
    api<Hierarchy>('/hierarchy').then(setData).catch((e) => setError(String(e)));
    api<{ leaders: Leader[] }>('/leaders').then((r) => setLeaders(r.leaders)).catch(() => {});
    api<{ mentors: Mentor[] }>('/mentors').then((r) => setMentors(r.mentors)).catch(() => {});
  }, []);

  useEffect(() => load(), [load]);

  /**
   * Keep the active tab in the URL (replace, so tabs don't pile up in history).
   * Without this, going into a group and pressing Back returns to whatever view
   * the URL last named — the hierarchy — instead of the list you came from.
   */
  function selectView(next: View) {
    setView(next);
    router.replace(`/groups?view=${next}`, { scroll: false });
  }

  /** New groups start empty — the leader is added on the detail page next. */
  async function createGroup() {
    const r = await api<{ group: { id: string } }>('/groups', { method: 'POST', body: '{}' });
    router.push(`/groups/${r.group.id}`);
  }

  const heading =
    view === 'groups'
      ? `${data?.groups.length ?? ''} Groups`
      : view === 'leaders'
        ? `${leaders.length} Leaders`
        : view === 'mentors'
          ? `${mentors.length} Mentors`
          : 'The Fleet';

  return (
    <div className="px-4 pt-5">
      <p className="eyebrow">Discipleship Groups</p>
      <h1 className="display text-[26px]">{heading}</h1>

      {/* View tabs */}
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectView(t.key)}
            className={`rounded-full px-2 py-2 text-center text-[13px] font-medium transition-colors ${
              view === t.key ? 'bg-deep text-cream' : 'border border-line text-ink-soft hover:bg-sand/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-red-700">{error}</p>}
      {!data && !error && <p className="mt-4 text-muted">Loading…</p>}

      <div className="mt-4">
        {/* Who's in a group */}
        {view === 'groups' && data && (
          <>
            {isAdmin && (
              <button onClick={createGroup} className="mb-3 w-full rounded-lg bg-deep py-2.5 text-sm font-medium text-cream">
                + New Group
              </button>
            )}
            <HierarchyAccordion hierarchy={data} />
          </>
        )}

        {/* Who is leading a group */}
        {view === 'leaders' && (
          <div className="card divide-y divide-line">
            {isAdmin && (
              <div className="p-3">
                <button
                  onClick={() => setAddingLeader((a) => !a)}
                  className="w-full rounded-lg border border-deep py-2 text-sm font-medium text-deep"
                >
                  {addingLeader ? 'Cancel' : '+ Add Leader'}
                </button>
                {addingLeader && data && (
                  <AddLeader
                    groups={data.groups}
                    onDone={() => {
                      setAddingLeader(false);
                      load();
                    }}
                  />
                )}
              </div>
            )}
            {leaders.map((l) => (
              <Link key={l.id} href={`/people/${l.id}`} className="flex items-center justify-between px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{l.name}</span>
                  <span className="block truncate text-sm text-muted">{l.groups.join(' · ')}</span>
                </span>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            ))}
            {leaders.length === 0 && <p className="px-4 py-5 text-sm text-muted">No Leaders Yet.</p>}
          </div>
        )}

        {/* Who's mentoring leaders */}
        {view === 'mentors' && (
          <div className="flex flex-col gap-2.5">
            {isAdmin && (
              <div className="card p-3">
                <button
                  onClick={() => setAddingMentor((a) => !a)}
                  className="w-full rounded-lg border border-deep py-2 text-sm font-medium text-deep"
                >
                  {addingMentor ? 'Cancel' : '+ Add Mentor'}
                </button>
                {addingMentor && (
                  <AddMentorship
                    onDone={() => {
                      setAddingMentor(false);
                      load();
                    }}
                  />
                )}
              </div>
            )}
            {mentors.map((m) => (
              <MentorCard key={m.id} mentor={m} isAdmin={isAdmin} onChanged={load} />
            ))}
            {mentors.length === 0 && (
              <p className="card px-4 py-5 text-sm text-muted">No Mentor Relationships Yet.</p>
            )}
          </div>
        )}

        {/* The network hierarchy */}
        {view === 'map' && data && (
          <>
            <div className="mb-3 flex items-center justify-end">
              <label className="flex shrink-0 items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={showMentorRing}
                  onChange={(e) => setShowMentorRing(e.target.checked)}
                />
                Mentors
              </label>
            </div>
            <div className="md:mx-[calc(50%-50vw)] md:w-screen md:px-6">
              <HierarchyGraph hierarchy={data} showMentors={showMentorRing} />
            </div>
          </>
        )}
      </div>

      {data && !data.fullGraph && (
        <p className="mt-4 text-sm text-muted">
          You&apos;re Seeing Your Own Group. Leaders And Mentors See The Whole Org.
        </p>
      )}
    </div>
  );
}

/** One mentor and everyone they mentor, with inline add/remove for admins. */
function MentorCard({
  mentor,
  isAdmin,
  onChanged,
}: {
  mentor: Mentor;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<DirectoryPerson | null>(null);
  const [busy, setBusy] = useState(false);

  async function addMentee() {
    if (!pick) return;
    setBusy(true);
    try {
      await api('/admin/mentorships', {
        method: 'POST',
        body: JSON.stringify({ mentorId: mentor.id, menteeId: pick.id }),
      });
      setPick(null);
      setAdding(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(edgeId: string) {
    await api(`/admin/mentorships/${edgeId}`, { method: 'DELETE' });
    onChanged();
  }

  /**
   * Drop the whole block: end every mentorship this person holds. Nobody is
   * deleted (invariant #2) — the edges are closed, so they simply stop being a
   * mentor and fall out of this list.
   */
  async function removeMentor() {
    const n = mentor.mentees.length;
    const ok = window.confirm(
      `Remove ${mentor.name} as a mentor? This ends ${n} mentorship${n === 1 ? '' : 's'}. Nobody is deleted.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      for (const x of mentor.mentees) {
        await api(`/admin/mentorships/${x.edgeId}`, { method: 'DELETE' });
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/people/${mentor.id}`} className="font-medium text-ink">
            {mentor.name}
          </Link>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">
            Mentoring {mentor.mentees.length}
          </p>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setAdding((a) => !a)}
              aria-label={adding ? 'Cancel' : `Add someone for ${mentor.name} to mentor`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-deep text-lg leading-none text-deep hover:bg-deep hover:text-cream"
            >
              {adding ? '×' : '+'}
            </button>
            <button
              onClick={removeMentor}
              disabled={busy}
              aria-label={`Remove ${mentor.name} as a mentor`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-lg leading-none text-muted hover:border-red-500 hover:text-red-600 disabled:opacity-40"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {adding && isAdmin && (
        <div className="mt-3 flex flex-col gap-2">
          <PersonPicker
            value={pick}
            onChange={setPick}
            exclude={[mentor.id, ...mentor.mentees.map((x) => x.id)]}
            placeholder="Who Do They Mentor?"
          />
          {pick && (
            <button
              onClick={addMentee}
              disabled={busy}
              className="rounded-lg bg-deep py-2 text-sm font-medium text-cream disabled:opacity-40"
            >
              {busy ? 'Saving…' : `Add ${pick.firstName}`}
            </button>
          )}
        </div>
      )}

      <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
        {mentor.mentees.map((x) => (
          <li key={x.edgeId} className="flex items-center justify-between py-1.5">
            <Link href={`/people/${x.id}`} className="text-ink-soft underline-offset-2 hover:underline">
              {x.name}
            </Link>
            {isAdmin && (
              <button
                onClick={() => remove(x.edgeId)}
                aria-label={`Remove ${x.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-muted hover:bg-sand hover:text-red-600"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Make someone a leader of a group. Armada has no head-leader/co-leader
 * distinction — everyone leading a group is simply a leader.
 */
function AddLeader({
  groups,
  onDone,
}: {
  groups: Hierarchy['groups'];
  onDone: () => void;
}) {
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!person || !groupId) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ personId: person.id, role: 'LEADER' }),
      });
      onDone();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <PersonPicker label="Person" value={person} onChange={setPerson} />

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Group</p>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-line bg-surface px-3"
        >
          <option value="">Choose A Group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.displayName}
            </option>
          ))}
        </select>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={submit}
        disabled={!person || !groupId || busy}
        className="rounded-lg bg-deep py-2.5 text-sm font-medium text-cream disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Add Leader'}
      </button>
    </div>
  );
}

/** Pair a mentor with the leader they mentor. */
function AddMentorship({ onDone }: { onDone: () => void }) {
  const [mentor, setMentor] = useState<DirectoryPerson | null>(null);
  const [mentee, setMentee] = useState<DirectoryPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!mentor || !mentee) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/admin/mentorships', {
        method: 'POST',
        body: JSON.stringify({ mentorId: mentor.id, menteeId: mentee.id }),
      });
      onDone();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <PersonPicker
        label="Mentor"
        value={mentor}
        onChange={setMentor}
        exclude={mentee ? [mentee.id] : []}
      />
      <PersonPicker
        label="Mentee"
        value={mentee}
        onChange={setMentee}
        exclude={mentor ? [mentor.id] : []}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={submit}
        disabled={!mentor || !mentee || busy}
        className="rounded-lg bg-deep py-2.5 text-sm font-medium text-cream disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Add Mentorship'}
      </button>
    </div>
  );
}
