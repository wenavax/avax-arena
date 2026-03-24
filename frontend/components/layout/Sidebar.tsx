'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  BarChart3,
  Store,
  GitMerge,
  User,
  Map,
  Wallet,
  Copy,
  Check,
  Zap,
  ChevronRight,
  HelpCircle,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

/* ---------- Inline Music Controls ---------- */

const TRACKS = [
  { src: '/music/track1.mp3', title: '1' },
  { src: '/music/track2.mp3', title: '2' },
  { src: '/music/track3.mp3', title: '3' },
  { src: '/music/track4.mp3', title: '4' },
];

function MusicControls() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = new Audio(TRACKS[0].src);
    audio.volume = 0.3;
    audioRef.current = audio;
    audio.addEventListener('ended', () => {
      setTrack(prev => {
        const next = (prev + 1) % TRACKS.length;
        audio.src = TRACKS[next].src;
        audio.play().catch(() => {});
        return next;
      });
    });
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else { a.play().then(() => setIsPlaying(true)).catch(() => {}); }
  }, [isPlaying]);

  const next = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const n = (track + 1) % TRACKS.length;
    setTrack(n);
    a.src = TRACKS[n].src;
    if (isPlaying) a.play().catch(() => {});
  }, [track, isPlaying]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const p = (track - 1 + TRACKS.length) % TRACKS.length;
    setTrack(p);
    a.src = TRACKS[p].src;
    if (isPlaying) a.play().catch(() => {});
  }, [track, isPlaying]);

  const toggleMute = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !muted;
    setMuted(!muted);
  }, [muted]);

  const btnCls = 'w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all';

  return (
    <div className="flex items-center gap-0.5">
      <button onClick={prev} className={btnCls} title="Prev"><SkipBack className="w-2.5 h-2.5" /></button>
      <button
        onClick={toggle}
        className={cn('w-7 h-7 flex items-center justify-center rounded-lg transition-all', isPlaying ? 'bg-frost-primary/20 text-frost-primary' : 'bg-white/[0.06] text-white/40 hover:text-white/70')}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      <button onClick={next} className={btnCls} title="Next"><SkipForward className="w-2.5 h-2.5" /></button>
      <button onClick={toggleMute} className={btnCls} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
      </button>
    </div>
  );
}

const NAV_LINKS = [
  { href: '/mint', label: 'Mint', desc: 'Create warriors', icon: Sparkles, group: 'play' },
  { href: '/battle', label: 'Battle', desc: 'PvP arena', icon: Swords, group: 'play' },
  { href: '/merge', label: 'Fusion', desc: 'Merge warriors', icon: GitMerge, group: 'play' },
  { href: '/quests', label: 'Quests', desc: 'PvE missions', icon: Map, group: 'play' },
  { href: '/marketplace', label: 'Market', desc: 'Buy & sell', icon: Store, group: 'trade' },
  { href: '/leaderboard', label: 'Rankings', desc: 'Leaderboard', icon: BarChart3, group: 'social' },
];

/* ---------- Custom Wallet Button ---------- */

function WalletButton({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none' as const, userSelect: 'none' as const },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200',
                      'bg-gradient-to-r from-frost-primary/20 to-frost-secondary/20',
                      'border border-frost-primary/30 hover:border-frost-primary/50',
                      'text-frost-primary hover:text-white',
                      'hover:shadow-[0_0_20px_rgba(255,32,32,0.2)]',
                      compact
                        ? 'text-[11px] px-3 py-1.5'
                        : 'text-xs px-4 py-2.5'
                    )}
                  >
                    <Wallet className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                    <span>Connect Wallet</span>
                  </button>
                );
              }

              return (
                <div className={cn(
                  'flex items-center gap-1.5',
                  !compact && 'w-full'
                )}>
                  <button
                    onClick={openAccountModal}
                    className={cn(
                      'flex items-center gap-2 rounded-xl transition-all duration-200',
                      'bg-white/[0.04] border border-white/[0.06]',
                      'hover:bg-white/[0.08] hover:border-white/[0.12]',
                      compact
                        ? 'text-[10px] px-2 py-1'
                        : 'flex-1 text-[11px] px-3 py-2.5'
                    )}
                  >
                    <span className="w-2 h-2 rounded-full bg-frost-green flex-shrink-0 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
                    <span className="font-mono text-white/60">
                      {account.displayName}
                    </span>
                  </button>
                  <button
                    onClick={() => copyAddress(account.address)}
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-white/30 hover:text-white/60 transition-all border border-white/[0.04]"
                    title="Copy address"
                  >
                    {copied ? <Check className="h-3 w-3 text-frost-green" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

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

  const renderLink = (link: typeof NAV_LINKS[0]) => {
    const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        className={cn(
          'group/link relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-gradient-to-r from-frost-primary/[0.12] to-frost-primary/[0.04] text-white'
            : 'text-white/40 hover:text-white/80 hover:bg-white/[0.03]'
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-frost-primary shadow-[0_0_8px_rgba(255,32,32,0.5)]" />
        )}
        <div className={cn(
          'flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 flex-shrink-0',
          isActive
            ? 'bg-frost-primary/15 shadow-[0_0_12px_rgba(255,32,32,0.15)]'
            : 'bg-white/[0.03] group-hover/link:bg-white/[0.06]'
        )}>
          <Icon className={cn('h-[18px] w-[18px] transition-colors', isActive ? 'text-frost-primary' : 'text-white/50 group-hover/link:text-white/70')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold leading-tight">{link.label}</div>
          <div className={cn('text-[10px] leading-tight mt-0.5', isActive ? 'text-white/40' : 'text-white/20')}>{link.desc}</div>
        </div>
        {isActive && (
          <ChevronRight className="w-3.5 h-3.5 text-frost-primary/40 flex-shrink-0" />
        )}
      </Link>
    );
  };

  const renderSection = (title: string, links: typeof NAV_LINKS) => (
    <div className="mb-2">
      <div className="px-4 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/15">
        {title}
      </div>
      <div className="space-y-0.5">
        {links.map(renderLink)}
      </div>
    </div>
  );

  return (
    <aside className="hidden lg:flex sticky top-0 z-40 w-[16.5rem] flex-shrink-0 h-screen flex-col bg-[rgb(var(--frost-bg))]/95 backdrop-blur-sm border-r border-white/[0.04]">
      {/* Logo area */}
      <Link href="/" className="flex items-center gap-3.5 px-5 h-[4.5rem] group flex-shrink-0 border-b border-white/[0.04]">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden ring-1 ring-white/[0.08] shadow-[0_0_15px_rgba(255,32,32,0.1)] group-hover:shadow-[0_0_20px_rgba(255,32,32,0.2)] transition-shadow">
          <Image src="/logo.png" alt="Frostbite" width={40} height={40} className="rounded-xl" priority />
        </div>
        <div>
          <div className="font-display text-[15px] font-bold tracking-wider leading-tight">
            <span className="gradient-text">FROST</span>
            <span className="text-white/80 ml-0.5">BITE</span>
          </div>
          <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-white/20 mt-0.5">Battle Arena</div>
        </div>
      </Link>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-3">
        {renderSection('Play', playLinks)}
        <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        {renderSection('Trade', tradeLinks)}
        <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        {renderSection('Social', socialLinks)}

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
      <header className="lg:hidden sticky top-0 z-50 flex items-center justify-between h-14 px-4 bg-[rgb(var(--frost-bg))]/95 backdrop-blur-xl border-b border-white/[0.04]">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Frostbite" width={28} height={28} className="rounded-lg" priority />
          <span className="font-display text-sm font-bold tracking-wider">
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
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-[60] w-72 max-w-[85vw] flex flex-col bg-[rgb(var(--frost-bg))] border-r border-white/[0.04] transition-transform duration-300 ease-in-out',
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
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {[...navLinks, { href: '/faq', label: 'FAQ', desc: 'Help & info', icon: HelpCircle, group: 'info' }].map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'relative flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[13px] font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-frost-primary/[0.12] to-frost-primary/[0.04] text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-frost-primary shadow-[0_0_8px_rgba(255,32,32,0.5)]" />
                )}
                <div className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0',
                  isActive ? 'bg-frost-primary/15' : 'bg-white/[0.03]'
                )}>
                  <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-frost-primary' : 'text-white/50')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold leading-tight">{link.label}</div>
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
