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
  ChevronRight,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';
import { NAV_LINKS, NavStatusChip, WalletButton, MusicControls, type NavStatus } from './nav-data';

/* ---------- Desktop Sidebar ---------- */

export function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', desc: 'Your stats', icon: User, group: 'social' }]
    : NAV_LINKS;

  const playLinks = navLinks.filter(l => l.group === 'play');
  const tradeLinks = navLinks.filter(l => l.group === 'trade');
  const socialLinks = navLinks.filter(l => l.group === 'social');

  // Collapsible sections: everything starts closed; the group that contains the
  // current page auto-opens on navigation. Manual toggles stick until you leave.
  const activeGroup = navLinks.find(l => pathname === l.href || pathname.startsWith(l.href + '/'))?.group ?? null;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    activeGroup ? { [activeGroup]: true } : {}
  );
  useEffect(() => {
    if (activeGroup) setOpenGroups(o => (o[activeGroup] ? o : { ...o, [activeGroup]: true }));
  }, [activeGroup]);

  const renderLink = (link: typeof NAV_LINKS[0]) => {
    const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
    const Icon = link.icon;
    const acc = link.acc ?? '#ed2f39';
    return (
      <Link
        key={link.href}
        href={link.href}
        className={cn(
          'group/link relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-gradient-to-r from-white/[0.07] to-white/[0.02] text-white'
            : 'text-white/40 hover:text-white/80 hover:bg-white/[0.03]'
        )}
      >
        {/* Active indicator bar in the game's arcade accent */}
        {isActive && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style={{ background: acc, boxShadow: `0 0 8px ${acc}80` }}
          />
        )}
        <div
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 flex-shrink-0',
            isActive ? '' : 'bg-white/[0.03] group-hover/link:bg-white/[0.06]'
          )}
          style={isActive ? { background: `${acc}26`, boxShadow: `0 0 12px ${acc}26` } : undefined}
        >
          <Icon
            className={cn('h-[18px] w-[18px] transition-colors', !isActive && 'text-white/50 group-hover/link:text-white/70')}
            style={isActive ? { color: acc } : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold leading-tight truncate">{link.label}</span>
            <NavStatusChip status={link.status} />
          </div>
          <div className={cn('text-[10px] leading-tight mt-0.5', isActive ? 'text-white/40' : 'text-white/20')}>{link.desc}</div>
        </div>
        {isActive && (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: `${acc}66` }} />
        )}
      </Link>
    );
  };

  const renderSection = (title: string, group: string, links: typeof NAV_LINKS) => {
    const isOpen = !!openGroups[group];
    const hasActive = group === activeGroup;
    return (
      <div className="mb-1">
        <button
          onClick={() => setOpenGroups(o => ({ ...o, [group]: !o[group] }))}
          className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 hover:text-white/60 hover:bg-white/[0.02] transition-colors"
          aria-expanded={isOpen}
        >
          <span className="flex items-center gap-2">
            {title}
            {/* closed section holding the active page → accent dot so you don't lose yourself */}
            {hasActive && !isOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-frost-primary shadow-[0_0_6px_rgba(237,47,57,0.8)]" />
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono tracking-normal text-white/15">{links.length}</span>
            <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', !isOpen && '-rotate-90')} />
          </span>
        </button>
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="space-y-0.5 pt-1 pb-1">
              {links.map(renderLink)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside data-chrome="" className="hidden lg:flex sticky top-0 z-40 w-[16.5rem] flex-shrink-0 h-screen flex-col bg-[rgb(var(--frost-bg))]/95 backdrop-blur-sm border-r border-white/[0.04]">
      {/* Logo area */}
      <Link href="/" className="flex items-center gap-3.5 px-5 h-[4.5rem] group flex-shrink-0 border-b border-white/[0.04]">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl overflow-hidden ring-1 ring-white/[0.08] shadow-[0_0_15px_rgba(255,32,32,0.1)] group-hover:shadow-[0_0_20px_rgba(255,32,32,0.2)] transition-shadow">
          <Image src="/avalanche/logo.png" alt="Frostbite" width={44} height={44} className="rounded-xl" priority />
        </div>
        <div>
          <div className="font-display text-xl font-bold tracking-wide leading-none">
            <span className="gradient-text">FROST</span>
            <span className="text-white/80 ml-0.5">BITE</span>
          </div>
          <div className="text-[9px] font-pixel uppercase tracking-[0.15em] text-white/25 mt-1">Battle Arena</div>
        </div>
      </Link>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-3">
        {renderSection('Play', 'play', playLinks)}
        <div className="mx-4 my-2 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        {renderSection('Trade', 'trade', tradeLinks)}
        <div className="mx-4 my-2 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        {renderSection('Social', 'social', socialLinks)}

        <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        {/* FAQ link */}
        <div className="mb-2">
          <div className="space-y-0.5">
            {renderLink({ href: '/faq', label: 'FAQ', desc: 'Help & info', icon: HelpCircle, group: 'info' })}
          </div>
        </div>
      </nav>

      {/* Bottom section */}
      <div className="flex-shrink-0 px-3 pb-5 pt-3 space-y-3 border-t border-white/[0.04]">
        {/* Network indicator */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-frost-primary/[0.04] to-transparent border border-white/[0.05]">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-frost-primary/10">
            <Zap className="w-3.5 h-3.5 text-frost-primary" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-white/50">Avalanche</div>
            <div className="text-[9px] text-white/25">C-Chain Mainnet</div>
          </div>
        </div>

        {/* Wallet */}
        <WalletButton />

        {/* Music player + Theme toggle */}
        <div className="flex items-center justify-between pt-1">
          <MusicControls />
          <ThemeToggle />
        </div>

        {/* Back to chain select */}
        <a
          href="/"
          className="flex items-center justify-center gap-1.5 mt-2 py-2 rounded-lg text-[10px] text-white/15 hover:text-white/40 hover:bg-white/[0.03] transition-all"
        >
          &larr; Chain Select
        </a>
      </div>
    </aside>
  );
}

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
