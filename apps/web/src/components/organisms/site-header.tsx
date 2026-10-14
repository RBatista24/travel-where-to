'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'New search', short: 'Search' },
  { href: '/searches', label: 'Recent searches', short: 'Recent' },
];

export function Brand() {
  return (
    <Link href="/" className="font-display flex shrink-0 items-center gap-2 text-lg whitespace-nowrap font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="text-azulejo size-6" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
        <path d="M12 5.5 L18.5 12 L12 18.5 L5.5 12 Z" fill="none" stroke="white" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="2" fill="#f2b33d" />
      </svg>
      Where to?
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Main">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn('rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors sm:px-3', active ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground')}
                  >
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
