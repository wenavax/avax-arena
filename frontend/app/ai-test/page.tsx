'use client';

import { useState } from 'react';
import { Zap, Shield, Swords, Wind, Heart, Sparkles, RotateCcw, FlaskConical } from 'lucide-react';

const ELEMENTS = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
const ELEMENT_EMOJI: Record<string, string> = {
  Fire: '🔥', Water: '💧', Wind: '🌪️', Ice: '❄️',
  Earth: '🌍', Thunder: '⚡', Shadow: '🌑', Light: '✨',
};
const ELEMENT_COLOR: Record<string, string> = {
  Fire: 'text-red-400 border-red-500/30 bg-red-500/10',
  Water: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  Wind: 'text-green-400 border-green-500/30 bg-green-500/10',
  Ice: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  Earth: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Thunder: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  Shadow: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  Light: 'text-orange-300 border-orange-400/30 bg-orange-400/10',
};
const TYPE_EMOJI: Record<string, string> = {
  undead: '💀', beast: '🐺', elemental: '🌀', humanoid: '⚔️', demon: '👿', construct: '🤖',
};

export default function AITestPage() {
  const [level, setLevel] = useState(10);
  const [element, setElement] = useState('');
  const [enemy, setEnemy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ level: level.toString() });
      if (element) params.set('element', element);
      const res = await fetch(`/avalanche/api/v1/ai-enemy?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEnemy(data);
      setHistory(prev => [data, ...prev].slice(0, 10));
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const ec = enemy ? (ELEMENT_COLOR[enemy.element] || 'text-white/60 border-white/10 bg-white/5') : '';

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-frost-red/10 border border-frost-red/20">
          <FlaskConical className="w-5 h-5 text-frost-red" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white flex items-center gap-2">
            AI Enemy Generator
            <span className="px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-mono uppercase tracking-wider">Testing</span>
          </h1>
          <p className="text-xs text-white/40">Powered by Claude Sonnet 4.6 — generates unique enemies in real-time</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div>
          <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Level</label>
          <input
            type="range" min="1" max="100" value={level}
            onChange={(e) => setLevel(parseInt(e.target.value))}
            className="w-32 h-1.5 appearance-none bg-white/10 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-frost-red"
          />
          <span className="ml-2 text-sm font-mono text-white/60">{level}</span>
        </div>

        <div>
          <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Player Element</label>
          <select
            value={element} onChange={(e) => setElement(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white/70 focus:outline-none focus:border-frost-red/40"
          >
            <option value="">Random</option>
            {ELEMENTS.map(el => <option key={el} value={el}>{ELEMENT_EMOJI[el]} {el}</option>)}
          </select>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="px-6 py-2 rounded-xl bg-frost-red/20 border border-frost-red/30 text-frost-red font-semibold text-sm hover:bg-frost-red/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <><RotateCcw className="w-4 h-4 animate-spin" /> Generating...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Enemy</>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Enemy Card */}
      {enemy && (
        <div className={`rounded-2xl border ${ec.split(' ').slice(1).join(' ')} p-6 mb-6`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{TYPE_EMOJI[enemy.type] || '👾'}</span>
                <h2 className="text-xl font-bold text-white">{enemy.name}</h2>
              </div>
              <p className="text-sm text-white/40 italic">{enemy.title}</p>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg ${ec}`}>
                <span>{ELEMENT_EMOJI[enemy.element]}</span>
                <span className="text-sm font-semibold">{enemy.element}</span>
              </div>
              <div className="text-xs text-white/30 mt-1">Lv.{enemy.level} {enemy.type}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3 mb-5">
            {[
              { icon: Heart, label: 'HP', value: enemy.hp, color: 'text-green-400' },
              { icon: Swords, label: 'ATK', value: enemy.attack, color: 'text-red-400' },
              { icon: Shield, label: 'DEF', value: enemy.defense, color: 'text-blue-400' },
              { icon: Wind, label: 'SPD', value: enemy.speed, color: 'text-yellow-400' },
              { icon: Zap, label: 'PWR', value: enemy.powerScore, color: 'text-purple-400' },
            ].map(stat => (
              <div key={stat.label} className="text-center p-2 rounded-lg bg-white/[0.03]">
                <stat.icon className={`w-4 h-4 mx-auto mb-1 ${stat.color}`} />
                <div className="text-lg font-bold font-mono text-white">{stat.value}</div>
                <div className="text-[10px] text-white/30 uppercase">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="mb-5">
            <h3 className="text-xs text-white/40 uppercase tracking-wider mb-2">Skills</h3>
            <div className="grid grid-cols-2 gap-2">
              {enemy.skills?.map((skill: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white/80">
                      {ELEMENT_EMOJI[skill.element] || '⚡'} {skill.name}
                    </span>
                    <span className="text-xs font-mono text-white/40">{skill.multiplier}x</span>
                  </div>
                  <p className="text-[11px] text-white/30 leading-relaxed">{skill.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lore & Dialogue */}
          <div className="space-y-3 mb-4">
            <div className="p-3 rounded-lg bg-white/[0.02]">
              <div className="text-[10px] text-white/30 uppercase mb-1">Lore</div>
              <p className="text-sm text-white/50 italic">{enemy.lore}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-white/[0.02]">
                <div className="text-[10px] text-white/30 uppercase mb-1">Entrance</div>
                <p className="text-sm text-white/50">&ldquo;{enemy.entranceDialogue}&rdquo;</p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02]">
                <div className="text-[10px] text-white/30 uppercase mb-1">Defeat</div>
                <p className="text-sm text-white/50">&ldquo;{enemy.defeatDialogue}&rdquo;</p>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between text-[10px] text-white/20 pt-3 border-t border-white/[0.04]">
            <span>Generated by {enemy.generatedBy}</span>
            <span>{new Date(enemy.generatedAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div>
          <h3 className="text-xs text-white/30 uppercase tracking-wider mb-3">Recent Generations</h3>
          <div className="space-y-2">
            {history.slice(1).map((e, i) => (
              <button
                key={i}
                onClick={() => setEnemy(e)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] transition text-left"
              >
                <span className="text-lg">{TYPE_EMOJI[e.type] || '👾'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white/60 truncate">{e.name}</div>
                  <div className="text-[10px] text-white/30">Lv.{e.level} {ELEMENT_EMOJI[e.element]} {e.element} {e.type}</div>
                </div>
                <div className="text-xs font-mono text-white/20">PWR {e.powerScore}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
