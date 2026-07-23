'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';

interface Dashboard {
  role: string;
  myGroups: Array<{ id: string; displayName: string }>;
  myMentees: Array<{ id: string; name: string }>;
  myOpenFollowUps: number;
  admin?: {
    wantsDiscipleship: number;
    unassignedPeople: number;
    groupsWithoutMentor: number;
    openCapacityLeaders: number;
    staleFollowUps: number;
  };
}
interface EventItem {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  address: string | null;
  rsvpEnabled: boolean;
  myRsvp: string | null;
}
interface FollowUp {
  id: string;
  subject: { id: string; name: string; phone: string | null };
}
interface Interest {
  id: string;
  person: { id: string; name: string };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const [dash, setDash] = useState<Dashboard | null>(null);
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [wants, setWants] = useState<Interest[]>([]);
  const [intake, setIntake] = useState(0);

  useEffect(() => {
    api<Dashboard>('/dashboard').then(setDash).catch(() => {});
    api<{ events: EventItem[] }>('/events')
      .then((r) => {
        const now = Date.now();
        setNextEvent(r.events.find((e) => new Date(e.startsAt).getTime() >= now) ?? null);
      })
      .catch(() => {});
    api<{ followups: FollowUp[] }>('/followups?scope=mine')
      .then((r) => setFollowups(r.followups))
      .catch(() => {});
    api<{ interests: Interest[] }>('/interests?type=WANTS_DISCIPLESHIP&status=OPEN')
      .then((r) => setWants(r.interests))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api<{ submissions: unknown[] }>('/admin/intake?status=NEEDS_REVIEW')
        .then((r) => setIntake(r.submissions.length))
        .catch(() => {});
    }
  }, [user?.role]);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const isLeader = (dash?.myGroups.length ?? 0) > 0 || (dash?.myMentees.length ?? 0) > 0;
  const hasWork = followups.length > 0 || wants.length > 0 || intake > 0;

  return (
    <div className="flex flex-col gap-6 px-4 pt-5">
      {/* Greeting */}
      <div>
        <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="display mt-1 text-[2rem]">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h1>
      </div>

      {/* Hero: next gathering, or the mission */}
      <HeroCard event={nextEvent} />

      {/* Needs you */}
      {hasWork && (
        <section>
          <p className="eyebrow mb-2">Needs you</p>
          <div className="card divide-y divide-line">
            {followups.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/people/${f.subject.id}`} className="min-w-0">
                  <span className="block truncate font-medium text-ink">{f.subject.name}</span>
                  <span className="text-sm text-muted">Reach out</span>
                </Link>
                {f.subject.phone ? (
                  <a href={`tel:${f.subject.phone}`} className="btn-olive h-9 min-h-0 px-4 text-sm">
                    Call
                  </a>
                ) : (
                  <Link href={`/people/${f.subject.id}`} className="btn-ghost h-9 min-h-0 px-4 text-sm">
                    Open
                  </Link>
                )}
              </div>
            ))}
            {followups.length > 3 && (
              <Link href="/dashboard" className="block px-4 py-3 text-sm font-medium text-deep">
                {followups.length - 3} more follow-ups →
              </Link>
            )}

            {wants.length > 0 && (
              <Link href="/pipeline" className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block font-medium text-ink">
                    {wants.length} waiting to be discipled
                  </span>
                  <span className="truncate text-sm text-muted">
                    {wants.slice(0, 3).map((w) => w.person.name.split(' ')[0]).join(', ')}
                    {wants.length > 3 ? '…' : ''}
                  </span>
                </span>
                <Chevron />
              </Link>
            )}

            {intake > 0 && (
              <Link href="/admin/intake" className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block font-medium text-ink">
                    {intake} new registration{intake === 1 ? '' : 's'}
                  </span>
                  <span className="text-sm text-muted">Review & place</span>
                </span>
                <Chevron />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Your groups */}
      {isLeader && dash && dash.myGroups.length > 0 && (
        <section>
          <p className="eyebrow mb-2">Your {dash.myGroups.length === 1 ? 'group' : 'groups'}</p>
          <div className="flex flex-col gap-2">
            {dash.myGroups.map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`} className="card flex items-center justify-between px-4 py-3.5">
                <span className="font-medium text-ink">{g.displayName}</span>
                <Chevron />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Admin: the org at a glance */}
      {dash?.admin && (
        <section>
          <p className="eyebrow mb-2">The fleet</p>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile n={dash.admin.wantsDiscipleship} label="want discipling" href="/pipeline" tone="olive" />
            <StatTile n={dash.admin.openCapacityLeaders} label="open-capacity leaders" href="/groups" tone="deep" />
            <StatTile n={dash.admin.unassignedPeople} label="unassigned" href="/admin/unassigned" />
            <StatTile n={dash.admin.groupsWithoutMentor} label="groups w/o a mentor" href="/mentors" />
          </div>
        </section>
      )}

      {/* Directory shortcut */}
      <Link
        href="/directory"
        className="card flex items-center gap-3 px-4 py-3 text-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
        Search the directory
      </Link>

      {!hasWork && !isLeader && !dash?.admin && (
        <p className="px-1 text-sm text-muted">You&apos;re all set. Browse the directory or check the calendar.</p>
      )}
    </div>
  );
}

function HeroCard({ event }: { event: EventItem | null }) {
  if (event) {
    const d = new Date(event.startsAt);
    return (
      <Link href="/calendar" className="ocean block overflow-hidden rounded-hero p-5 text-cream shadow-hero">
        <p className="eyebrow !text-cream/70">Next gathering</p>
        <h2 className="mt-1 font-slab text-2xl font-bold">{event.title}</h2>
        <p className="mt-3 text-cream/85">
          {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        {event.location && <p className="text-sm text-cream/70">{[event.location, event.address].filter(Boolean).join(' · ')}</p>}
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-cream/15 px-3 py-1.5 text-sm font-medium">
          {event.myRsvp === 'YES' ? "You're going" : 'RSVP'} →
        </span>
      </Link>
    );
  }
  return (
    <div className="ocean overflow-hidden rounded-hero p-6 text-cream shadow-hero">
      <p className="eyebrow !text-cream/70">The mission</p>
      <p className="mt-2 font-slab text-xl leading-snug">
        &ldquo;Go therefore and make disciples of all nations.&rdquo;
      </p>
      <p className="mt-2 text-sm text-cream/70">Matthew 28:19</p>
    </div>
  );
}

function StatTile({
  n,
  label,
  href,
  tone,
}: {
  n: number;
  label: string;
  href: string;
  tone?: 'olive' | 'deep';
}) {
  const toneClass =
    tone === 'olive'
      ? 'text-olive'
      : tone === 'deep'
        ? 'text-deep'
        : 'text-ink';
  return (
    <Link href={href} className="card px-4 py-3.5">
      <div className={`font-slab text-3xl font-bold ${toneClass}`}>{n}</div>
      <div className="mt-0.5 text-[13px] leading-tight text-muted">{label}</div>
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8c8578" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
