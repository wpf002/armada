'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Anchor } from '@/components/Anchor';

interface EventItem {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  address: string | null;
  rsvpEnabled: boolean;
  myRsvp: string | null;
}

/**
 * Universal home — the same for every member, leader, and admin. Mirrors the
 * public site: mission, the next gathering, and what Armada is. Personal work
 * lives under Profile.
 */
export default function HomePage() {
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null);
  const [counts, setCounts] = useState<{ people: number; groups: number } | null>(null);

  useEffect(() => {
    api<{ events: EventItem[] }>('/events')
      .then((r) => {
        const now = Date.now();
        setNextEvent(r.events.find((e) => new Date(e.startsAt).getTime() >= now) ?? null);
      })
      .catch(() => {});
    Promise.all([
      api<{ people: unknown[] }>('/people'),
      api<{ groups: unknown[] }>('/groups'),
    ])
      .then(([p, g]) => setCounts({ people: p.people.length, groups: g.groups.length }))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-7 px-4 pt-6">
      {/* Mission hero */}
      <section className="ocean relative overflow-hidden rounded-hero px-6 py-8 text-cream shadow-hero">
        <Anchor size={56} className="opacity-90" color="#f9f5f1" />
        <p className="eyebrow mt-4 !text-cream/70">The Mission</p>
        <h1 className="mt-2 font-slab text-[26px] font-bold leading-snug">
          We exist to raise up faithful disciples of God.
        </h1>
        <p className="mt-3 max-w-md text-cream/75">
          &ldquo;Go therefore and make disciples of all nations.&rdquo; — Matthew 28:19
        </p>
      </section>

      {/* Next gathering */}
      <section>
        <p className="eyebrow mb-2">Next Gathering</p>
        {nextEvent ? (
          <Link href="/calendar" className="card block p-5">
            <div className="flex items-start gap-4">
              <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-deep py-2.5 text-cream">
                <span className="text-[10px] uppercase tracking-widest opacity-75">
                  {new Date(nextEvent.startsAt).toLocaleDateString(undefined, { month: 'short' })}
                </span>
                <span className="font-slab text-2xl font-bold leading-none">
                  {new Date(nextEvent.startsAt).getDate()}
                </span>
                <span className="text-[10px] uppercase opacity-75">
                  {new Date(nextEvent.startsAt).toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="font-slab text-xl font-bold text-ink">{nextEvent.title}</h2>
                <p className="text-sm text-muted">
                  {new Date(nextEvent.startsAt).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}{' '}
                  ·{' '}
                  {new Date(nextEvent.startsAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
                {nextEvent.location && (
                  <p className="mt-1 text-sm text-muted">
                    {[nextEvent.location, nextEvent.address].filter(Boolean).join(' · ')}
                  </p>
                )}
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-deep">
                  {nextEvent.myRsvp === 'YES' ? "You're Going" : 'RSVP'} →
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <p className="card px-4 py-5 text-sm text-muted">No Upcoming Gatherings Scheduled.</p>
        )}
      </section>

      {/* The fleet at a glance — public, non-sensitive counts */}
      {counts && (
        <section>
          <p className="eyebrow mb-2">The Armada</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Link href="/directory" className="card px-4 py-4">
              <div className="font-slab text-3xl font-bold text-deep">{counts.people}</div>
              <div className="mt-0.5 text-[13px] text-muted">Members</div>
            </Link>
            <Link href="/groups" className="card px-4 py-4">
              <div className="font-slab text-3xl font-bold text-olive">{counts.groups}</div>
              <div className="mt-0.5 text-[13px] text-muted">Discipleship Groups</div>
            </Link>
          </div>
        </section>
      )}

      {/* What Armada is */}
      <section>
        <p className="eyebrow mb-2">How It Works</p>
        <div className="card divide-y divide-line">
          <Step
            n="01"
            title="Gather"
            body="Armada Night, the first Monday of each month at Communion Coffee."
          />
          <Step n="02" title="Get Placed" title2 body="Join a discipleship group led by faithful men." />
          <Step n="03" title="Be Discipled" body="Walk with a leader who is themselves mentored." />
          <Step n="04" title="Lead" body="Go and make disciples." />
        </div>
        <Link href="/pipeline" className="btn-olive mt-4 w-full">
          I Want To Be Discipled
        </Link>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  title2?: boolean;
  body: string;
}) {
  return (
    <div className="flex gap-4 px-4 py-4">
      <span className="font-slab text-sm font-bold text-olive">{n}</span>
      <span className="min-w-0">
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
    </div>
  );
}
