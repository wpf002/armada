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

  if (error) return <p className="p-5 text-red-600">{error}</p>;
  if (!person) return <p className="p-5 text-slate">Loading…</p>;

  const isSelf = user?.personId === id;
  const addrMap = person.address
    ? `https://maps.apple.com/?q=${encodeURIComponent(person.address)}`
    : null;

  return (
    <div className="px-5 pt-4">
      <Link href="/directory" className="text-sm text-slate">
        ← Directory
      </Link>

      <header className="mt-3 flex items-center gap-4">
        <Avatar person={person} size={72} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl text-ink">
            {personDisplayName(person)}
          </h1>
          {person.groups && person.groups.length > 0 && (
            <p className="text-sm text-slate">
              {person.groups.map((g) => `${g.displayName} (${g.role.toLowerCase()})`).join(' · ')}
            </p>
          )}
          {person.churchAffiliation && (
            <p className="text-sm text-slate">{person.churchAffiliation}</p>
          )}
        </div>
      </header>

      <section className="mt-6 flex flex-col gap-2">
        {person.phone && (
          <Row label="Phone">
            <a href={`tel:${person.phone}`} className="text-deep">
              {person.phone}
            </a>
          </Row>
        )}
        {person.email && (
          <Row label="Email">
            <a href={`mailto:${person.email}`} className="text-deep">
              {person.email}
            </a>
          </Row>
        )}
        {person.address && (
          <Row label="Address">
            <a href={addrMap ?? '#'} className="text-deep">
              {person.address}
            </a>
          </Row>
        )}
        {person.occupation && <Row label="Occupation">{person.occupation}</Row>}
        {person.maritalStatus && (
          <Row label="Marital status">{person.maritalStatus.toLowerCase()}</Row>
        )}
        {person.bio && <Row label="Bio">{person.bio}</Row>}
        {person.lookingFor && <Row label="Looking for">{person.lookingFor}</Row>}
      </section>

      {!person.phone && !person.email && !person.address && (
        <p className="mt-4 text-sm text-slate">
          Contact details are visible to their group leader, mentor, and admins.
        </p>
      )}

      {isSelf && (
        <Link
          href="/me"
          className="mt-8 inline-block rounded-lg border border-deep px-4 py-2 text-sm text-deep"
        >
          Edit my profile
        </Link>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-grey-200 py-2">
      <span className="w-28 shrink-0 text-sm text-slate">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink-soft">{children}</span>
    </div>
  );
}
