'use client';

// Frostbite Expeditions — Phase 0 playable prototype (off-chain, no contracts).
// Deterministic engine: lib/game/expeditions/*. Demo squad; FSB/entry simulated.
import { useState, useCallback } from 'react';
import { Swords, Shield, Zap, Sparkles, Skull, Coins, ArrowDown, Heart, LogOut } from 'lucide-react';
import { ELEMENT_ICONS } from '@/lib/game/elements';
import type { ExpeditionWarrior, RunState, CombatResult, Relic, Rarity } from '@/lib/game/expeditions/types';
import { startRun, descend, takeRelic, healAndAdvance, extract } from '@/lib/game/expeditions/run';

const DEMO_SQUAD: ExpeditionWarrior[] = [
  { tokenId: 101, attack: 74, defense: 42, speed: 58, element: 'fire', specialPower: 66, level: 9 },
  { tokenId: 102, attack: 51, defense: 68, speed: 40, element: 'ice', specialPower: 34, level: 7 },
  { tokenId: 103, attack: 63, defense: 33, speed: 72, element: 'thunder', specialPower: 82, level: 8 },
];

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'text-white/60', uncommon: 'text-emerald-400', rare: 'text-sky-400',
  epic: 'text-fuchsia-400', legendary: 'text-amber-400',
};
const RARITY_BORDER: Record<Rarity, string> = {
  common: 'border-white/10', uncommon: 'border-emerald-500/40', rare: 'border-sky-500/40',
  epic: 'border-fuchsia-500/40', legendary: 'border-amber-500/50',
};

function HpBar({ hp, max, tone }: { hp: number; max: number; tone: 'squad' | 'boss' }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className="w-full h-3 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${tone === 'squad' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-frost-primary to-rose-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ExpeditionsPage() {
  const [run, setRun] = useState<RunState | null>(null);
  const [result, setResult] = useState<CombatResult | null>(null);

  const begin = useCallback(() => {
    const seed = `exp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    setResult(null);
    setRun(startRun({ seed, warriors: DEMO_SQUAD }));
  }, []);

  const onDescend = useCallback(() => {
    if (!run) return;
    const r = descend(run);
    setResult(r);
    setRun({ ...run });
  }, [run]);

  const onTakeRelic = useCallback((id: string) => {
    if (!run) return;
    takeRelic(run, id);
    setRun({ ...run });
  }, [run]);

  const onHeal = useCallback(() => { if (!run) return; healAndAdvance(run); setRun({ ...run }); }, [run]);
  const onExtract = useCallback(() => { if (!run) return; extract(run); setRun({ ...run }); }, [run]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="font-stamp uppercase text-5xl sm:text-7xl tracking-tight leading-[0.9] text-white">
          FROSTBITE <span className="text-frost-primary">EXPEDITIONS</span>
        </h1>
        <p className="mt-2 text-white/45 text-sm">Descend an idle on-chain roguelike gauntlet · <span className="text-white/30">Phase 0 · token-free core</span></p>
      </div>

      {/* START */}
      {!run && (
        <div className="glass-card p-6 sm:p-8">
          <h2 className="font-display font-bold text-white text-lg mb-4">Your Squad</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {DEMO_SQUAD.map((w) => (
              <div key={w.tokenId} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-white/50">#{w.tokenId}</span>
                  <span className="text-lg" title={w.element}>{ELEMENT_ICONS[w.element]}</span>
                </div>
                <div className="space-y-1 text-[11px] font-mono text-white/50">
                  <div className="flex justify-between"><span><Swords className="inline h-3 w-3" /> ATK</span><span className="text-white/80">{w.attack}</span></div>
                  <div className="flex justify-between"><span><Shield className="inline h-3 w-3" /> DEF</span><span className="text-white/80">{w.defense}</span></div>
                  <div className="flex justify-between"><span><Zap className="inline h-3 w-3" /> SPD</span><span className="text-white/80">{w.speed}</span></div>
                  <div className="flex justify-between"><span><Sparkles className="inline h-3 w-3" /> SPC</span><span className="text-white/80">{w.specialPower}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/[0.06] text-[10px] text-white/40">Lv.{w.level}</div>
              </div>
            ))}
          </div>
          <button onClick={begin} className="btn-3d btn-3d-red w-full py-4 text-base">
            <ArrowDown className="h-5 w-5" /> Begin Expedition
          </button>
        </div>
      )}

      {/* ACTIVE / CHOOSING */}
      {run && (run.status === 'active' || run.status === 'choosing') && (
        <div className="space-y-4">
          {/* Floor + squad status */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-stamp uppercase text-2xl text-white">Floor {run.floor}<span className="text-white/30 text-sm">/{run.maxFloors}</span></span>
              <span className="inline-flex items-center gap-1.5 text-frost-gold font-mono text-sm"><Coins className="h-4 w-4" /> {run.reward} {run.rewardLabel}</span>
            </div>
            <div className="flex items-center gap-2 mb-1 text-[11px] text-white/50">
              <span>Squad HP</span><span className="font-mono text-white/80">{run.squad.hp}/{run.squad.maxHp}</span>
              {run.squad.survivalCharges > 0 && <span className="text-sky-400">· {run.squad.survivalCharges} ward</span>}
            </div>
            <HpBar hp={run.squad.hp} max={run.squad.maxHp} tone="squad" />
            {run.squad.relics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {run.squad.relics.map((r, i) => (
                  <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${RARITY_BORDER[r.rarity]} ${RARITY_TEXT[r.rarity]}`}>{r.name}</span>
                ))}
              </div>
            )}
          </div>

          {/* Boss */}
          {run.boss && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-display font-bold text-white flex items-center gap-2">
                    {ELEMENT_ICONS[run.boss.element]} {run.boss.name} <span className="text-white/40 font-normal text-sm">{run.boss.title}</span>
                    {run.boss.isElite && <span className="text-[9px] px-1.5 py-0.5 rounded bg-frost-primary/20 text-frost-primary uppercase tracking-wider">Elite</span>}
                  </div>
                  <p className="text-white/35 text-xs italic mt-0.5">&ldquo;{run.boss.entranceDialogue}&rdquo;</p>
                </div>
                <span className="font-mono text-xs text-white/40">Lv.{run.boss.level}</span>
              </div>
              <div className="text-[11px] text-white/50 mb-1 font-mono">HP {run.boss.hp}/{run.boss.maxHp} · ATK {run.boss.atk} · DEF {run.boss.def}</div>
              <HpBar hp={run.status === 'active' ? run.boss.hp : (result?.won ? 0 : run.boss.hp)} max={run.boss.maxHp} tone="boss" />
            </div>
          )}

          {/* Combat result summary */}
          {result && run.status === 'choosing' && (
            <div className="glass-card p-4 text-center">
              <p className="text-emerald-400 font-display font-bold">Floor cleared in {result.rounds} rounds</p>
              <p className="text-white/40 text-xs mt-0.5">dealt {result.damageDealt} · took {result.damageTaken}</p>
            </div>
          )}

          {/* ACTIONS */}
          {run.status === 'active' && (
            <button onClick={onDescend} className="btn-3d btn-3d-red w-full py-4 text-base">
              <Swords className="h-5 w-5" /> Descend — Fight {run.boss?.name}
            </button>
          )}

          {run.status === 'choosing' && (
            <div className="space-y-3">
              <p className="text-center text-white/50 text-xs uppercase tracking-wider">Draft a relic, rest, or extract</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {run.offeredRelics.map((r) => (
                  <button key={r.id} onClick={() => onTakeRelic(r.id)}
                    className={`text-left rounded-xl border ${RARITY_BORDER[r.rarity]} bg-white/[0.02] hover:bg-white/[0.05] p-4 transition-colors`}>
                    <div className={`text-sm font-bold ${RARITY_TEXT[r.rarity]}`}>{r.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{r.rarity}</div>
                    <div className="text-xs text-white/55 leading-snug">{r.description}</div>
                    <div className="mt-2 text-[10px] text-white/30 font-mono">Draft — free pick</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={onHeal} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 py-3 text-sm font-semibold transition-colors">
                  <Heart className="h-4 w-4" /> Rest (+30% HP)
                </button>
                <button onClick={onExtract} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-frost-gold/40 bg-frost-gold/10 text-frost-gold hover:bg-frost-gold/20 py-3 text-sm font-semibold transition-colors">
                  <LogOut className="h-4 w-4" /> Extract ({run.reward} {run.rewardLabel})
                </button>
              </div>
            </div>
          )}

          <LogPanel log={run.log} />
        </div>
      )}

      {/* END */}
      {run && (run.status === 'extracted' || run.status === 'dead') && (
        <div className="space-y-4">
          <div className={`glass-card p-8 text-center border ${run.status === 'extracted' ? 'border-frost-gold/30' : 'border-frost-primary/30'}`}>
            {run.status === 'extracted' ? (
              <>
                <Coins className="h-12 w-12 mx-auto text-frost-gold mb-3" />
                <h2 className="font-stamp uppercase text-4xl text-white">Extracted</h2>
                <p className="text-white/50 mt-1">Reached <span className="text-white font-bold">Floor {run.floor}</span> · banked <span className="text-frost-gold font-bold">{run.reward} {run.rewardLabel}</span></p>
              </>
            ) : (
              <>
                <Skull className="h-12 w-12 mx-auto text-frost-primary mb-3" />
                <h2 className="font-stamp uppercase text-4xl text-white">Frostbitten</h2>
                <p className="text-white/50 mt-1">Fell on <span className="text-white font-bold">Floor {run.floor}</span> · reward lost · depth recorded to the ladder</p>
              </>
            )}
          </div>
          <LogPanel log={run.log} />
          <button onClick={begin} className="btn-3d btn-3d-red w-full py-4 text-base">
            <ArrowDown className="h-5 w-5" /> New Expedition
          </button>
        </div>
      )}
    </div>
  );
}

function LogPanel({ log }: { log: string[] }) {
  return (
    <div className="glass-card p-4 max-h-52 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Expedition Log</div>
      <div className="space-y-1">
        {[...log].reverse().map((line, i) => (
          <p key={i} className={`text-xs leading-snug ${i === 0 ? 'text-white/75' : 'text-white/40'}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}
