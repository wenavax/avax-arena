'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CurrentQuest, Difficulty } from '@/types/quest';
import { ZONE_ELEMENT_STYLES, DIFFICULTY_STYLES } from '@/types/quest';
import DifficultyBadge from './DifficultyBadge';
import QuestLorePanel from './QuestLorePanel';

interface QuestCardProps {
  quest: CurrentQuest;
  onStart: (slot: number) => void;
  onComplete: (tokenId: number) => void;
  onAbandon: (tokenId: number) => void;
  isActionPending?: boolean;
  /** Warrior's power score for success chance estimation */
  warriorPower?: number;
}

/** Estimate success chance based on warrior power vs quest base difficulty */
function estimateSuccessChance(power: number, baseDifficulty: number): number {
  // Mirrors on-chain formula: powerContribution = (power * 1000) / (power + baseDifficulty * 10)
  const contribution = (power * 1000) / (power + baseDifficulty * 10);
  // Cap at 95%, min 5%
  return Math.min(95, Math.max(5, Math.round(contribution / 10)));
}

function successColor(chance: number): string {
  if (chance >= 70) return 'text-green-400';
  if (chance >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function successBg(chance: number): string {
  if (chance >= 70) return 'bg-green-500/10 border-green-500/20';
  if (chance >= 40) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function formatDuration(secs: number): string {
  if (secs <= 0) return 'Ready!';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatFullDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

/** Internal timer hook — only re-renders this card, not the parent */
function useQuestTimer(startedAt: string | null, durationSecs: number, isActive: boolean) {
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!isActive || !startedAt) {
      setRemaining(undefined);
      return;
    }

    // SQLite datetime('now') stores UTC but without 'Z' suffix — add it to parse correctly
    const raw = typeof startedAt === 'string' ? startedAt : '';
    const startMs = raw ? Date.parse(raw.endsWith('Z') ? raw : raw + 'Z') : Date.now();
    const endMs = startMs + durationSecs * 1000;

    function tick() {
      const rem = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
      setRemaining(rem);
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [startedAt, durationSecs, isActive]);

  return remaining;
}

export default function QuestCard({
  quest,
  onStart,
  onComplete,
  onAbandon,
  isActionPending = false,
  warriorPower = 0,
}: QuestCardProps) {
  const [showLore, setShowLore] = useState(false);
  const q = quest.quest;
  const style = ZONE_ELEMENT_STYLES[q.zone_element] ?? ZONE_ELEMENT_STYLES.Fire;

  // Internal timer — does NOT bubble state to parent
  const timeRemaining = useQuestTimer(
    quest.startedAt,
    q.duration_secs,
    quest.status === 'active'
  );
  const isReady = quest.status === 'active' && timeRemaining !== undefined && timeRemaining <= 0;

  return (
    <div
      className={`
        relative rounded-2xl border overflow-hidden
        transition-colors duration-300
        ${quest.status === 'active'
          ? 'border-white/15'
          : quest.status === 'completed'
            ? 'border-white/[0.06] opacity-80'
            : 'border-white/[0.06] hover:border-white/15'
        }
      `}
      style={{
        background: quest.status === 'active'
          ? `linear-gradient(135deg, ${style.color}10, transparent)`
          : 'var(--glass-card-bg)',
        ...(quest.status === 'active' ? { boxShadow: `0 0 20px ${style.glowColor}` } : {}),
      }}
    >
      {/* Card content */}
      <div className="p-4">
        {/* Top row: slot badge, difficulty, duration */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white/20 text-[9px] font-pixel">
              SLOT {quest.slot + 1}
            </span>
            <DifficultyBadge difficulty={q.difficulty as Difficulty} showPulse={q.difficulty === 'Boss'} />
          </div>
          <span className="text-white/30 text-[10px] font-pixel">
            {formatFullDuration(q.duration_secs)}
          </span>
        </div>

        {/* Quest name */}
        <h3 className="font-display text-white text-xs leading-snug mb-1">
          {q.name}
        </h3>

        {/* Zone + element */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-sm">{style.icon}</span>
          <span className="text-white/40 text-[10px]">{q.zone_name}</span>
        </div>

        {/* Enemy */}
        <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <span className="text-white/30 text-[9px] font-pixel">ENEMY</span>
          <span className="text-white/70 text-xs font-medium flex-1 truncate">{q.enemy_name}</span>
        </div>

        {/* XP rewards */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1">
            <span className="text-green-400 text-[10px] font-bold">+{q.win_xp} XP</span>
            <span className="text-white/20 text-[9px]">win</span>
          </div>
          <div className="text-white/10">|</div>
          <div className="flex items-center gap-1">
            <span className="text-red-400/70 text-[10px]">+{q.loss_xp} XP</span>
            <span className="text-white/20 text-[9px]">loss</span>
          </div>
          {q.min_level > 1 && (
            <>
              <div className="text-white/10">|</div>
              <span className="text-white/30 text-[9px] font-pixel">LVL {q.min_level}+</span>
            </>
          )}
        </div>

        {/* Success Chance Estimate */}
        {warriorPower > 0 && quest.status === 'available' && (
          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border mb-3 ${successBg(estimateSuccessChance(warriorPower, q.base_difficulty))}`}>
            <span className="text-white/40 text-[9px] font-pixel">Est. Success</span>
            <span className={`text-[10px] font-pixel font-bold ${successColor(estimateSuccessChance(warriorPower, q.base_difficulty))}`}>
              {estimateSuccessChance(warriorPower, q.base_difficulty)}%
            </span>
          </div>
        )}

        {/* Status-specific content */}

        {/* AVAILABLE: Start button */}
        {quest.status === 'available' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onStart(quest.slot)}
              disabled={isActionPending}
              className="flex-1 btn-3d btn-3d-red text-[10px] py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isActionPending ? 'Starting...' : 'Start Quest'}
            </button>
            <button
              onClick={() => setShowLore(!showLore)}
              className="px-3 py-2 rounded-xl border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/15 transition-all text-[10px] font-pixel"
            >
              Lore
            </button>
          </div>
        )}

        {/* ACTIVE: Timer + actions */}
        {quest.status === 'active' && (
          <div>
            {/* Timer bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{ background: isReady ? '#00ff88' : style.color }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-2 w-2"
                      style={{ background: isReady ? '#00ff88' : style.color }}
                    />
                  </span>
                  <span className="text-[10px] font-pixel" style={{ color: isReady ? '#00ff88' : style.color }}>
                    {isReady ? 'Quest Complete!' : 'In Progress'}
                  </span>
                </div>
                <span
                  className="text-[10px] font-pixel font-bold"
                  style={{ color: isReady ? '#00ff88' : style.color }}
                >
                  {timeRemaining !== undefined ? formatDuration(timeRemaining) : '...'}
                </span>
              </div>
              {/* Progress bar */}
              {timeRemaining !== undefined && (
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                    style={{
                      background: isReady
                        ? '#00ff88'
                        : `linear-gradient(90deg, ${style.color}, ${style.color}88)`,
                      width: `${Math.min(100, Math.max(0, ((q.duration_secs - timeRemaining) / q.duration_secs) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Warrior info */}
            {quest.tokenId && (
              <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <span className="text-white/30 text-[9px] font-pixel">WARRIOR</span>
                <span className="text-white/60 text-xs">#{quest.tokenId}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {isReady ? (
                <button
                  onClick={() => quest.tokenId && onComplete(quest.tokenId)}
                  disabled={isActionPending}
                  className="flex-1 btn-3d btn-3d-green text-[10px] py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isActionPending ? 'Completing...' : 'Claim Reward'}
                </button>
              ) : (
                <button
                  onClick={() => quest.tokenId && onAbandon(quest.tokenId)}
                  disabled={isActionPending}
                  className="flex-1 px-3 py-2 rounded-xl border border-red-500/20 text-red-400/70 hover:border-red-500/40 hover:text-red-400 transition-all text-[10px] font-pixel disabled:opacity-50"
                >
                  {isActionPending ? 'Abandoning...' : 'Abandon'}
                </button>
              )}
              <button
                onClick={() => setShowLore(!showLore)}
                className="px-3 py-2 rounded-xl border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/15 transition-all text-[10px] font-pixel"
              >
                Lore
              </button>
            </div>
          </div>
        )}

        {/* COMPLETED: Result */}
        {quest.status === 'completed' && (
          <div>
            <div className={`
              flex items-center justify-between px-3 py-2 rounded-xl border
              ${quest.result === 'success'
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-red-500/20 bg-red-500/5'
              }
            `}>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {quest.result === 'success' ? '⚔️' : '💀'}
                </span>
                <span className={`text-xs font-bold ${quest.result === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {quest.result === 'success' ? 'Victory!' : 'Defeat'}
                </span>
              </div>
              <span className={`text-[10px] font-pixel ${quest.result === 'success' ? 'text-green-400' : 'text-red-400/70'}`}>
                +{quest.xpGained} XP
              </span>
            </div>
            <button
              onClick={() => setShowLore(!showLore)}
              className="mt-2 w-full px-3 py-1.5 rounded-xl border border-white/[0.06] text-white/30 hover:text-white/50 transition-all text-[10px] font-pixel text-center"
            >
              {showLore ? 'Hide' : 'View'} Battle Report
            </button>
          </div>
        )}
      </div>

      {/* Lore panel */}
      <div className="px-4 pb-4">
        <QuestLorePanel quest={quest} isOpen={showLore} onClose={() => setShowLore(false)} />
      </div>
    </div>
  );
}
