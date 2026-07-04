'use client';

// ─── Frostbite Adventures — P0 idle staking demo (token-free) ───
// Stake Frostlings into frozen biomes → accrue "Frost Shards" over wall-clock time
// → claim → burn shards to level up (raises yield + emission cap). 100% off-chain,
// localStorage-persisted, ZERO token risk. On-chain FSB settlement is P1.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ELEMENT_LABELS, ELEMENT_ICONS } from '@/lib/game/nft/heroGenerator';
import type { AdventuresState, Rarity } from '@/lib/game/adventures/types';
import { ZONES } from '@/lib/game/adventures/zones';
import { loadState, saveState, createInitialState } from '@/lib/game/adventures/heroes';
import {
  settle, stakeHero, unstakeHero, claimZone, claimAll, levelUpHero,
  costToNextLevel, emissionCap, gateCheck, ratePerSec, totalRatePerSec,
  positionOf, positionsInZone, heroById, isCapped,
} from '@/lib/game/adventures/engine';

const RARITY_COLORS: Record<Rarity, string> = {
  common: '#888888', uncommon: '#44cc44', rare: '#4488ff', epic: '#cc44ff', legendary: '#ffaa00',
};
const TIER_COLORS: Record<number, string> = { 1: '#4a90d9', 2: '#44cc88', 3: '#cc44ff', 4: '#ffaa00' };

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

export default function AdventuresPage() {
  const [state, setState] = useState<AdventuresState | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // hero id queued for placement
  const stateRef = useRef<AdventuresState | null>(null);
  stateRef.current = state;

  // Mount: load persisted state and grant offline accrual up to now.
  useEffect(() => {
    setState(settle(loadState(), Date.now()));
  }, []);

  // Persist on every change.
  useEffect(() => { if (state) saveState(state); }, [state]);

  // Live tick: settle accrual once a second so bars/rates move.
  useEffect(() => {
    const iv = setInterval(() => {
      setState((prev) => (prev ? settle(prev, Date.now()) : prev));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const totalRate = useMemo(() => (state ? totalRatePerSec(state) : 0), [state]);

  if (!state) {
    return <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#556677' }}>Loading the frozen wilds…</span>
    </div>;
  }

  const now = () => Date.now();
  const idle = state.roster.filter((h) => !positionOf(state, h.id));

  return (
    <div style={page}>
      {/* Header */}
      <header style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#00e5ff', fontFamily: '"Press Start 2P", monospace' }}>
            ADVENTURES
          </span>
          <span style={{ fontSize: 12, color: '#556677' }}>Frostbite · idle staking</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8fe3ff' }}>❄ {fmt(state.shards)}</div>
            <div style={{ fontSize: 11, color: '#556677' }}>
              Frost Shards{totalRate > 0 ? ` · +${totalRate.toFixed(1)}/s` : ''}
            </div>
          </div>
          <button style={btnGhost} onClick={() => setState(claimAll(state, now()))}>Claim All</button>
          <a href="/world" style={{ ...btnGhost, textDecoration: 'none' }}>← World</a>
        </div>
      </header>

      {/* Disclaimer */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#5a6b7a', padding: '8px 16px 0' }}>
        P0 demo — Frost Shards are off-chain and have no monetary value. Progress accrues even while away.
      </div>

      {/* Roster */}
      <section style={{ padding: '16px 24px 8px' }}>
        <h2 style={sectionTitle}>Your Frostlings {selected && <span style={{ color: '#00e5ff', fontSize: 12 }}>· pick a biome to send {heroById(state, selected)?.name}</span>}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {state.roster.map((h) => {
            const pos = positionOf(state, h.id);
            const cost = costToNextLevel(h.level);
            const canLevel = state.shards >= cost;
            const isSel = selected === h.id;
            return (
              <div
                key={h.id}
                onClick={() => { if (!pos) setSelected(isSel ? null : h.id); }}
                style={{
                  ...heroCard,
                  cursor: pos ? 'default' : 'pointer',
                  borderColor: isSel ? '#00e5ff' : pos ? 'rgba(68,204,136,0.35)' : 'rgba(255,255,255,0.08)',
                  boxShadow: isSel ? '0 0 0 1px #00e5ff' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#e6ecf5', fontSize: 14 }}>
                    {ELEMENT_ICONS[h.element]} {h.name}
                  </span>
                  <span style={{ ...chip, background: RARITY_COLORS[h.rarity] }}>{h.rarity}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8a99a8', marginTop: 4 }}>
                  Lv {h.level} · {ELEMENT_LABELS[h.element]} · ATK {h.atk} · DEF {h.def} · SPD {h.spd}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: pos ? '#44cc88' : '#66788a' }}>
                    {pos ? `⛏ ${ZONES.find((z) => z.id === pos.zoneId)?.name}` : 'Idle'}
                  </span>
                  <button
                    style={{ ...btnMini, opacity: canLevel ? 1 : 0.4, cursor: canLevel ? 'pointer' : 'not-allowed' }}
                    disabled={!canLevel}
                    onClick={(e) => { e.stopPropagation(); setState(levelUpHero(state, now(), h.id)); }}
                    title={`Burn ${cost} Frost Shards to reach Lv ${h.level + 1}`}
                  >
                    Lv↑ ❄{cost}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {idle.length === 0 && <div style={{ fontSize: 12, color: '#556677', marginTop: 8 }}>All Frostlings are out adventuring.</div>}
      </section>

      {/* Zones */}
      <section style={{ padding: '8px 24px 32px' }}>
        <h2 style={sectionTitle}>Frozen Biomes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {ZONES.map((z) => {
            const staked = positionsInZone(state, z.id);
            const zoneAccrued = staked.reduce((s, p) => s + p.accrued, 0);
            const selHero = selected ? heroById(state, selected) : null;
            const gate = selHero ? gateCheck(z, selHero) : null;
            const canSend = !!selHero && !positionOf(state, selHero.id) && gate?.ok;
            return (
              <div key={z.id} style={{ ...zoneCard, borderColor: canSend ? '#00e5ff' : 'rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ ...chip, background: TIER_COLORS[z.tier], marginRight: 6 }}>T{z.tier}</span>
                    <span style={{ fontWeight: 800, color: '#e6ecf5', fontSize: 16 }}>{z.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#66788a' }}>❄ {z.ratePerMin}/min pool</span>
                </div>
                <div style={{ fontSize: 12, color: '#8a99a8', margin: '6px 0 4px' }}>{z.blurb}</div>
                <div style={{ fontSize: 11, color: '#5a6b7a' }}>
                  Gate: Lv {z.gate.minLevel}
                  {Object.entries(z.gate.minStats).map(([k, v]) => ` · ${k}≥${v}`).join('')}
                  {' · '}rewards {z.primaryStats.join('+')}
                </div>

                {/* staked heroes */}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {staked.map((p) => {
                    const h = heroById(state, p.heroId)!;
                    const cap = emissionCap(h.level);
                    const pct = Math.min(100, (p.accrued / cap) * 100);
                    const capped = isCapped(state, p);
                    const rate = ratePerSec(state, h.id);
                    return (
                      <div key={p.heroId} style={stakeRow}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#cdd7e2' }}>{ELEMENT_ICONS[h.element]} {h.name} <span style={{ color: '#66788a' }}>Lv{h.level}</span></span>
                          <span style={{ color: capped ? '#ffaa00' : '#8fe3ff' }}>
                            ❄ {fmt(p.accrued)}/{fmt(cap)} {capped ? '· FULL' : `· +${rate.toFixed(1)}/s`}
                          </span>
                        </div>
                        <div style={barTrack}>
                          <div style={{ ...barFill, width: `${pct}%`, background: capped ? '#ffaa00' : 'linear-gradient(90deg,#0093c4,#00e5ff)' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button style={btnMini} onClick={() => setState(unstakeHero(state, now(), h.id))}>Recall</button>
                          {capped && (
                            <button
                              style={{ ...btnMini, opacity: state.shards + Math.floor(p.accrued) >= costToNextLevel(h.level) ? 1 : 0.4 }}
                              onClick={() => setState(levelUpHero(claimZone(state, now(), z.id), now(), h.id))}
                              title="Claim & level up to unlock more yield"
                            >
                              Claim+Lv↑
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {staked.length === 0 && <div style={{ fontSize: 11, color: '#556677' }}>No Frostlings here yet.</div>}
                </div>

                {/* actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {canSend && (
                    <button
                      style={{ ...btnPrimary, flex: 1 }}
                      onClick={() => { setState(stakeHero(state, now(), selected!, z.id)); setSelected(null); }}
                    >
                      ⛏ Send {selHero!.name}
                    </button>
                  )}
                  {selHero && !canSend && !positionOf(state, selHero.id) && (
                    <div style={{ fontSize: 11, color: '#c98', flex: 1, alignSelf: 'center' }}>🔒 {gate?.reason}</div>
                  )}
                  {zoneAccrued >= 1 && (
                    <button style={btnGhost} onClick={() => setState(claimZone(state, now(), z.id))}>Claim ❄{fmt(zoneAccrued)}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer stats */}
      <footer style={footer}>
        <FooterStat label="Lifetime Claimed" value={`❄ ${fmt(state.totalClaimed)}`} />
        <FooterStat label="Shards Burned (sink)" value={`🔥 ${fmt(state.totalBurned)}`} />
        <FooterStat label="Active Stakes" value={`${state.positions.length} / ${state.roster.length}`} />
        <button
          style={{ ...btnGhost, alignSelf: 'center' }}
          onClick={() => { if (confirm('Reset the Adventures demo? This clears local progress only.')) { const s = createInitialState(); setState(s); setSelected(null); } }}
        >
          Reset demo
        </button>
      </footer>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#e6ecf5' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#556677' }}>{label}</div>
    </div>
  );
}

// ── styles ──
const page: React.CSSProperties = {
  minHeight: '100vh', background: 'linear-gradient(180deg,#050810 0%,#0a0e1a 30%,#0f1525 100%)',
  color: '#e0e4ee', fontFamily: 'Inter, Arial, sans-serif', overflowY: 'auto', overflowX: 'hidden',
};
const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 24px', borderBottom: '1px solid rgba(0,229,255,0.1)', flexWrap: 'wrap', gap: 12,
};
const sectionTitle: React.CSSProperties = { fontSize: 13, color: '#66788a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 };
const heroCard: React.CSSProperties = { width: 220, background: 'rgba(20,26,40,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, transition: 'all 0.15s' };
const zoneCard: React.CSSProperties = { background: 'rgba(16,22,36,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, transition: 'all 0.15s' };
const stakeRow: React.CSSProperties = { background: 'rgba(10,14,26,0.7)', borderRadius: 8, padding: 8, border: '1px solid rgba(255,255,255,0.04)' };
const barTrack: React.CSSProperties = { height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', marginTop: 5, overflow: 'hidden' };
const barFill: React.CSSProperties = { height: '100%', borderRadius: 3, transition: 'width 0.5s linear' };
const chip: React.CSSProperties = { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase' };
const btnPrimary: React.CSSProperties = { padding: '9px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00aacc,#0077aa)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '9px 14px', borderRadius: 8, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnMini: React.CSSProperties = { padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b8c4d2', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const footer: React.CSSProperties = { display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 20, padding: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 12 };
