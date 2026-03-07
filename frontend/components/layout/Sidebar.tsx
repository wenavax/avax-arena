'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import {
  Menu,
  X,
  Swords,
  Sparkles,
  MessageCircle,
  BarChart3,
  Bot,
  Store,
  GitMerge,
  User,
  Map,
  Wifi,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/mint', label: 'Mint', icon: Sparkles },
  { href: '/battle', label: 'Battle', icon: Swords },
  { href: '/merge', label: 'Fusion', icon: GitMerge },
  { href: '/quests', label: 'Quests', icon: Map },
  { href: '/marketplace', label: 'Market', icon: Store },
  { href: '/chat', label: 'Forum', icon: MessageCircle },
  { href: '/leaderboard', label: 'Rankings', icon: BarChart3 },
];

/* ---------- Desktop Sidebar ---------- */

export function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', icon: User }]
    : NAV_LINKS;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-56 flex-col bg-frost-bg border-r border-white/[0.04]">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 px-5 h-16 group flex-shrink-0">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
          <Image src="/logo.png" alt="Frostbite" width={32} height={32} className="rounded-lg" priority />
        </div>
        <span className="font-display text-[15px] font-bold tracking-wider">
          <span className="gradient-text">FROST</span>
          <span className="text-white/90 ml-0.5">BITE</span>
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navLinks.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-white/[0.06] text-white border-l-2 border-frost-cyan ml-0'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03] border-l-2 border-transparent'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="flex-shrink-0 px-3 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
        {/* Network badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/30">
          <Wifi className="w-3 h-3 text-frost-green" />
          <span>Avalanche C-Chain</span>
        </div>

        {/* Theme + Wallet row */}
        <div className="flex items-center gap-2 px-1">
          <ThemeToggle />
          <div className="flex-1 [&_button]:!text-xs [&_button]:!py-1.5 [&_button]:!px-2.5">
            <ConnectButton chainStatus="none" accountStatus="avatar" showBalance={false} />
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Mobile Top Bar ---------- */

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', icon: User }]
    : NAV_LINKS;

  return (
    <>
      {/* Top bar */}
      <header className="lg:hidden sticky top-0 z-50 flex items-center justify-between h-14 px-4 bg-frost-bg/90 backdrop-blur-xl border-b border-white/[0.04]">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Frostbite" width={28} height={28} className="rounded-lg" priority />
          <span className="font-display text-sm font-bold tracking-wider">
            <span className="gradient-text">FROST</span>
            <span className="text-white/90 ml-0.5">BITE</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ConnectButton chainStatus="none" accountStatus="avatar" showBalance={false} />
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Overlay — z-[55] to cover the sticky top bar (z-50) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer — z-[60] above overlay */}
      <div
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-[60] w-64 flex flex-col bg-frost-bg border-r border-white/[0.04] transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Drawer header */}
        <div className="flex-shrink-0 flex items-center justify-between h-14 px-4 border-b border-white/[0.04]">
          <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <Image src="/logo.png" alt="Frostbite" width={28} height={28} className="rounded-lg" priority />
            <span className="font-display text-sm font-bold tracking-wider">
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
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/[0.06] text-white border-l-2 border-frost-cyan'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03] border-l-2 border-transparent'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="flex-shrink-0 px-3 pb-4 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/30 mb-2">
            <Wifi className="w-3 h-3 text-frost-green" />
            <span>Avalanche C-Chain</span>
          </div>
          <div className="px-1">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  );
}
