'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { Radio, Trophy } from 'lucide-react';

interface LiveMatch {
  matchId: string;
  status: 'Open' | 'Locked' | 'Settled';
  players: string[];
  paidCount: number;
  createdBlock: number;
  ranking?: string[];
  block: number;
}
interface Feed { matches: LiveMatch[]; entryFee: string; rewards: string[]; head: number; error?: string }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const P_COLORS = ['--p1', '--p2', '--p3', '--p4'];

function StatusBadge({ s }: { s: LiveMatch['status'] }) {
  const map = {
    Open: { c: '#4dd0e1', t: 'OPEN' },
    Locked: { c: '#f5c542', t: 'LOCKED · RACING' },
    Settled: { c: '#22c55e', t: 'SETTLED' },
  }[s];
  return (
    <span className="lm-badge" style={{ color: map.c, borderColor: `${map.c}66` }}>
      {s === 'Locked' && <span className="lm-dot" style={{ background: map.c }} />}
      {map.t}
    </span>
  );
}

export default function LiveMatches({ myAddress }: { myAddress?: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch('/avalanche/api/cardgame/matches', { cache: 'no-store' });
        const d: Feed = await r.json();
        if (!alive) return;
        setLive(!d.error);
        // flag matches whose activity block advanced since last poll (for pulse)
        const next = new Set<string>();
        for (const m of d.matches) {
          const key = `${m.matchId}:${m.block}`;
          if (!seen.current.has(key)) { next.add(m.matchId); seen.current.add(key); }
        }
        if (next.size) { setFresh(next); setTimeout(() => alive && setFresh(new Set()), 1500); }
        setFeed(d);
      } catch {
        if (alive) setLive(false);
      } finally {
        if (alive) setLoading(false);
      }
    }
    tick();
    const h = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(h); };
  }, []);

  const pool = feed ? BigInt(feed.entryFee) * 4n : 0n;
  const rewards = feed?.rewards.map((r) => BigInt(r)) ?? [];
  const mine = myAddress?.toLowerCase();

  return (
    <div className="lm-wrap">
      <div className="lm-head glass">
        <div className="lm-head-l">
          <Radio size={16} className={live ? 'lm-live-ic' : 'lm-off-ic'} />
          <span className="lm-title">LIVE MATCHES</span>
          <span className="lm-sub">Avalanche Fuji · MatchEscrow</span>
        </div>
        <div className="lm-head-r mono">
          {feed && <>block #{feed.head.toLocaleString('en-US')} · pool ◆ {formatEther(pool)}</>}
        </div>
      </div>

      {loading && <div className="lm-empty">Loading on-chain matches…</div>}
      {!loading && feed && feed.matches.length === 0 && (
        <div className="lm-empty">No recent matches. Start a staked match to appear here live.</div>
      )}

      <div className="lm-list">
        {feed?.matches.map((m) => (
          <div key={m.matchId} className={`lm-card glass ${fresh.has(m.matchId) ? 'lm-pulse' : ''}`}>
            <div className="lm-card-top">
              <span className="mono lm-id">{short(m.matchId)}</span>
              <StatusBadge s={m.status} />
            </div>
            <div className="lm-seats">
              {m.players.map((p, i) => {
                const rank = m.status === 'Settled' && m.ranking ? m.ranking.findIndex((r) => r.toLowerCase() === p.toLowerCase()) : -1;
                const isMe = mine && p.toLowerCase() === mine;
                const paid = m.status !== 'Open' || i < m.paidCount;
                return (
                  <div key={p + i} className={`lm-seat ${rank === 0 ? 'lm-winner' : ''} ${isMe ? 'lm-me' : ''} ${paid ? '' : 'lm-unpaid'}`}>
                    <i className="lm-av" style={{ background: `var(${P_COLORS[i]})` }} />
                    <span className="mono">{isMe ? 'YOU' : short(p)}</span>
                    {rank === 0 && <Trophy size={11} className="lm-trophy" />}
                    {m.status === 'Settled' && rank >= 0 && <span className="lm-reward gold">◆{formatEther(rewards[rank] ?? 0n)}</span>}
                  </div>
                );
              })}
            </div>
            {m.status === 'Open' && (
              <div className="lm-progress"><div style={{ width: `${(m.paidCount / 4) * 100}%` }} /></div>
            )}
            {m.status === 'Open' && <div className="lm-foot">{m.paidCount}/4 seated · waiting for players</div>}
            {m.status === 'Locked' && <div className="lm-foot">race in progress — settlement pending</div>}
            {m.status === 'Settled' && <div className="lm-foot ok">✓ signed &amp; paid out</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
