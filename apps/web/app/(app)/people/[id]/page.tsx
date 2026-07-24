'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, personDisplayName, type Profile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Avatar } from '@/components/Avatar';

/**
 * Everything the Details panel shows — and, for an admin, everything it edits.
 * One list drives both the read rows and the edit inputs, so a field can never
 * be visible-but-uneditable (or the reverse).
 */
const DETAIL_FIELDS = [
  { key: 'phone', label: 'Phone', kind: 'tel' },
  { key: 'email', label: 'Email', kind: 'email' },
  { key: 'occupation', label: 'Occupation', kind: 'text' },
  { key: 'maritalStatus', label: 'Marital Status', kind: 'marital' },
  { key: 'address', label: 'Address', kind: 'text' },
  { key: 'churchAffiliation', label: 'Church', kind: 'text' },
  { key: 'lookingFor', label: 'Looking For', kind: 'multiline' },
  { key: 'heardAboutUs', label: 'Heard About Us', kind: 'text' },
  { key: 'bio', label: 'Bio', kind: 'multiline' },
] as const;

const MARITAL_OPTIONS = ['', 'SINGLE', 'MARRIED', 'ENGAGED', 'DIVORCED', 'WIDOWED'] as const;

const titleCase = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [person, setPerson] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Seed the edit form from whatever is already on file.
  useEffect(() => {
    if (!person) return;
    const seeded: Record<string, string> = {};
    for (const f of DETAIL_FIELDS) {
      seeded[f.key] = ((person as unknown as Record<string, unknown>)[f.key] as string | null) ?? '';
    }
    setDraft(seeded);
  }, [person]);

  function copy(value: string, label: string) {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(null), 2500);
      },
      () => {},
    );
  }

  useEffect(() => {
    api<{ person: Profile }>(`/people/${id}`)
      .then((r) => setPerson(r.person))
      .catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="p-5 text-red-700">{error}</p>;
  if (!person) return <p className="p-5 text-muted">Loading…</p>;

  const isSelf = user?.personId === id;
  // The server omits fields the viewer may not see, so key presence = permission.
  const hasContact = Boolean(person.phone || person.email || person.address);
  const canEdit = user?.role === 'ADMIN' || isSelf;

  const leads = (person.groups ?? []).some((g) => g.role !== 'DISCIPLE');
  const inGroup = (person.groups ?? []).some((g) => g.role === 'DISCIPLE');
  const wantsDiscipleship = (person.interests ?? []).some((i) => i.type === 'WANTS_DISCIPLESHIP');
  const wantsToLead = (person.interests ?? []).some((i) => i.type === 'WANTS_TO_LEAD');

  const details: Array<[string, string | null | undefined]> = [
    ['Occupation', person.occupation],
    ['Marital Status', person.maritalStatus ? titleCase(person.maritalStatus) : null],
    ['Address', person.address],
    ['Looking For', person.lookingFor],
    ['Heard About Us', person.heardAboutUs],
    ['Bio', person.bio],
  ];
  const shown = details.filter(([, v]) => v);

  return (
    <div className="px-4 pt-4">
      <button onClick={() => router.back()} className="text-sm text-muted">
        ← Back
      </button>

      <header className="mt-3 flex items-center gap-4">
        <Avatar person={person} size={72} />
        <div className="min-w-0">
          <h1 className="display truncate text-[26px]">{personDisplayName(person)}</h1>
          {person.churchAffiliation && (
            <p className="text-sm text-muted">{person.churchAffiliation}</p>
          )}
        </div>
      </header>

      {/* Where they stand in discipleship */}
      <div className="mt-3 flex flex-wrap gap-2">
        {leads && <Badge tone="deep">Leading A Group</Badge>}
        {inGroup && <Badge tone="slate">In A Group</Badge>}
        {person.hasMentor && <Badge tone="slate">Has A Mentor</Badge>}
        {wantsDiscipleship && <Badge tone="olive">Looking To Be Discipled</Badge>}
        {wantsToLead && <Badge tone="olive">Wants To Lead</Badge>}
        {person.status === 'PROSPECT' && <Badge tone="olive">New Registrant</Badge>}
        {!leads && !inGroup && !wantsDiscipleship && !wantsToLead && (
          <Badge tone="muted">Not In A Group Yet</Badge>
        )}
      </div>

      {/* Quick actions. On a phone these open the dialer / messages / mail app.
          On a desktop browser there's often no handler, so we also copy the
          value to the clipboard and say so. */}
      {hasContact && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {person.phone && (
            <a
              href={`tel:${person.phone}`}
              onClick={() => copy(person.phone!, 'Phone Number Copied')}
              className="btn-olive h-10 min-h-0 px-4 text-sm"
            >
              Call
            </a>
          )}
          {person.phone && (
            <a
              href={`sms:${person.phone}`}
              onClick={() => copy(person.phone!, 'Phone Number Copied')}
              className="btn-ghost h-10 min-h-0 px-4 text-sm"
            >
              Text
            </a>
          )}
          {person.email && (
            <a
              href={`mailto:${person.email}`}
              onClick={() => copy(person.email!, 'Email Copied')}
              className="btn-ghost h-10 min-h-0 px-4 text-sm"
            >
              Email
            </a>
          )}
          {copied && <span className="text-sm text-olive">{copied}</span>}
        </div>
      )}

      {/* Discipled by = the leader of the group they're a disciple in. */}
      {person.discipledBy && person.discipledBy.length > 0 && (
        <section className="mt-6">
          <p className="eyebrow mb-2">Discipled By</p>
          <div className="flex flex-col gap-2">
            {person.discipledBy.map((d) => (
              <Link
                key={d.id}
                href={`/people/${d.id}`}
                className="card flex items-center justify-between px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{d.name}</span>
                  {!d.current && <span className="text-sm text-muted">Completed</span>}
                </span>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Mentored by = an explicit mentor relationship. A different thing. */}
      {person.mentoredBy && (
        <section className="mt-6">
          <p className="eyebrow mb-2">Mentored By</p>
          <Link
            href={`/people/${person.mentoredBy.id}`}
            className="card flex items-center justify-between px-4 py-3"
          >
            <span className="font-medium text-ink">{person.mentoredBy.name}</span>
            <span className="text-muted">›</span>
          </Link>
        </section>
      )}

      {/* Groups */}
      {person.groups && person.groups.length > 0 && (
        <section className="mt-6">
          <p className="eyebrow mb-2">Groups</p>
          <div className="flex flex-col gap-2">
            {person.groups.map((g) => (
              <Link
                key={g.groupId}
                href={`/groups/${g.groupId}`}
                className="card flex items-center justify-between px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{g.displayName}</span>
                  <span className="text-sm text-muted">
                    {g.role === 'DISCIPLE' ? 'Disciple' : 'Leader'}
                  </span>
                </span>
                <span className="text-muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Details — read-only rows, or the same rows as inputs while editing.
          Editing happens in place here; there is no second panel below. */}
      {(hasContact || shown.length > 0 || canEdit) && (
        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between">
            <p className="eyebrow">Details</p>
            {canEdit && !editing && (
              <button onClick={() => setEditing(true)} className="text-sm text-deep">
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setDelErr(null);
                try {
                  // Blank input means "clear this field", not "leave it alone".
                  const patch: Record<string, string | null> = {};
                  for (const f of DETAIL_FIELDS) {
                    const v = (draft[f.key] ?? '').trim();
                    patch[f.key] = v === '' ? null : v;
                  }
                  await api(`/people/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
                  const r = await api<{ person: Profile }>(`/people/${id}`);
                  setPerson(r.person);
                  setEditing(false);
                } catch (err) {
                  setDelErr(String(err));
                } finally {
                  setSaving(false);
                }
              }}
              className="card flex flex-col divide-y divide-line"
            >
              {DETAIL_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <span className="w-28 shrink-0 text-sm text-muted">{f.label}</span>
                  {f.kind === 'marital' ? (
                    <select
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="min-h-[44px] w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-deep"
                    >
                      {MARITAL_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o ? titleCase(o) : '—'}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'multiline' ? (
                    <textarea
                      rows={3}
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-deep"
                    />
                  ) : (
                    <input
                      type={f.kind}
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="min-h-[44px] w-full rounded-lg border border-line bg-surface px-3 outline-none focus:border-deep"
                    />
                  )}
                </label>
              ))}
              {delErr && <p className="px-4 py-2 text-sm text-red-600">{delErr}</p>}
              <div className="flex gap-2 px-4 py-3">
                <button type="submit" disabled={saving} className="btn-olive h-10 min-h-0 px-4 text-sm">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-ghost h-10 min-h-0 px-4 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="card divide-y divide-line">
              {person.phone && (
                <Row label="Phone">
                  <a href={`tel:${person.phone}`} className="text-deep">
                    {person.phone}
                  </a>
                </Row>
              )}
              {person.email && (
                <Row label="Email">
                  <a href={`mailto:${person.email}`} className="break-all text-deep">
                    {person.email}
                  </a>
                </Row>
              )}
              {shown.map(([label, value]) =>
                label === 'Address' ? (
                  <Row key={label} label={label}>
                    <a
                      href={`https://maps.apple.com/?q=${encodeURIComponent(String(value))}`}
                      className="text-deep"
                    >
                      {value}
                    </a>
                  </Row>
                ) : (
                  <Row key={label} label={label}>
                    {value}
                  </Row>
                ),
              )}
              {!hasContact && shown.length === 0 && (
                <p className="px-4 py-5 text-sm text-muted">Nothing On File Yet.</p>
              )}
              {/* Notes live inside Details as its own block, below the fields. */}
              <NotesSection personId={id} />
            </div>
          )}
        </section>
      )}

      {isSelf && (
        <Link href="/profile" className="btn-ghost mt-6 inline-flex">
          Edit My Profile
        </Link>
      )}

      {/* Admins can remove someone from the directory */}
      {!isSelf && user?.role === 'ADMIN' && (
        <div className="mt-8 border-t border-line pt-5">
          {confirmDelete ? (
            <div className="rounded-card border border-red-300 bg-red-50 p-4">
              <p className="text-sm text-ink-soft">
                Remove <span className="font-medium">{personDisplayName(person)}</span> from the
                directory? Their group and mentor connections will be ended.
              </p>
              {delErr && <p className="mt-2 text-sm text-red-700">{delErr}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    setDelErr(null);
                    try {
                      await api(`/admin/people/${id}`, { method: 'DELETE' });
                      router.push('/directory');
                    } catch (e) {
                      setDelErr(
                        String(e).includes('400')
                          ? 'This person has a login. Remove their user account first.'
                          : String(e),
                      );
                    }
                  }}
                  className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white"
                >
                  Yes, Remove
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-ghost h-9 min-h-0 px-4 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-medium text-red-700 hover:underline"
            >
              Remove From Directory
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface PersonNote {
  id: string;
  body: string;
  visibility: 'PRIVATE_TO_AUTHOR' | 'LEADERS' | 'ADMINS';
  createdAt: string;
  authorName: string;
  canDelete: boolean;
}

/**
 * The running record on a person. The API decides who may read and write here
 * (admins anywhere; a leader on their own group's members; a mentor on their
 * mentees) — this component just renders whatever it is handed, and hides
 * itself entirely when the viewer has no access.
 */
function NotesSection({ personId }: { personId: string }) {
  const [notes, setNotes] = useState<PersonNote[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [denied, setDenied] = useState(false);
  const [body, setBody] = useState('');
  // Notes are leader-visible; there is no per-note visibility picker.
  const visibility: PersonNote['visibility'] = 'LEADERS';
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ notes: PersonNote[]; canWrite: boolean }>(`/people/${personId}/notes`)
      .then((r) => {
        setNotes(r.notes);
        setCanWrite(r.canWrite);
      })
      .catch(() => setDenied(true));
  }, [personId]);

  useEffect(() => load(), [load]);

  if (denied) return null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api(`/people/${personId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), visibility }),
      });
      setBody('');
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(noteId: string) {
    await api(`/notes/${noteId}`, { method: 'DELETE' });
    load();
  }

  const VIS_LABEL: Record<PersonNote['visibility'], string> = {
    PRIVATE_TO_AUTHOR: 'Only Me',
    LEADERS: 'Leaders',
    ADMINS: 'Admins',
  };

  return (
    <div className="px-4 py-4">
      <p className="eyebrow mb-2">Notes</p>

      {canWrite && (
        <form onSubmit={add} className="mb-3 flex flex-col gap-3">
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add A Note…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-deep"
          />
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="btn-olive h-10 min-h-0 self-start px-4 text-sm disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Add Note'}
          </button>
        </form>
      )}

      {notes === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">No Notes Yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-line bg-sand/40 p-3">
              <p className="whitespace-pre-wrap text-ink-soft">{n.body}</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                <span>
                  {n.authorName} ·{' '}
                  {new Date(n.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  · {VIS_LABEL[n.visibility]}
                </span>
                {n.canDelete && (
                  <button
                    onClick={() => remove(n.id)}
                    aria-label="Delete note"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-base leading-none hover:border-red-500 hover:text-red-600"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'deep' | 'olive' | 'slate' | 'muted';
  children: React.ReactNode;
}) {
  const cls = {
    deep: 'bg-deep text-cream',
    olive: 'bg-olive/15 text-olive',
    slate: 'bg-sand text-ink-soft',
    muted: 'border border-dashed border-line text-muted',
  }[tone];
  return (
    <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${cls}`}>{children}</span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="w-28 shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink-soft">{children}</span>
    </div>
  );
}
