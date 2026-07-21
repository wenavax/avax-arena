'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Zap, User, ChevronDown } from 'lucide-react';
import { NAV_LINKS, NavStatusChip, WalletButton, MusicControls, type NavStatus } from './nav-data';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const GROUPS: { key: string; label: string }[] = [
  { key: 'play', label: 'Play' },
  { key: 'trade', label: 'Trade' },
  { key: 'social', label: 'Social' },
];

export function TopNav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const navLinks = isConnected && address
    ? [...NAV_LINKS, { href: `/profile/${address}`, label: 'Profile', desc: 'Your stats', icon: User, group: 'social' as const }]
    : NAV_LINKS;

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = useCallback((g: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenGroup(g);
  }, []);
  const closeSoon = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenGroup(null), 140); // hover köprüsü boşluğu
  }, []);
  // Esc + dış-tık kapatma
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenGroup(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeGroup = navLinks.find(l => pathname === l.href || pathname.startsWith(l.href + '/'))?.group ?? null;

  return (
    <header
      data-chrome=""
      className="hidden lg:flex sticky top-0 z-40 items-center gap-1 h-14 px-5 bg-[rgb(var(--frost-bg))]/95 backdrop-blur-xl border-b border-white/[0.05]"
      onMouseLeave={closeSoon}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mr-3 flex-shrink-0 group">
        <Image src="/avalanche/logo.png" alt="Frostbite" width={32} height={32} className="rounded-lg ring-1 ring-white/[0.08]" priority />
        <span className="font-display text-lg font-bold tracking-wide leading-none">
          <span className="gradient-text">FROST</span><span className="text-white/85 ml-0.5">BITE</span>
        </span>
      </Link>

      {/* Group tabs */}
      <nav className="flex items-center gap-0.5">
        {GROUPS.map(g => {
          const links = navLinks.filter(l => l.group === g.key);
          const isOpen = openGroup === g.key;
          const isActive = activeGroup === g.key;
          return (
            <div key={g.key} className="relative" onMouseEnter={() => openNow(g.key)}>
              <button
                onClick={() => setOpenGroup(isOpen ? null : g.key)}
                aria-expanded={isOpen}
                className={cn(
                  'flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors',
                  isActive || isOpen ? 'text-white' : 'text-white/50 hover:text-white/80'
                )}
              >
                {g.label}
                <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isActive && <div className="absolute left-3 right-3 -bottom-[1px] h-[2px] rounded-full bg-frost-primary" />}
              {isOpen && <GroupPanel links={links} pathname={pathname} onNavigate={() => setOpenGroup(null)} />}
            </div>
          );
        })}
        {/* FAQ tek link */}
        <Link href="/faq" className="px-3 py-2 rounded-lg text-[13px] font-semibold text-white/40 hover:text-white/70 transition-colors">FAQ</Link>
      </nav>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <Zap className="w-3.5 h-3.5 text-frost-primary" />
          <span className="text-[10px] font-semibold text-white/50">Avalanche</span>
        </div>
        <MusicControls />
        <ThemeToggle />
        <WalletButton compact />
      </div>
    </header>
  );
}

function GroupPanel({ links, pathname, onNavigate }: { links: typeof NAV_LINKS; pathname: string; onNavigate: () => void }) {
  return (
    <div
      role="menu"
      className="absolute left-0 top-full mt-1 w-[540px] max-w-[80vw] p-2 rounded-2xl bg-[rgb(var(--frost-bg))] backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.6)] grid grid-cols-2 gap-1 z-50"
    >
      {links.map(link => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
        const Icon = link.icon;
        const acc = (link as { acc?: string }).acc ?? '#ed2f39';
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            role="menuitem"
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors', isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]')}
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
              style={isActive ? { background: `${acc}26` } : { background: 'rgba(255,255,255,0.03)' }}>
              <Icon className="h-[18px] w-[18px]" style={isActive ? { color: acc } : { color: 'rgba(255,255,255,0.5)' }} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={cn('text-[13px] font-semibold leading-tight truncate', isActive ? 'text-white' : 'text-white/80')}>{link.label}</span>
                <NavStatusChip status={(link as { status?: NavStatus }).status} />
              </span>
              <span className="block text-[10px] leading-tight mt-0.5 text-white/30 truncate">{link.desc}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
