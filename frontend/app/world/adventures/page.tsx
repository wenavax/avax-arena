'use client';

// ─── Frostbite Adventures — P0 idle staking demo (token-free, enriched) ───
// Stake Frostlings (pixel-art sprites) into frozen biomes with elemental affinity →
// accrue Frost Shards over wall-clock time + roll idle discoveries → claim → burn
// shards to level up or recruit new Frostlings. 100% off-chain, ZERO token risk.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ELEMENT_LABELS, ELEMENT_ICONS, generateHeroTraits, heroToDataURL } from '@/lib/game/nft/heroGenerator';
import type { AdventuresState, AdventureHero, Rarity, GameEvent } from '@/lib/game/adventures/types';
import { ZONES, AFFINITY_MULT } from '@/lib/game/adventures/zones';
import { loadState, saveState, createInitialState, mergeChainHeroes } from '@/lib/game/adventures/heroes';
import { useChainAdventureHeroes } from '@/lib/game/adventures/useChainHeroes';
import {
  settle, stakeHero, unstakeHero, claimZone, claimAll, levelUpHero, recruit,
  costToNextLevel, emissionCap, recruitCost, gateCheck, affinityMult, ratePerSec, totalRatePerSec,
  positionOf, positionsInZone, heroById, isCapped,
} from '@/lib/game/adventures/engine';

const RARITY_COLORS: Record<Rarity, string> = {
  common: '#888888', uncommon: '#44cc44', rare: '#4488ff', epic: '#cc44ff', legendary: '#ffaa00',
};
const TIER_COLORS: Record<number, string> = { 1: '#4a90d9', 2: '#44cc88', 3: '#cc44ff', 4: '#ffaa00' };
const EVENT_ICON: Record<GameEvent['kind'], string> = {
  find: '🔎', 'rare-find': '💎', level: '⬆️', claim: '❄', cap: '🔒', recruit: '✨',
};
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

// ── pixel-art sprite (cached; browser-only via canvas) ──
const spriteCache: Record<string, string> = {};
function sprite(h: AdventureHero): string {
  const key = `${h.element}:${h.rarity}:${h.seed}`;
  if (spriteCache[key]) return spriteCache[key];
  const t = generateHeroTraits(h.seed, h.element);
  const traits = { ...t, rarity: h.rarity, hasAura: h.rarity !== 'common', eyeGlow: h.rarity === 'epic' || h.rarity === 'legendary' || t.eyeGlow };
  const url = heroToDataURL(traits, 3);
  spriteCache[key] = url;
  return url;
}

interface Toast { id: string; text: string; kind: GameEvent['kind']; amount?: number }

export default function AdventuresPage() {
  const [state, setState] = useState<AdventuresState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastEventId = useRef<string | null>(null);
  const { heroes: chainHeroes, isLoading: chainLoading, isConnected } = useChainAdventureHeroes();

  useEffect(() => { setState(settle(loadState(), Date.now())); }, []);
  // P1-lite: merge the wallet's real NFT heroes into the roster (add-only — staked positions stay valid)
  useEffect(() => {
    if (chainHeroes.length === 0) return;
    setState((prev) => (prev ? mergeChainHeroes(prev, chainHeroes) : prev));
  }, [chainHeroes]);
  useEffect(() => { if (state) saveState(state); }, [state]);
  useEffect(() => {
    const iv = setInterval(() => setState((prev) => (prev ? settle(prev, Date.now()) : prev)), 1000);
    return () => clearInterval(iv);
  }, []);

  // surface new events as toasts
  useEffect(() => {
    if (!state?.events.length) return;
    if (lastEventId.current === null) { lastEventId.current = state.events[0].id; return; }
    const fresh: GameEvent[] = [];
    for (const e of state.events) { if (e.id === lastEventId.current) break; fresh.push(e); }
    if (fresh.length) {
      lastEventId.current = state.events[0].id;
      const add = fresh.slice(0, 4).map((e) => ({ id: e.id, text: e.text, kind: e.kind, amount: e.amount }));
      setToasts((t) => [...add.reverse(), ...t].slice(0, 5));
      add.forEach((ts) => setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== ts.id)), 3600));
    }
  }, [state?.events]);

  const totalRate = useMemo(() => (state ? totalRatePerSec(state) : 0), [state]);

  if (!state) {
    return <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#556677' }}>Loading the frozen wilds…</span>
    </div>;
  }
  const now = () => Date.now();
  const rCost = recruitCost(state.recruited);

  return (
    <div style={page}>
      {/* Toasts */}
      <div style={toastWrap}>
        {toasts.map((t) => (
          <div key={t.id} style={{ ...toastStyle, borderColor: t.kind === 'rare-find' ? '#ffaa00' : 'rgba(0,229,255,0.3)' }}>
            <span style={{ fontSize: 16 }}>{EVENT_ICON[t.kind]}</span>
            <span>{t.text}{t.amount ? ` · ${t.kind === 'level' || t.kind === 'recruit' ? '−' : '+'}❄${fmt(t.amount)}` : ''}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#00e5ff', fontFamily: '"Press Start 2P", monospace' }}>ADVENTURES</span>
          <span style={{ fontSize: 12, color: '#556677' }}>Frostbite · idle staking</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8fe3ff' }}>❄ {fmt(state.shards)}</div>
            <div style={{ fontSize: 11, color: '#556677' }}>Frost Shards{totalRate > 0 ? ` · +${totalRate.toFixed(1)}/s` : ''}</div>
          </div>
          <button style={btnGhost} onClick={() => setState(claimAll(state, now()))}>Claim All</button>
          <Link href="/world" style={{ ...btnGhost, textDecoration: 'none' }}>← World</Link>
        </div>
      </header>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#5a6b7a', padding: '8px 16px 0' }}>
        P0 demo — Frost Shards are off-chain and have no monetary value. Progress + discoveries accrue even while away.
      </div>

      <div style={mainRow}>
        {/* LEFT: roster + zones */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Roster */}
          <section style={{ padding: '16px 24px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={sectionTitle}>Your Frostlings {selected && <span style={{ color: '#00e5ff', fontSize: 12 }}>· pick a biome for {heroById(state, selected)?.name}</span>}</h2>
              <span style={{ fontSize: 11, color: isConnected ? '#44cc88' : '#5a6b7a' }}>
                {isConnected
                  ? chainLoading
                    ? '⛓ scanning wallet…'
                    : chainHeroes.length > 0
                      ? `⛓ ${chainHeroes.length} on-chain hero${chainHeroes.length > 1 ? 'es' : ''} loaded`
                      : '⛓ no hero NFTs in this wallet'
                  : '⛓ connect in World to bring your NFT heroes'}
              </span>
              <button
                style={{ ...btnGhost, opacity: state.shards >= rCost ? 1 : 0.45, cursor: state.shards >= rCost ? 'pointer' : 'not-allowed' }}
                disabled={state.shards < rCost}
                onClick={() => setState(recruit(state, now()))}
                title="Spend Frost Shards to recruit a new random Frostling"
              >✨ Recruit ❄{fmt(rCost)}</button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {state.roster.map((h) => {
                const pos = positionOf(state, h.id);
                const cost = costToNextLevel(h.level);
                const canLevel = state.shards >= cost;
                const isSel = selected === h.id;
                return (
                  <div key={h.id} onClick={() => { if (!pos) setSelected(isSel ? null : h.id); }}
                    style={{ ...heroCard, cursor: pos ? 'default' : 'pointer', borderColor: isSel ? '#00e5ff' : pos ? 'rgba(68,204,136,0.35)' : 'rgba(255,255,255,0.08)', boxShadow: isSel ? '0 0 0 1px #00e5ff' : 'none' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <img src={sprite(h)} alt={h.name} width={44} height={44} style={{ imageRendering: 'pixelated', borderRadius: 8, border: `1px solid ${RARITY_COLORS[h.rarity]}`, background: 'rgba(0,0,0,0.25)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#e6ecf5', fontSize: 14 }}>{h.name}</span>
                          <span style={{ display: 'flex', gap: 4 }}>
                            {/^\d+$/.test(h.id) && <span style={{ ...chip, background: '#0077cc' }}>NFT</span>}
                            <span style={{ ...chip, background: RARITY_COLORS[h.rarity] }}>{h.rarity}</span>
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8a99a8', marginTop: 2 }}>Lv {h.level} · {ELEMENT_ICONS[h.element]} {ELEMENT_LABELS[h.element]}</div>
                        <div style={{ fontSize: 11, color: '#66788a' }}>ATK {h.atk} · DEF {h.def} · SPD {h.spd}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: pos ? '#44cc88' : '#66788a' }}>{pos ? `⛏ ${ZONES.find((z) => z.id === pos.zoneId)?.name}` : 'Idle'}</span>
                      <button style={{ ...btnMini, opacity: canLevel ? 1 : 0.4, cursor: canLevel ? 'pointer' : 'not-allowed' }} disabled={!canLevel}
                        onClick={(e) => { e.stopPropagation(); setState(levelUpHero(state, now(), h.id)); }} title={`Burn ${cost} Frost Shards → Lv ${h.level + 1}`}>Lv↑ ❄{cost}</button>
                    </div>
                  </div>
                );
              })}
            </div>
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
                const selFavored = selHero && affinityMult(z, selHero) > 1;
                return (
                  <div key={z.id} style={{ ...zoneCard, borderColor: canSend ? '#00e5ff' : 'rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ ...chip, background: TIER_COLORS[z.tier], marginRight: 6 }}>T{z.tier}</span>
                        <span style={{ fontWeight: 800, color: '#e6ecf5', fontSize: 16 }}>{z.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#66788a' }}>❄ {z.ratePerMin}/min</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8a99a8', margin: '6px 0 4px' }}>{z.blurb}</div>
                    <div style={{ fontSize: 11, color: '#5a6b7a' }}>
                      Gate: Lv {z.gate.minLevel}{Object.entries(z.gate.minStats).map(([k, v]) => ` · ${k}≥${v}`).join('')} · rewards {z.primaryStats.join('+')}
                    </div>
                    <div style={{ fontSize: 11, color: '#7fd0ff', marginTop: 3 }}>
                      {ELEMENT_ICONS[z.favoredElement]} Favors {ELEMENT_LABELS[z.favoredElement]} · +{Math.round((AFFINITY_MULT - 1) * 100)}% share
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {staked.map((p) => {
                        const h = heroById(state, p.heroId)!;
                        const cap = emissionCap(h.level);
                        const pct = Math.min(100, (p.accrued / cap) * 100);
                        const capped = isCapped(state, p);
                        const rate = ratePerSec(state, h.id);
                        const fav = affinityMult(z, h) > 1;
                        return (
                          <div key={p.heroId} style={stakeRow}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                              <span style={{ color: '#cdd7e2', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <img src={sprite(h)} alt="" width={20} height={20} style={{ imageRendering: 'pixelated', borderRadius: 4 }} />
                                {h.name} <span style={{ color: '#66788a' }}>Lv{h.level}</span>{fav && <span title="elemental affinity" style={{ color: '#7fd0ff' }}>⚡</span>}
                              </span>
                              <span style={{ color: capped ? '#ffaa00' : '#8fe3ff' }}>❄ {fmt(p.accrued)}/{fmt(cap)} {capped ? '· FULL' : `· +${rate.toFixed(1)}/s`}</span>
                            </div>
                            <div style={barTrack}><div style={{ ...barFill, width: `${pct}%`, background: capped ? '#ffaa00' : 'linear-gradient(90deg,#0093c4,#00e5ff)' }} /></div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <button style={btnMini} onClick={() => setState(unstakeHero(state, now(), h.id))}>Recall</button>
                              {capped && <button style={{ ...btnMini, opacity: state.shards + Math.floor(p.accrued) >= costToNextLevel(h.level) ? 1 : 0.4 }}
                                onClick={() => setState(levelUpHero(claimZone(state, now(), z.id), now(), h.id))} title="Claim & level up">Claim+Lv↑</button>}
                            </div>
                          </div>
                        );
                      })}
                      {staked.length === 0 && <div style={{ fontSize: 11, color: '#556677' }}>No Frostlings here yet.</div>}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {canSend && <button style={{ ...btnPrimary, flex: 1 }} onClick={() => { setState(stakeHero(state, now(), selected!, z.id)); setSelected(null); }}>⛏ Send {selHero!.name}{selFavored ? ' ⚡' : ''}</button>}
                      {selHero && !canSend && !positionOf(state, selHero.id) && <div style={{ fontSize: 11, color: '#c98', flex: 1, alignSelf: 'center' }}>🔒 {gate?.reason}</div>}
                      {zoneAccrued >= 1 && <button style={btnGhost} onClick={() => setState(claimZone(state, now(), z.id))}>Claim ❄{fmt(zoneAccrued)}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT: activity feed (div, not <aside> — world layout hides aside/footer) */}
        <div style={feedPanel}>
          <h2 style={{ ...sectionTitle, marginBottom: 8 }}>❄ Frostlog</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.events.length === 0 && <div style={{ fontSize: 12, color: '#556677' }}>Stake a Frostling to begin. Discoveries appear here.</div>}
            {state.events.slice(0, 14).map((e) => (
              <div key={e.id} style={feedRow}>
                <span style={{ fontSize: 14 }}>{EVENT_ICON[e.kind]}</span>
                <span style={{ flex: 1, fontSize: 12, color: '#b8c4d2' }}>{e.text}</span>
                {e.amount ? <span style={{ fontSize: 12, fontWeight: 700, color: e.kind === 'level' || e.kind === 'recruit' ? '#ffaa66' : '#8fe3ff' }}>{e.kind === 'level' || e.kind === 'recruit' ? '−' : '+'}❄{fmt(e.amount)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer stats (div, not <footer> — world layout hides footer) */}
      <div style={footer}>
        <FooterStat label="Lifetime Claimed" value={`❄ ${fmt(state.totalClaimed)}`} />
        <FooterStat label="Idle Discoveries" value={`🔎 ${fmt(state.foundShards)}`} />
        <FooterStat label="Shards Burned (sink)" value={`🔥 ${fmt(state.totalBurned)}`} />
        <FooterStat label="Active Stakes" value={`${state.positions.length} / ${state.roster.length}`} />
        <button style={{ ...btnGhost, alignSelf: 'center' }} onClick={() => { if (confirm('Reset the Adventures demo? Clears local progress only.')) { setState(createInitialState()); setSelected(null); lastEventId.current = null; } }}>Reset demo</button>
      </div>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 800, color: '#e6ecf5' }}>{value}</div><div style={{ fontSize: 11, color: '#556677' }}>{label}</div></div>;
}

// ── styles ──
const page: React.CSSProperties = { minHeight: '100vh', background: 'linear-gradient(180deg,#050810 0%,#0a0e1a 30%,#0f1525 100%)', color: '#e0e4ee', fontFamily: 'Inter, Arial, sans-serif', overflowY: 'auto', overflowX: 'hidden' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(0,229,255,0.1)', flexWrap: 'wrap', gap: 12 };
const mainRow: React.CSSProperties = { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', padding: '0 0 0 0' };
const sectionTitle: React.CSSProperties = { fontSize: 13, color: '#66788a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 };
const heroCard: React.CSSProperties = { width: 240, background: 'rgba(20,26,40,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, transition: 'all 0.15s' };
const zoneCard: React.CSSProperties = { background: 'rgba(16,22,36,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, transition: 'all 0.15s' };
const stakeRow: React.CSSProperties = { background: 'rgba(10,14,26,0.7)', borderRadius: 8, padding: 8, border: '1px solid rgba(255,255,255,0.04)' };
const barTrack: React.CSSProperties = { height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', marginTop: 5, overflow: 'hidden' };
const barFill: React.CSSProperties = { height: '100%', borderRadius: 3, transition: 'width 0.5s linear' };
const chip: React.CSSProperties = { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase' };
const btnPrimary: React.CSSProperties = { padding: '9px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#00aacc,#0077aa)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '9px 14px', borderRadius: 8, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnMini: React.CSSProperties = { padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b8c4d2', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const feedPanel: React.CSSProperties = { width: 300, flexShrink: 0, background: 'rgba(12,16,28,0.6)', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px', minHeight: 400, position: 'sticky', top: 0 };
const feedRow: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(20,26,40,0.5)', borderRadius: 6, padding: '6px 8px' };
const footer: React.CSSProperties = { display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 20, padding: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 12 };
const toastWrap: React.CSSProperties = { position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' };
const toastStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(12,18,32,0.96)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 10, padding: '8px 14px', fontSize: 12, color: '#e6ecf5', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' };
