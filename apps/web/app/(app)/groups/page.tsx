'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, personDisplayName, type DirectoryPerson, type Hierarchy } from '@/lib/api';
import { useSession, type SessionUser } from '@/lib/auth-client';
import { HierarchyGraph } from '@/components/HierarchyGraph';
import { HierarchyAccordion } from '@/components/HierarchyAccordion';
import { PersonPicker } from '@/components/PersonPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

/** All three admin "add" buttons share this, so they always look the same. */
const ADD_BTN = 'mb-3 w-full rounded-lg bg-deep py-2.5 text-sm font-medium text-cream';

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
  const [creatingGroup, setCreatingGroup] = useState(false);

  const load = useCallback(() => {
    api<Hierarchy>('/hierarchy')
      .then(setData)
      .catch((e) => setError(String(e)));
    api<{ leaders: Leader[] }>('/leaders')
      .then((r) => setLeaders(r.leaders))
      .catch(() => {});
    api<{ mentors: Mentor[] }>('/mentors')
      .then((r) => setMentors(r.mentors))
      .catch(() => {});
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

  // Only leaders can be mentored, so the mentee pickers offer only leaders.
  const leaderIds = leaders.map((l) => l.id);

  const heading =
    view === 'groups'
      ? `${data?.groups.length ?? ''} Groups`
      : view === 'leaders'
        ? `${leaders.length} Leaders`
        : view === 'mentors'
          ? `${mentors.length} Mentors`
          : 'The Fleet';

  // Members don't manage groups. `fullGraph` is the server's own signal — true
  // for admins, leaders and mentors — so a MEMBER-role person who actually
  // leads a group (invariant #3) still gets in.
  if (data && !data.fullGraph) return <p className="p-5 text-muted">Leaders Only.</p>;

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
              view === t.key
                ? 'bg-deep text-cream'
                : 'border border-line text-ink-soft hover:bg-sand/60'
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
              <>
                <button onClick={() => setCreatingGroup((c) => !c)} className={ADD_BTN}>
                  {creatingGroup ? 'Cancel' : '+ New Group'}
                </button>
                {creatingGroup && (
                  <div className="card mb-3 p-3">
                    <NewGroup
                      onDone={(id) => {
                        setCreatingGroup(false);
                        router.push(`/groups/${id}`);
                      }}
                    />
                  </div>
                )}
              </>
            )}
            <HierarchyAccordion hierarchy={data} />
          </>
        )}

        {/* Who is leading a group */}
        {view === 'leaders' && (
          <>
            {isAdmin && (
              <>
                <button onClick={() => setAddingLeader((a) => !a)} className={ADD_BTN}>
                  {addingLeader ? 'Cancel' : '+ Add Leader'}
                </button>
                {addingLeader && data && (
                  <div className="card mb-3 p-3">
                    <AddLeader
                      groups={data.groups}
                      onDone={() => {
                        setAddingLeader(false);
                        load();
                      }}
                    />
                  </div>
                )}
              </>
            )}
            <div className="card divide-y divide-line">
              {leaders.map((l) => (
                <Link
                  key={l.id}
                  href={`/people/${l.id}`}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{l.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {l.groups.join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted">›</span>
                </Link>
              ))}
              {leaders.length === 0 && (
                <p className="px-4 py-5 text-sm text-muted">No Leaders Yet.</p>
              )}
            </div>
          </>
        )}

        {/* Who's mentoring leaders */}
        {view === 'mentors' && (
          <>
            {isAdmin && (
              <>
                <button onClick={() => setAddingMentor((a) => !a)} className={ADD_BTN}>
                  {addingMentor ? 'Cancel' : '+ Add Mentor'}
                </button>
                {addingMentor && (
                  <div className="card mb-3 p-3">
                    <AddMentorship
                      leaderIds={leaderIds}
                      onDone={() => {
                        setAddingMentor(false);
                        load();
                      }}
                    />
                  </div>
                )}
              </>
            )}
            <div className="flex flex-col gap-2.5">
              {mentors.map((m) => (
                <MentorCard
                  key={m.id}
                  mentor={m}
                  isAdmin={isAdmin}
                  leaderIds={leaderIds}
                  onChanged={load}
                />
              ))}
              {mentors.length === 0 && (
                <p className="card px-4 py-5 text-sm text-muted">No Mentor Relationships Yet.</p>
              )}
            </div>
          </>
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

    </div>
  );
}

/** One mentor and everyone they mentor, with inline add/remove for admins. */
function MentorCard({
  mentor,
  isAdmin,
  leaderIds,
  onChanged,
}: {
  mentor: Mentor;
  isAdmin: boolean;
  leaderIds: string[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<DirectoryPerson | null>(null);
  const [busy, setBusy] = useState(false);
  // A single mentee pending removal, or 'ALL' for the whole mentor block.
  const [confirming, setConfirming] = useState<
    { kind: 'one'; edgeId: string; name: string } | { kind: 'all' } | null
  >(null);

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

  /**
   * Resolve whichever removal was confirmed. Removing the whole block ends
   * every mentorship this person holds; nobody is deleted (invariant #2) — the
   * edges close, so they simply stop being a mentor and fall out of the list.
   */
  async function confirmRemoval() {
    if (!confirming) return;
    setBusy(true);
    try {
      if (confirming.kind === 'one') {
        await api(`/admin/mentorships/${confirming.edgeId}`, { method: 'DELETE' });
      } else {
        for (const x of mentor.mentees) {
          await api(`/admin/mentorships/${x.edgeId}`, { method: 'DELETE' });
        }
      }
      setConfirming(null);
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
              onClick={() => setConfirming({ kind: 'all' })}
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
            only={leaderIds}
            placeholder="Which Leader Do They Mentor?"
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
            <Link
              href={`/people/${x.id}`}
              className="text-ink-soft underline-offset-2 hover:underline"
            >
              {x.name}
            </Link>
            {isAdmin && (
              <button
                onClick={() => setConfirming({ kind: 'one', edgeId: x.edgeId, name: x.name })}
                aria-label={`Remove ${x.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-muted hover:bg-sand hover:text-red-600"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.kind === 'one'
            ? `Stop mentoring ${confirming.name}?`
            : `Remove ${mentor.name} as a mentor?`
        }
        busy={busy}
        onConfirm={confirmRemoval}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

/**
 * Create a group by naming who leads it. A group is identified by its leaders
 * (invariant #8) — its display name is derived from them — so creating one
 * without any would produce an "Unassigned Group" that reads like a bug.
 * Co-leadership is the default assumption (invariant #9), hence a list.
 */
function NewGroup({ onDone }: { onDone: (groupId: string) => void }) {
  const [picked, setPicked] = useState<DirectoryPerson[]>([]);
  const [pick, setPick] = useState<DirectoryPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addPick(p: DirectoryPerson | null) {
    if (!p) return;
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, p]));
    setPick(null);
  }

  async function create() {
    if (picked.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ group: { id: string } }>('/groups', { method: 'POST', body: '{}' });
      for (const p of picked) {
        await api(`/groups/${r.group.id}/members`, {
          method: 'POST',
          body: JSON.stringify({ personId: p.id, role: 'LEADER' }),
        });
      }
      onDone(r.group.id);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-wide text-muted">
        {picked.length > 1 ? 'Leaders' : 'Leader'}
      </p>

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1.5 rounded-full border border-deep bg-sand/50 py-1 pl-3 pr-1.5 text-sm"
            >
              <span className="font-medium text-ink">{personDisplayName(p)}</span>
              <button
                onClick={() => setPicked((cur) => cur.filter((x) => x.id !== p.id))}
                aria-label={`Remove ${personDisplayName(p)}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <PersonPicker
        value={pick}
        onChange={addPick}
        exclude={picked.map((p) => p.id)}
        placeholder={picked.length ? 'Add Another Leader…' : 'Search People…'}
      />

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={create}
        disabled={picked.length === 0 || busy}
        className="rounded-lg bg-deep py-2.5 text-sm font-medium text-cream disabled:opacity-40"
      >
        {busy ? 'Creating…' : 'Create Group'}
      </button>
    </div>
  );
}

/**
 * Make someone a leader of a group. Armada has no head-leader/co-leader
 * distinction — everyone leading a group is simply a leader.
 */
function AddLeader({ groups, onDone }: { groups: Hierarchy['groups']; onDone: () => void }) {
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
function AddMentorship({ leaderIds, onDone }: { leaderIds: string[]; onDone: () => void }) {
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
        only={leaderIds}
        placeholder="Search Leaders…"
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
