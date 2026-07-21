'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { LogOut } from 'lucide-react';
import { useAccount } from 'wagmi';
import {
  Swords,
  Sparkles,
  BarChart3,
  Store,
  ArrowLeftRight,
  GitMerge,
  Map,
  Bot,
  Wallet,
  Copy,
  Check,
  Rocket,
  Car,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Compass,
  Dices,
  Gem,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- Inline Music Controls ---------- */

const TRACKS = [
  { src: '/avalanche/music/track1.mp3', title: '1' },
  { src: '/avalanche/music/track2.mp3', title: '2' },
  { src: '/avalanche/music/track3.mp3', title: '3' },
  { src: '/avalanche/music/track4.mp3', title: '4' },
  { src: '/avalanche/music/track5.mp3', title: '5' },
  { src: '/avalanche/music/track6.mp3', title: '6' },
];

export function MusicControls() {
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

/* Nav entries mirror the homepage arcade cards: same accent colour per game
 * (acc) and the same maturity status (LIVE / TESTNET / BETA). Arena sub-pages
 * (mint/fusion/quests/agents) carry the Arena accent without a chip. */
export type NavStatus = 'LIVE' | 'TESTNET' | 'BETA';
export const NAV_LINKS: {
  href: string; label: string; desc: string; icon: typeof Swords; group: string;
  acc?: string; status?: NavStatus;
}[] = [
  { href: '/battle', label: 'Arena', desc: 'PvP battles, AVAX stakes', icon: Swords, group: 'play', acc: '#ed2f39', status: 'LIVE' },
  { href: '/mint', label: 'Mint', desc: 'Create warriors', icon: Sparkles, group: 'play', acc: '#ed2f39' },
  { href: '/merge', label: 'Fusion', desc: 'Merge warriors', icon: GitMerge, group: 'play', acc: '#ed2f39' },
  { href: '/quests', label: 'Quests', desc: 'PvE missions', icon: Target, group: 'play', acc: '#ed2f39' },
  { href: '/agents', label: 'Agents', desc: 'AI warriors', icon: Bot, group: 'play', acc: '#ed2f39' },
  { href: '/cardgame', label: 'CAR(D) GAME', desc: 'Card-combo racing', icon: Car, group: 'play', acc: '#f5c542', status: 'TESTNET' },
  { href: '/world', label: 'World', desc: 'Isometric RPG', icon: Map, group: 'play', acc: '#4dd0e1', status: 'TESTNET' },
  { href: '/world/adventures', label: 'Adventures', desc: 'Idle NFT staking', icon: Compass, group: 'play', acc: '#6ee7a0', status: 'TESTNET' },
  { href: '/expeditions', label: 'Expeditions', desc: 'AI-boss roguelike', icon: Dices, group: 'play', acc: '#a78bfa', status: 'TESTNET' },
  { href: '/marketplace', label: 'Market', desc: 'Buy & sell NFTs', icon: Store, group: 'trade', acc: '#fb7185', status: 'LIVE' },
  { href: '/launchpad', label: 'Launchpad', desc: 'Launch & trade tokens', icon: Rocket, group: 'trade', acc: '#f97316', status: 'LIVE' },
  { href: '/swap', label: 'Swap', desc: 'Trade tokens', icon: ArrowLeftRight, group: 'trade', acc: '#2dd4bf', status: 'LIVE' },
  { href: '/leaderboard', label: 'Rankings', desc: 'Leaderboard', icon: BarChart3, group: 'social' },
  { href: '/nft-score', label: 'NFT Score', desc: 'Rate NFT portfolios', icon: Gem, group: 'social', acc: '#c084fc', status: 'BETA' },
];

/* Status chip matching the arcade card chips (green LIVE dot only; amber
 * TESTNET / cyan BETA get a label — that's the risk signal that matters). */
export const NAV_STATUS_STYLE: Record<NavStatus, { dot: string; text: string }> = {
  LIVE: { dot: '#22c55e', text: '#4ade80' },
  TESTNET: { dot: '#f97316', text: '#fb923c' },
  BETA: { dot: '#4dd0e1', text: '#67e8f9' },
};

export function NavStatusChip({ status }: { status?: NavStatus }) {
  if (!status) return null;
  const st = NAV_STATUS_STYLE[status];
  return (
    <span className="flex items-center gap-1 flex-shrink-0" title={status}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot, boxShadow: `0 0 5px ${st.dot}` }} />
      {status !== 'LIVE' && (
        <span className="text-[8px] font-bold tracking-wider" style={{ color: st.text }}>{status}</span>
      )}
    </span>
  );
}

/* ---------- Custom Wallet Button ---------- */

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const connected = ready && authenticated && !!address;
  const displayName = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  return (
    <div
      {...(!ready && {
        'aria-hidden': true,
        style: { opacity: 0, pointerEvents: 'none' as const, userSelect: 'none' as const },
      })}
    >
      {!connected ? (
        <button
          onClick={login}
          disabled={!ready}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200',
            'bg-gradient-to-r from-frost-primary/20 to-frost-secondary/20',
            'border border-frost-primary/30 hover:border-frost-primary/50',
            'text-frost-primary hover:text-white',
            'hover:shadow-[0_0_20px_rgba(255,32,32,0.2)]',
            compact ? 'text-[11px] px-3 py-1.5' : 'text-xs px-4 py-2.5'
          )}
        >
          <Wallet className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          <span>Connect Wallet</span>
        </button>
      ) : (
        <div className={cn('flex items-center gap-1.5', !compact && 'w-full')}>
          <button
            onClick={() => copyAddress(address!)}
            title="Copy address"
            className={cn(
              'flex items-center gap-2 rounded-xl transition-all duration-200',
              'bg-white/[0.04] border border-white/[0.06]',
              'hover:bg-white/[0.08] hover:border-white/[0.12]',
              compact ? 'text-[10px] px-2 py-1' : 'flex-1 text-[11px] px-3 py-2.5'
            )}
          >
            <span className="w-2 h-2 rounded-full bg-frost-green flex-shrink-0 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
            <span className="font-mono text-white/60">{copied ? 'Copied!' : displayName}</span>
            {copied ? (
              <Check className="h-3 w-3 text-frost-green flex-shrink-0" />
            ) : (
              <Copy className="h-3 w-3 text-white/30 flex-shrink-0" />
            )}
          </button>
          <button
            onClick={logout}
            title="Disconnect"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.03] hover:bg-frost-primary/10 text-white/30 hover:text-frost-primary transition-all border border-white/[0.04]"
          >
            <LogOut className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
