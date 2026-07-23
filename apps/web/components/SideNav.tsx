'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import type { SessionUser } from '@/lib/auth-client';
import { Wordmark } from '@/components/Wordmark';

interface Item {
  href: string;
  label: string;
  icon: string;
}

const MAIN: Item[] = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/directory', label: 'Directory', icon: 'directory' },
  { href: '/groups', label: 'Groups', icon: 'groups' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/pipeline', label: 'Discipleship', icon: 'pipeline' },
  { href: '/profile', label: 'Profile', icon: 'me' },
];

const ADMIN: Item[] = [
  { href: '/admin/intake', label: 'Intake Queue', icon: 'inbox' },
  { href: '/admin/unassigned', label: 'Unassigned', icon: 'alert' },
  { href: '/admin/users', label: 'Users & Roles', icon: 'users' },
  { href: '/admin/audit', label: 'Audit Log', icon: 'log' },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const s = active ? '#153a43' : '#8c8578';
  const p = {
    width: 20,
    height: 20,
    fill: 'none',
    stroke: s,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'directory':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 7h5M16 11h5M17 15h4" />
        </svg>
      );
    case 'groups':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8.5" strokeDasharray="2 3" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        </svg>
      );
    case 'pipeline':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h10M4 18h6" />
        </svg>
      );
    case 'me':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <path d="M4 13h4l2 3h4l2-3h4" />
          <path d="M5 5h14l1 8v6H4v-6z" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v5M12 16.5v.01" />
        </svg>
      );
    case 'users':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <circle cx="9" cy="9" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 6.5a3 3 0 0 1 0 6M17.5 19a5 5 0 0 0-2-4" />
        </svg>
      );
    case 'log':
      return (
        <svg {...p} viewBox="0 0 24 24">
          <path d="M6 4h12v16H6z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
    default:
      return null;
  }
}

export function SideNav({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user?: SessionUser;
}) {
  const pathname = usePathname();

  // Close only when the route actually changes (onClose isn't referentially stable).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const initials =
    (user?.name ?? '?')
      .split(' ')
      .map((x) => x[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[286px] flex-col border-r border-line bg-cream transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Wordmark height={30} />
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-muted hover:bg-sand"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {MAIN.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + '/');
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={`flex min-h-[46px] items-center gap-3 rounded-full px-4 text-[15px] font-medium ${
                      active ? 'bg-sand text-deep' : 'text-ink-soft hover:bg-sand/60'
                    }`}
                  >
                    <Icon name={it.icon} active={active} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {user?.role === 'ADMIN' && (
            <>
              <p className="eyebrow mt-6 px-4">Admin</p>
              <ul className="mt-2 flex flex-col gap-0.5">
                {ADMIN.map((it) => {
                  const active = pathname === it.href;
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={`flex min-h-[46px] items-center gap-3 rounded-full px-4 text-[15px] font-medium ${
                          active ? 'bg-sand text-deep' : 'text-ink-soft hover:bg-sand/60'
                        }`}
                      >
                        <Icon name={it.icon} active={active} />
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="border-t border-line px-5 py-4">
          <Link href="/profile" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-deep text-xs font-semibold text-cream">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{user?.name}</span>
              <span className="block truncate text-xs capitalize text-muted">
                {user?.role?.toLowerCase()}
              </span>
            </span>
          </Link>
          <button
            onClick={async () => {
              await signOut();
              window.location.assign('/login');
            }}
            className="mt-3 w-full rounded-full border border-line py-2 text-sm text-muted hover:text-ink"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
