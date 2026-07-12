'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, Scale, PiggyBank, History } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Обзор', icon: Home },
  { href: '/expenses', label: 'Расходы', icon: Receipt },
  { href: '/balances', label: 'Баланс', icon: Scale },
  { href: '/fund', label: 'Касса', icon: PiggyBank },
  { href: '/history', label: 'История', icon: History },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px]',
              active ? 'text-link' : 'text-hint',
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
