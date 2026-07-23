'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, personDisplayName, type Profile } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Avatar } from '@/components/Avatar';

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [person, setPerson] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const details: Array<[string, string | null | undefined]> = [
    ['Occupation', person.occupation],
    ['Marital status', person.maritalStatus ? person.maritalStatus.toLowerCase() : null],
    ['Address', person.address],
    ['Looking for', person.lookingFor],
    ['Heard about us', person.heardAboutUs],
    ['Bio', person.bio],
  ];
  const shown = details.filter(([, v]) => v);

  return (
    <div className="px-4 pt-4">
      <Link href="/directory" className="text-sm text-muted">
        ← Directory
      </Link>

      <header className="mt-3 flex items-center gap-4">
        <Avatar person={person} size={72} />
        <div className="min-w-0">
          <h1 className="display truncate text-[26px]">{personDisplayName(person)}</h1>
          {person.churchAffiliation && (
            <p className="text-sm text-muted">{person.churchAffiliation}</p>
          )}
          {person.status === 'PROSPECT' && (
            <span className="mt-1 inline-block rounded-full bg-olive/15 px-2 py-0.5 text-[11px] font-medium text-olive">
              New registrant
            </span>
          )}
        </div>
      </header>

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
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {g.role.replace('_', '-').toLowerCase()}
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
            ? 'No contact details on file yet.'
            : 'Contact details are visible to their group leader, mentor, and admins.'}
        </p>
      )}

      {isSelf && (
        <Link href="/me" className="btn-ghost mt-6 inline-flex">
          Edit my profile
        </Link>
      )}
    </div>
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
