'use client';

import { useState, useEffect, useRef } from 'react';
import { Swords, Shield, Wind, Heart, Zap, RotateCcw, FlaskConical, Sparkles } from 'lucide-react';

// Kenney 1-bit pack: 16x16 tiles, 1px spacing, 49 cols × 22 rows
const TILE = 16;
const GAP = 1;
const COLS = 49;
const SPRITE_SHEET = '/avalanche/sprites/kenney-1bit.png';

// Sprite positions (col, row) from the tilesheet
const SPRITES = {
  // Warriors
  knight:    { col: 42, row: 0 },
  mage:      { col: 43, row: 0 },
  archer:    { col: 44, row: 0 },
  king:      { col: 45, row: 0 },
  warrior2:  { col: 42, row: 1 },
  viking:    { col: 43, row: 1 },
  // Monsters
  skeleton:  { col: 42, row: 2 },
  ghost:     { col: 43, row: 2 },
  demon:     { col: 44, row: 2 },
  spider:    { col: 45, row: 2 },
  bat:       { col: 46, row: 2 },
  slime:     { col: 42, row: 3 },
  dragon:    { col: 43, row: 3 },
  ogre:      { col: 44, row: 3 },
  // Items
  sword:     { col: 46, row: 0 },
  shield:    { col: 47, row: 0 },
  potion:    { col: 46, row: 1 },
  heart:     { col: 36, row: 14 },
  // Effects
  skull:     { col: 44, row: 1 },
  star:      { col: 38, row: 14 },
};

const MONSTER_SPRITES = ['skeleton', 'ghost', 'demon', 'spider', 'bat', 'slime', 'dragon', 'ogre'];
const WARRIOR_SPRITES = ['knight', 'mage', 'archer', 'king', 'warrior2', 'viking'];

const ELEMENT_COLOR: Record<string, string> = {
  Fire: '#e84142', Water: '#3b82f6', Wind: '#22c55e', Ice: '#06b6d4',
  Earth: '#d97706', Thunder: '#eab308', Shadow: '#8b5cf6', Light: '#f59e0b',
};

function SpriteIcon({ name, scale = 4 }: { name: string; scale?: number }) {
  const sprite = SPRITES[name as keyof typeof SPRITES];
  if (!sprite) return null;
  const x = sprite.col * (TILE + GAP);
  const y = sprite.row * (TILE + GAP);
  return (
    <div
      style={{
        width: TILE * scale,
        height: TILE * scale,
        backgroundImage: `url(${SPRITE_SHEET})`,
        backgroundPosition: `-${x * scale}px -${y * scale}px`,
        backgroundSize: `${(COLS * (TILE + GAP)) * scale}px auto`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

// ─── SFX System ─────────────────────────────────────────────
const SFX = {
  slash:     ['/avalanche/sfx/slash1.ogg', '/avalanche/sfx/slash2.ogg'],
  slice:     ['/avalanche/sfx/slice1.ogg', '/avalanche/sfx/slice2.ogg'],
  hitHeavy:  ['/avalanche/sfx/hit-heavy1.ogg', '/avalanche/sfx/hit-heavy2.ogg'],
  hitLight:  ['/avalanche/sfx/hit-light1.ogg', '/avalanche/sfx/hit-light2.ogg'],
  hitMedium: ['/avalanche/sfx/hit-medium1.ogg'],
  coins:     ['/avalanche/sfx/coins.ogg'],
  uiClick:   ['/avalanche/sfx/ui-click.ogg'],
  chop:      ['/avalanche/sfx/chop.ogg'],
};

function playSfx(category: keyof typeof SFX, volume = 0.4) {
  const files = SFX[category];
  const src = files[Math.floor(Math.random() * files.length)];
  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {});
}

interface BattleTurn {
  attacker: 'player' | 'enemy';
  damage: number;
  isCrit: boolean;
  skill?: string;
  playerHp: number;
  enemyHp: number;
  message: string;
}

function simulateBattle(player: any, enemy: any): BattleTurn[] {
  const turns: BattleTurn[] = [];
  let pHp = player.hp;
  let eHp = enemy.hp;
  const pFirst = player.speed >= enemy.speed;

  for (let round = 0; round < 20 && pHp > 0 && eHp > 0; round++) {
    const attackers = pFirst
      ? [{ side: 'player' as const }, { side: 'enemy' as const }]
      : [{ side: 'enemy' as const }, { side: 'player' as const }];

    for (const { side } of attackers) {
      if (pHp <= 0 || eHp <= 0) break;

      const isCrit = Math.random() < 0.15;
      const critMult = isCrit ? 1.5 : 1;
      const variance = 0.85 + Math.random() * 0.3;

      if (side === 'player') {
        const dmg = Math.max(1, Math.floor((player.attack * critMult - enemy.defense * 0.4) * variance));
        eHp = Math.max(0, eHp - dmg);
        turns.push({
          attacker: 'player', damage: dmg, isCrit,
          playerHp: pHp, enemyHp: eHp,
          message: `Your warrior strikes for ${dmg}${isCrit ? ' CRIT!' : ''} damage`,
        });
      } else {
        const skill = enemy.skills?.[Math.floor(Math.random() * (enemy.skills?.length || 1))];
        const mult = skill?.multiplier || 1;
        const dmg = Math.max(1, Math.floor((enemy.attack * mult * critMult - player.defense * 0.4) * variance));
        pHp = Math.max(0, pHp - dmg);
        turns.push({
          attacker: 'enemy', damage: dmg, isCrit, skill: skill?.name,
          playerHp: pHp, enemyHp: eHp,
          message: `${enemy.name} uses ${skill?.name || 'Attack'} for ${dmg}${isCrit ? ' CRIT!' : ''}`,
        });
      }
    }
  }
  return turns;
}

export default function PvETestPage() {
  const [warrior, setWarrior] = useState({ hp: 200, attack: 45, defense: 30, speed: 25, element: 'Ice', powerScore: 850, sprite: 'knight' });
  const [enemy, setEnemy] = useState<any>(null);
  const [turns, setTurns] = useState<BattleTurn[]>([]);
  const [currentTurn, setCurrentTurn] = useState(-1);
  const [phase, setPhase] = useState<'setup' | 'generating' | 'battle' | 'result'>('setup');
  const [difficulty, setDifficulty] = useState<'ember' | 'storm' | 'abyss'>('storm');
  const timerRef = useRef<any>(null);

  const diffConfig = {
    ember:  { label: 'Ember',  mult: 0.75, color: '#f59e0b', entry: '0.02' },
    storm:  { label: 'Storm',  mult: 1.0,  color: '#3b82f6', entry: '0.05' },
    abyss:  { label: 'Abyss',  mult: 1.3,  color: '#8b5cf6', entry: '0.10' },
  };

  const generateBoss = async () => {
    playSfx('uiClick');
    setPhase('generating');
    try {
      const res = await fetch(`/avalanche/api/v1/ai-enemy?level=${Math.floor(warrior.powerScore / 20)}&element=${warrior.element}`);
      const boss = await res.json();
      if (boss.error) throw new Error(boss.error);

      const mult = diffConfig[difficulty].mult;
      boss.hp = Math.floor(boss.hp * mult);
      boss.attack = Math.floor(boss.attack * mult);
      boss.defense = Math.floor(boss.defense * mult);
      boss.sprite = MONSTER_SPRITES[Math.floor(Math.random() * MONSTER_SPRITES.length)];

      setEnemy(boss);
      const battleTurns = simulateBattle(warrior, boss);
      setTurns(battleTurns);
      setCurrentTurn(-1);
      setPhase('battle');

      // Auto-play turns with SFX
      let i = 0;
      timerRef.current = setInterval(() => {
        if (i >= battleTurns.length) {
          clearInterval(timerRef.current);
          const finalWon = battleTurns[battleTurns.length - 1]?.playerHp > 0;
          playSfx(finalWon ? 'coins' : 'hitHeavy', 0.5);
          setPhase('result');
          return;
        }
        const turn = battleTurns[i];
        if (turn.isCrit) {
          playSfx('hitHeavy', 0.5);
        } else if (turn.attacker === 'player') {
          playSfx('slash', 0.4);
        } else {
          playSfx('hitLight', 0.4);
        }
        setCurrentTurn(i);
        i++;
      }, 800);
    } catch (err: any) {
      alert('AI Error: ' + err.message);
      setPhase('setup');
    }
  };

  const reset = () => {
    playSfx('uiClick');
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('setup');
    setEnemy(null);
    setTurns([]);
    setCurrentTurn(-1);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const currentState = currentTurn >= 0 ? turns[currentTurn] : null;
  const playerHp = currentState?.playerHp ?? warrior.hp;
  const enemyHp = currentState?.enemyHp ?? (enemy?.hp || 100);
  const won = phase === 'result' && playerHp > 0;

  return (
    <>
    <style>{`
      @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
      @keyframes hitFlash { 0%{opacity:1} 50%{opacity:0.3} 100%{opacity:1} }
      @keyframes dmgFloat { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-30px)} }
    `}</style>
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-frost-red/10 border border-frost-red/20">
          <FlaskConical className="w-5 h-5 text-frost-red" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white flex items-center gap-2">
            Frost Trials — PvE Battle
            <span className="px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-mono uppercase tracking-wider">Testing</span>
          </h1>
          <p className="text-xs text-white/40">AI-generated bosses • Kenney 1-Bit sprites • On-chain ready</p>
        </div>
      </div>

      {/* Setup */}
      {phase === 'setup' && (
        <div className="space-y-6">
          {/* Warrior Selection */}
          <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-4">Your Warrior</div>
            <div className="flex items-center gap-6">
              <div className="flex gap-2">
                {WARRIOR_SPRITES.map(s => (
                  <button key={s} onClick={() => setWarrior(prev => ({ ...prev, sprite: s }))}
                    className={`p-1 rounded-lg border transition ${warrior.sprite === s ? 'border-frost-red bg-frost-red/10' : 'border-white/10 hover:border-white/20'}`}>
                    <SpriteIcon name={s} scale={3} />
                  </button>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-4 gap-3">
                {[
                  { icon: Heart, label: 'HP', key: 'hp', val: warrior.hp, color: 'text-green-400' },
                  { icon: Swords, label: 'ATK', key: 'attack', val: warrior.attack, color: 'text-red-400' },
                  { icon: Shield, label: 'DEF', key: 'defense', val: warrior.defense, color: 'text-blue-400' },
                  { icon: Wind, label: 'SPD', key: 'speed', val: warrior.speed, color: 'text-yellow-400' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <s.icon className={`w-3 h-3 mx-auto mb-1 ${s.color}`} />
                    <input type="number" value={s.val}
                      onChange={e => setWarrior(prev => ({ ...prev, [s.key]: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-center text-sm text-white font-mono focus:outline-none focus:border-frost-red/40" />
                    <div className="text-[9px] text-white/30 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Difficulty */}
          <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-4">Trial Difficulty</div>
            <div className="flex gap-3">
              {(['ember', 'storm', 'abyss'] as const).map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`flex-1 p-4 rounded-xl border text-center transition ${
                    difficulty === d ? 'border-white/20 bg-white/[0.04]' : 'border-white/[0.06] hover:border-white/10'
                  }`}>
                  <div className="text-lg mb-1">{d === 'ember' ? '🔥' : d === 'storm' ? '⚡' : '🌑'}</div>
                  <div className="text-sm font-bold" style={{ color: diffConfig[d].color }}>{diffConfig[d].label}</div>
                  <div className="text-[10px] text-white/30 mt-1">Boss ×{diffConfig[d].mult}</div>
                  <div className="text-[10px] text-white/30">{diffConfig[d].entry} AVAX</div>
                </button>
              ))}
            </div>
          </div>

          <button onClick={generateBoss}
            className="w-full py-3 rounded-xl bg-frost-red/20 border border-frost-red/30 text-frost-red font-bold text-sm hover:bg-frost-red/30 transition flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" /> Generate AI Boss & Fight
          </button>
        </div>
      )}

      {/* Generating */}
      {phase === 'generating' && (
        <div className="text-center py-20">
          <RotateCcw className="w-8 h-8 mx-auto mb-4 text-frost-red animate-spin" />
          <div className="text-sm text-white/40">AI is generating your boss...</div>
        </div>
      )}

      {/* Battle */}
      {(phase === 'battle' || phase === 'result') && enemy && (
        <div className="space-y-4">
          {/* Arena */}
          <div className="p-6 rounded-xl bg-black/40 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-6">
              {/* Player */}
              <div className="text-center">
                <div className={`inline-block transition-transform duration-200 ${currentState?.attacker === 'enemy' && currentTurn === turns.indexOf(currentState) ? 'animate-[shake_0.3s_ease]' : ''}`}>
                  <SpriteIcon name={warrior.sprite} scale={6} />
                </div>
                <div className="text-xs text-white/60 mt-2 font-bold">YOUR WARRIOR</div>
                <div className="w-32 h-2 bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${(playerHp / warrior.hp) * 100}%` }} />
                </div>
                <div className="text-[10px] text-white/40 mt-1 font-mono">{playerHp}/{warrior.hp}</div>
              </div>

              {/* VS */}
              <div className="text-center">
                <div className="text-2xl text-frost-red font-bold">VS</div>
                <div className="text-[10px] text-white/20 mt-1"
                  style={{ color: diffConfig[difficulty].color }}>
                  {diffConfig[difficulty].label} Trial
                </div>
              </div>

              {/* Enemy */}
              <div className="text-center">
                <div className={`inline-block transition-transform duration-200 ${currentState?.attacker === 'player' && currentTurn === turns.indexOf(currentState) ? 'animate-[shake_0.3s_ease]' : ''}`}>
                  <SpriteIcon name={enemy.sprite} scale={6} />
                </div>
                <div className="text-xs font-bold mt-2" style={{ color: ELEMENT_COLOR[enemy.element] || '#fff' }}>
                  {enemy.name}
                </div>
                <div className="text-[10px] text-white/30">Lv.{enemy.level} {enemy.element} {enemy.type}</div>
                <div className="w-32 h-2 bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-500"
                    style={{ width: `${(enemyHp / enemy.hp) * 100}%` }} />
                </div>
                <div className="text-[10px] text-white/40 mt-1 font-mono">{enemyHp}/{enemy.hp}</div>
              </div>
            </div>

            {/* Battle Log */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {turns.slice(0, currentTurn + 1).map((turn, i) => (
                <div key={i} className={`text-[11px] px-3 py-1.5 rounded border-l-2 ${
                  turn.attacker === 'player'
                    ? 'border-green-500 text-green-300/70 bg-green-500/5'
                    : 'border-red-500 text-red-300/70 bg-red-500/5'
                }`}>
                  {turn.message}
                </div>
              ))}
            </div>
          </div>

          {/* Enemy Info */}
          {enemy.skills && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Boss Skills</div>
              <div className="flex flex-wrap gap-2">
                {enemy.skills.map((s: any, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-white/50">
                    {s.name} ({s.multiplier}x)
                  </span>
                ))}
              </div>
              {enemy.lore && <p className="text-[10px] text-white/25 italic mt-2">{enemy.lore}</p>}
            </div>
          )}

          {/* Result */}
          {phase === 'result' && (
            <div className={`p-6 rounded-xl border text-center ${
              won ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
            }`}>
              <div className="text-3xl mb-2">{won ? '🏆' : '💀'}</div>
              <div className={`text-lg font-bold mb-1 ${won ? 'text-green-400' : 'text-red-400'}`}>
                {won ? 'VICTORY!' : 'DEFEATED'}
              </div>
              <div className="text-xs text-white/40 mb-4">
                {won ? `+${diffConfig[difficulty].entry} AVAX reward` : `Lost ${diffConfig[difficulty].entry} AVAX entry`}
              </div>
              <button onClick={reset}
                className="px-6 py-2 rounded-lg bg-frost-red/20 border border-frost-red/30 text-frost-red text-sm font-bold hover:bg-frost-red/30 transition">
                <RotateCcw className="w-3 h-3 inline mr-2" /> Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
