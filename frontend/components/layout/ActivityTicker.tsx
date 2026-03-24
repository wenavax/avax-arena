'use client';

import { useEffect, useState } from 'react';
import { Sword, Swords, ShoppingBag, Sparkles, Activity, Info, GitMerge } from 'lucide-react';

interface TickerEvent {
  type: 'mint' | 'battle' | 'team_battle' | 'sale' | 'merge' | 'quest' | 'info';
  message: string;
  txHash?: string;
  blockNumber?: number;
  timeAgo?: string;
}

const TYPE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  mint: { icon: Sparkles, color: 'text-frost-green' },
  battle: { icon: Sword, color: 'text-frost-cyan' },
  team_battle: { icon: Swords, color: 'text-frost-purple' },
  sale: { icon: ShoppingBag, color: 'text-frost-gold' },
  merge: { icon: GitMerge, color: 'text-frost-orange' },
  quest: { icon: Activity, color: 'text-frost-cyan' },
  info: { icon: Info, color: 'text-white/30' },
};

export function ActivityTicker() {
  const [events, setEvents] = useState<TickerEvent[]>([]);

  useEffect(() => {
    let mounted = true;

    async function fetchEvents() {
      try {
        const res = await fetch('/api/v1/activity-ticker');
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

  // Duplicate for seamless vertical scroll
  const display = [...events, ...events];

  return (
    <div className="hidden xl:flex fixed right-0 top-0 bottom-0 w-[280px] z-30 flex-col border-l border-white/[0.04] bg-[rgb(var(--frost-bg))]/90 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-white/[0.04] flex-shrink-0">
        <Activity className="w-3.5 h-3.5 text-frost-cyan animate-pulse" />
        <span className="text-[10px] font-pixel uppercase tracking-wider text-white/35">Live Activity</span>
      </div>

      {/* Scrolling feed */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[rgb(var(--frost-bg))] to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[rgb(var(--frost-bg))] to-transparent z-10 pointer-events-none" />

        <div
          className="flex flex-col gap-1 px-3 py-3"
          style={{
            animation: `ticker-vertical ${Math.max(events.length * 4, 40)}s linear infinite`,
          }}
        >
          {display.map((event, i) => {
            const cfg = TYPE_ICON[event.type] || TYPE_ICON.info;
            const Icon = cfg.icon;
            return (
              <div
                key={`${event.message}-${i}`}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <Icon className={`w-3 h-3 ${cfg.color} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/50 leading-snug break-words">{event.message}</p>
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
