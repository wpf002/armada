'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Icon({ name, active }: { name: string; active: boolean }) {
  const s = active ? '#42432e' : '#8c8578';
  const props = { width: 22, height: 22, fill: 'none', stroke: s, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'directory':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 7h5M16 11h5M17 15h4" />
        </svg>
      );
    case 'groups':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8.5" strokeDasharray="2 3" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        </svg>
      );
    case 'me':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return null;
  }
}

const TABS = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/directory', label: 'Directory', icon: 'directory' },
  { href: '/groups', label: 'Groups', icon: 'groups' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/me', label: 'Me', icon: 'me' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/90 backdrop-blur-md">
      <ul className="mx-auto flex max-w-2xl px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + '/');
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-wide ${
                  active ? 'text-deep' : 'text-muted'
                }`}
              >
                <Icon name={t.icon} active={active} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
