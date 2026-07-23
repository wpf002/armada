'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, personDisplayName, type Profile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Avatar } from '@/components/Avatar';

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [person, setPerson] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

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

      {/* Quick actions */}
      {hasContact && (
        <div className="mt-4 flex flex-wrap gap-2">
          {person.phone && (
            <a href={`tel:${person.phone}`} className="btn-olive h-10 min-h-0 px-4 text-sm">
              Call
            </a>
          )}
          {person.phone && (
            <a href={`sms:${person.phone}`} className="btn-ghost h-10 min-h-0 px-4 text-sm">
              Text
            </a>
          )}
          {person.email && (
            <a href={`mailto:${person.email}`} className="btn-ghost h-10 min-h-0 px-4 text-sm">
              Email
            </a>
          )}
        </div>
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

      {/* Empty state */}
      {!hasContact && shown.length === 0 && (
        <p className="mt-6 rounded-card border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
          {canSeeContact
            ? 'No Contact Details On File Yet.'
            : 'Contact Details Are Visible To Their Group Leader, Mentor, And Admins.'}
        </p>
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
