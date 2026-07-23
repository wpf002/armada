'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, personDisplayName, type Profile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Avatar } from '@/components/Avatar';

/** The contact fields an admin can fill in, shown by name when empty. */
const MISSING_FIELDS = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'churchAffiliation', label: 'Church' },
  { key: 'occupation', label: 'Occupation' },
] as const;

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
    setDraft({
      phone: person.phone ?? '',
      email: person.email ?? '',
      address: person.address ?? '',
      churchAffiliation: person.churchAffiliation ?? '',
      occupation: person.occupation ?? '',
    });
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
  const canSeeContact = 'phone' in person || 'email' in person || 'address' in person;
  const hasContact = Boolean(person.phone || person.email || person.address);

  const leads = (person.groups ?? []).some((g) => g.role !== 'DISCIPLE');
  const inGroup = (person.groups ?? []).some((g) => g.role === 'DISCIPLE');
  const wantsDiscipleship = (person.interests ?? []).some((i) => i.type === 'WANTS_DISCIPLESHIP');
  const wantsToLead = (person.interests ?? []).some((i) => i.type === 'WANTS_TO_LEAD');

  const details: Array<[string, string | null | undefined]> = [
    ['Occupation', person.occupation],
    ['Marital Status', person.maritalStatus ? person.maritalStatus.toLowerCase() : null],
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

      {/* Who disciples them */}
      {person.discipledBy && (
        <section className="mt-6">
          <p className="eyebrow mb-2">Discipled By</p>
          <Link
            href={`/people/${person.discipledBy.id}`}
            className="card flex items-center justify-between px-4 py-3"
          >
            <span className="font-medium text-ink">{person.discipledBy.name}</span>
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
                    {g.role === 'CO_LEADER' ? 'Co-Leader' : g.role === 'LEADER' ? 'Leader' : 'Disciple'}
                  </span>
                </span>
                <span className="text-muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Contact + details */}
      {(hasContact || shown.length > 0) && (
        <section className="mt-6">
          <p className="eyebrow mb-2">Details</p>
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
          </div>
        </section>
      )}

      {/* Empty state — name the fields that are missing, and let admins fill them */}
      {!hasContact && shown.length === 0 && (
        <section className="mt-6">
          {canSeeContact ? (
            <div className="rounded-card border border-dashed border-line px-4 py-5">
              <p className="font-medium text-ink">No Contact Details On File Yet</p>
              <p className="mt-1 text-sm text-muted">These fields are still empty:</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {MISSING_FIELDS.map((f) => (
                  <li
                    key={f.key}
                    className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted"
                  >
                    {f.label}
                  </li>
                ))}
              </ul>
              {user?.role === 'ADMIN' && !editing && (
                <button onClick={() => setEditing(true)} className="btn-olive mt-4 h-10 min-h-0 px-4 text-sm">
                  Add Contact Info
                </button>
              )}
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
              Contact Details Are Visible To Their Group Leader, Mentor, And Admins.
            </p>
          )}
        </section>
      )}

      {/* Admin edit form */}
      {user?.role === 'ADMIN' && (
        <section className="mt-6">
          {!editing && (hasContact || shown.length > 0) && (
            <button onClick={() => setEditing(true)} className="btn-ghost h-10 min-h-0 px-4 text-sm">
              Edit Contact Info
            </button>
          )}
          {editing && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                try {
                  await api(`/people/${id}`, { method: 'PATCH', body: JSON.stringify(draft) });
                  const r = await api<{ person: Profile }>(`/people/${id}`);
                  setPerson(r.person);
                  setEditing(false);
                } catch (err) {
                  setDelErr(String(err));
                } finally {
                  setSaving(false);
                }
              }}
              className="card flex flex-col gap-3 p-4"
            >
              <p className="eyebrow">Contact Info</p>
              {MISSING_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-soft">{f.label}</span>
                  <input
                    value={(draft[f.key] as string) ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className="min-h-[44px] rounded-full border border-line bg-surface px-4 outline-none focus:border-deep"
                  />
                </label>
              ))}
              <div className="flex gap-2">
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
