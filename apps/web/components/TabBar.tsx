'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/home', label: 'Home', icon: '⚓' },
  { href: '/directory', label: 'Directory', icon: '☰' },
  { href: '/groups', label: 'Groups', icon: '◎' },
  { href: '/calendar', label: 'Calendar', icon: '▦' },
  { href: '/me', label: 'Me', icon: '◐' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-grey-200 bg-white/95 backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + '/');
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? 'text-deep' : 'text-slate'
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
