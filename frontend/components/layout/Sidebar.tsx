'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import {
  Menu,
  X,
  User,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';
import { NAV_LINKS, NavStatusChip, WalletButton } from './nav-data';

/* ---------- Mobile Top Bar ---------- */

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  useEffect(() => { setOpen(false); }, [pathname]);

  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', desc: 'Your stats', icon: User, group: 'social' }]
    : NAV_LINKS;

  return (
    <>
      {/* Top bar */}
      <header data-chrome="" className="lg:hidden sticky top-0 z-50 flex items-center justify-between h-14 px-4 bg-[rgb(var(--frost-bg))]/95 backdrop-blur-xl border-b border-white/[0.04]">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/avalanche/logo.png" alt="Frostbite" width={30} height={30} className="rounded-lg" priority />
          <span className="font-display text-base font-bold tracking-wide">
            <span className="gradient-text">FROST</span>
            <span className="text-white/90 ml-0.5">BITE</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <WalletButton compact />
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        data-chrome=""
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-[60] w-72 max-w-[85vw] flex flex-col bg-[rgb(var(--frost-bg))] border-r border-white/[0.04] transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Drawer header */}
        <div className="flex-shrink-0 flex items-center justify-between h-14 px-4 border-b border-white/[0.04]">
          <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <Image src="/avalanche/logo.png" alt="Frostbite" width={28} height={28} className="rounded-lg" priority />
            <span className="font-display text-[9px] font-bold tracking-wider">
              <span className="gradient-text">FROST</span>
              <span className="text-white/90 ml-0.5">BITE</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {[...navLinks, { href: '/faq', label: 'FAQ', desc: 'Help & info', icon: HelpCircle, group: 'info' }].map((link: typeof NAV_LINKS[0]) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            const acc = link.acc ?? '#ed2f39';
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'relative flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[13px] font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-white/[0.07] to-white/[0.02] text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                )}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: acc, boxShadow: `0 0 8px ${acc}80` }}
                  />
                )}
                <div
                  className={cn('flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0', !isActive && 'bg-white/[0.03]')}
                  style={isActive ? { background: `${acc}26` } : undefined}
                >
                  <Icon className={cn('h-[18px] w-[18px]', !isActive && 'text-white/50')} style={isActive ? { color: acc } : undefined} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold leading-tight truncate">{link.label}</span>
                    <NavStatusChip status={link.status} />
                  </div>
                  <div className={cn('text-[10px] leading-tight mt-0.5', isActive ? 'text-white/40' : 'text-white/20')}>{link.desc}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-white/[0.04] space-y-3">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-frost-primary/[0.04] to-transparent border border-white/[0.05]">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-frost-primary/10">
              <Zap className="w-3.5 h-3.5 text-frost-primary" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-white/50">Avalanche</div>
              <div className="text-[9px] text-white/25">C-Chain Mainnet</div>
            </div>
          </div>
          <WalletButton />
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  );
}
