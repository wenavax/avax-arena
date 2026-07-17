'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sword, Swords, ShoppingBag, Sparkles, Activity, Info, GitMerge, ChevronRight, ChevronLeft } from 'lucide-react';

interface TickerEvent {
  type: 'mint' | 'battle' | 'team_battle' | 'sale' | 'merge' | 'quest' | 'info';
  message: string;
  txHash?: string;
  blockNumber?: number;
  timeAgo?: string;
}

const TYPE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  mint: { icon: Sparkles, color: 'text-frost-green' },
  battle: { icon: Sword, color: 'text-frost-primary' },
  team_battle: { icon: Swords, color: 'text-frost-secondary' },
  sale: { icon: ShoppingBag, color: 'text-frost-gold' },
  merge: { icon: GitMerge, color: 'text-frost-orange' },
  quest: { icon: Activity, color: 'text-frost-primary' },
  info: { icon: Info, color: 'text-white/30' },
};

const STORAGE_KEY = 'frostbite_feed_collapsed';

export function ActivityTicker() {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapse preference and reflect it on <html> so the main column reclaims space
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
    setCollapsed(saved);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--feed-w', collapsed ? '48px' : '280px');
  }, [collapsed]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function fetchEvents() {
      try {
        const res = await fetch('/avalanche/api/v1/activity-ticker');
        if (res.ok && mounted) {
          const data = await res.json();
          const items = data.events || data;
          const latestBlock = data.latestBlock || 0;
          if (Array.isArray(items) && items.length > 0) {
            const withTime = items.map((e: TickerEvent) => {
              if (!e.blockNumber || !latestBlock) return e;
              const seconds = (latestBlock - e.blockNumber) * 2;
              let timeAgo: string;
              if (seconds < 60) timeAgo = 'just now';
              else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m`;
              else if (seconds < 86400) timeAgo = `${Math.floor(seconds / 3600)}h`;
              else timeAgo = `${Math.floor(seconds / 86400)}d`;
              return { ...e, timeAgo };
            });
            setEvents(withTime);
          }
        }
      } catch { /* ignore */ }
    }

    fetchEvents();
    const interval = setInterval(fetchEvents, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (events.length === 0) return null;

  /* ---- Collapsed: thin vertical strip with a re-open control ---- */
  if (collapsed) {
    return (
      <div data-chrome="" className="hidden xl:flex fixed right-0 top-0 bottom-0 w-12 z-30 flex-col items-center border-l border-white/[0.05] bg-[rgb(var(--frost-bg))]/90 backdrop-blur-sm">
        <button
          onClick={toggle}
          aria-label="Show live activity"
          className="group flex flex-col items-center gap-2 pt-4 w-full h-full hover:bg-white/[0.03] transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-white/40 group-hover:text-frost-primary transition-colors" />
          <span className="relative flex h-2 w-2 mt-1">
            <span className="absolute inline-flex h-full w-full rounded-full bg-frost-primary/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-frost-primary" />
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35 group-hover:text-white/60 transition-colors mt-2"
            style={{ writingMode: 'vertical-rl' }}
          >
            Live Activity
          </span>
        </button>
      </div>
    );
  }

  // Duplicate for seamless vertical scroll
  const display = [...events, ...events];

  /* ---- Expanded: compact feed ---- */
  return (
    <div data-chrome="" className="hidden xl:flex fixed right-0 top-0 bottom-0 w-[280px] z-30 flex-col border-l border-white/[0.05] bg-[rgb(var(--frost-bg))]/90 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.05] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-frost-primary/60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-frost-primary" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Live Activity</span>
        </div>
        <button
          onClick={toggle}
          aria-label="Collapse live activity"
          className="p-1 -mr-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Scrolling feed — pauses on hover */}
      <div className="flex-1 overflow-hidden relative group/ticker">
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[rgb(var(--frost-bg))] to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[rgb(var(--frost-bg))] to-transparent z-10 pointer-events-none" />

        <div
          className="flex flex-col gap-0.5 px-2.5 py-3 ticker-scroll-feed"
          style={{
            animation: `ticker-vertical ${Math.max(events.length * 1.6, 16)}s linear infinite`,
          }}
        >
          {display.map((event, i) => {
            const cfg = TYPE_ICON[event.type] || TYPE_ICON.info;
            const Icon = cfg.icon;
            return (
              <div
                key={`${event.message}-${i}`}
                className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <Icon className={`w-3 h-3 ${cfg.color} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/55 leading-snug line-clamp-2">{event.message}</p>
                  {event.timeAgo && (
                    <span className="text-[9px] text-white/25 mt-0.5 block">{event.timeAgo}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
