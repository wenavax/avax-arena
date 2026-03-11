'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map,
  Clock,
  Sparkles,
  Trophy,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Skull,
  ArrowRight,
  Send,
  ChevronUp,
  Shield,
} from 'lucide-react';
import { ELEMENTS, ELEMENT_ADVANTAGES, CONTRACT_ADDRESSES, ACTIVE_CHAIN_ID } from '@/lib/constants';
import { QUEST_ENGINE_ABI, FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useSwitchChain } from 'wagmi';
import { cn } from '@/lib/utils';
import { useOnContractEvent } from '@/hooks/useContractEvents';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface Warrior {
  tokenId: number;
  attack: number;
  defense: number;
  speed: number;
  element: number;
  specialPower: number;
  level: number;
  experience: number;
  battleWins: number;
  battleLosses: number;
  powerScore: number;
}

interface ActiveQuestData {
  questId: number;
  tokenId: number;
  player: string;
  startedAt: number;
  endsAt: number;
  completed: boolean;
  won: boolean;
}

interface GeneratedQuest {
  chain_quest_id: number;
  zone_id: number;
  zone_name: string;
  zone_element: string;
  difficulty: string;
  duration_secs: number;
  win_xp: number;
  loss_xp: number;
  min_level: number;
  min_power_score: number;
  base_difficulty: number;
  name: string;
  description: string;
  lore_intro: string;
  lore_success: string;
  lore_failure: string;
  enemy_name: string;
}

interface TierQuestSlot {
  slot: number;
  status: string;
  result: string | null;
  tokenId: number | null;
  xpGained: number;
  startedAt: string | null;
  completedAt: string | null;
  quest: GeneratedQuest;
}

interface Progression {
  currentTier: number;
  totalCompleted: number;
  totalWon: number;
  totalXp: number;
}

interface TierHistoryEntry {
  tier: number;
  slot0_result: string | null;
  slot1_result: string | null;
}

/* ---------------------------------------------------------------------------
 * Constants & Helpers
 * ------------------------------------------------------------------------- */

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'text-green-400',
  Medium: 'text-yellow-400',
  Hard: 'text-orange-400',
  Boss: 'text-red-400',
};

const DIFFICULTY_BG: Record<string, string> = {
  Easy: 'bg-green-400/10 border-green-400/20',
  Medium: 'bg-yellow-400/10 border-yellow-400/20',
  Hard: 'bg-orange-400/10 border-orange-400/20',
  Boss: 'bg-red-400/10 border-red-400/20',
};

const DIFFICULTY_DOT: Record<string, string> = {
  Easy: 'bg-green-400',
  Medium: 'bg-yellow-400',
  Hard: 'bg-orange-400',
  Boss: 'bg-red-400',
};

const DIFFICULTY_GLOW: Record<string, string> = {
  Easy: 'shadow-[0_0_20px_rgba(74,222,128,0.15)]',
  Medium: 'shadow-[0_0_20px_rgba(250,204,21,0.15)]',
  Hard: 'shadow-[0_0_20px_rgba(251,146,60,0.15)]',
  Boss: 'shadow-[0_0_20px_rgba(248,113,113,0.15)]',
};

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
}

function hasElementAdvantage(attackerElement: number, defenderElement: number): boolean {
  return ELEMENT_ADVANTAGES[attackerElement] === defenderElement;
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Ready!';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function parseWarriorData(raw: Record<string, unknown>, tokenId: number): Warrior {
  return {
    tokenId,
    attack: Number(raw.attack ?? raw[0] ?? 0),
    defense: Number(raw.defense ?? raw[1] ?? 0),
    speed: Number(raw.speed ?? raw[2] ?? 0),
    element: Number(raw.element ?? raw[3] ?? 0),
    specialPower: Number(raw.specialPower ?? raw[4] ?? 0),
    level: Number(raw.level ?? raw[5] ?? 0),
    experience: Number(raw.experience ?? raw[6] ?? 0),
    battleWins: Number(raw.battleWins ?? raw[7] ?? 0),
    battleLosses: Number(raw.battleLosses ?? raw[8] ?? 0),
    powerScore: Number(raw.powerScore ?? raw[9] ?? 0),
  };
}

function calculateSuccessChance(warrior: Warrior, quest: { baseDifficulty: number; minLevel: number; zone: number }): number {
  const ps = warrior.powerScore;
  const bd = quest.baseDifficulty * 10;
  const powerContribution = (ps * 1000) / (ps + bd);
  const elementBonus = hasElementAdvantage(warrior.element, quest.zone) ? 150 : 0;
  let levelBonus = 0;
  if (warrior.level > quest.minLevel) {
    levelBonus = Math.min((warrior.level - quest.minLevel) * 5, 250);
  }
  return Math.min(Math.floor(powerContribution + elementBonus + levelBonus), 950);
}

/* ---------------------------------------------------------------------------
 * Warrior Image Component
 * ------------------------------------------------------------------------- */

function WarriorImage({ tokenId, element, size = 48, className = '' }: { tokenId: number; element: number; size?: number; className?: string }) {
  const el = getElement(element);
  return (
    <div className={cn('relative rounded-lg overflow-hidden flex-shrink-0', className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/metadata/${tokenId}/image?element=${element}`} alt={`Warrior #${tokenId}`} width={size} height={size} className="w-full h-full object-cover" loading="lazy" />
      <span className="absolute bottom-0 right-0 text-[10px] leading-none bg-black/60 rounded-tl px-0.5" title={el.name}>{el.emoji}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Progression Header
 * ------------------------------------------------------------------------- */

function ProgressionHeader({ progression, completedInTier }: { progression: Progression; completedInTier: number }) {
  const progressPct = (completedInTier / 2) * 100;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Shield className="w-5 h-5 text-frost-cyan" />
            <span className="text-sm font-medium text-white/50">Quest Progression</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-frost-cyan/10 border border-frost-cyan/20">
          <span className="text-xs text-frost-cyan/70">Tier</span>
          <span className="text-lg font-bold text-frost-cyan font-mono">{progression.currentTier}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-frost-cyan to-frost-purple"
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <span>{completedInTier}/2 completed</span>
        <div className="flex gap-4">
          <span>{progression.totalCompleted} quests</span>
          <span>{progression.totalWon} wins</span>
          <span className="text-frost-cyan">{progression.totalXp.toLocaleString()} XP</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Tier Quest Card
 * ------------------------------------------------------------------------- */

function TierQuestCard({
  slotData,
  warrior,
  chainEndsAt,
  onStartQuest,
  onCompleteQuest,
  onAbandonQuest,
  isCompleting,
  isPendingStart,
  slotIndex,
}: {
  slotData: TierQuestSlot;
  warrior: Warrior | null;
  chainEndsAt: number | null;
  onStartQuest: (slot: number) => void;
  onCompleteQuest: (tokenId: number) => void;
  onAbandonQuest: (tokenId: number) => void;
  isCompleting: boolean;
  isPendingStart: boolean;
  slotIndex: number;
}) {
  const { quest, status, tokenId } = slotData;
  const el = getElement(quest.zone_id);
  const diffColor = DIFFICULTY_COLORS[quest.difficulty] ?? 'text-white/50';
  const diffBg = DIFFICULTY_BG[quest.difficulty] ?? '';
  const diffDot = DIFFICULTY_DOT[quest.difficulty] ?? 'bg-white/30';
  const diffGlow = DIFFICULTY_GLOW[quest.difficulty] ?? '';

  // Countdown for active quests
  // Key includes status, so this component remounts on available→active transition.
  // Use on-chain endsAt (unix timestamp) when available, otherwise compute from DB startedAt.
  const [remaining, setRemaining] = useState(() => {
    if (status !== 'active') return 0;
    // Prefer on-chain endsAt (contract's source of truth)
    if (chainEndsAt && chainEndsAt > 0) {
      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, chainEndsAt - now);
    }
    // Fallback: compute from DB startedAt
    if (!slotData.startedAt) return quest.duration_secs;
    const raw = slotData.startedAt;
    const isoStr = raw.endsWith('Z') || raw.includes('+') || raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
    const startedAtMs = new Date(isoStr).getTime();
    const endsAtSec = Math.floor((startedAtMs + quest.duration_secs * 1000) / 1000);
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, endsAtSec - now);
  });
  const endsAtRef = useRef<number>(0);

  useEffect(() => {
    if (status !== 'active') return;

    // Compute endsAt
    if (chainEndsAt && chainEndsAt > 0) {
      endsAtRef.current = chainEndsAt;
    } else if (slotData.startedAt) {
      const raw = slotData.startedAt;
      const isoStr = raw.endsWith('Z') || raw.includes('+') || raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
      const startedAtMs = new Date(isoStr).getTime();
      endsAtRef.current = Math.floor((startedAtMs + quest.duration_secs * 1000) / 1000);
    } else {
      endsAtRef.current = Math.floor(Date.now() / 1000) + quest.duration_secs;
    }

    function tick() {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, endsAtRef.current - now));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status, slotData.startedAt, quest.duration_secs, chainEndsAt]);

  const isReady = status === 'active' && remaining <= 0;
  const isActive = status === 'active' && remaining > 0;
  const isCompleted = status === 'completed';
  const isAvailable = status === 'available';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: slotIndex * 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'relative rounded-xl border p-5 transition-all',
        isAvailable && 'border-white/[0.08] bg-white/[0.02] hover:border-frost-cyan/20 hover:bg-frost-cyan/[0.03]',
        isActive && 'border-yellow-500/20 bg-yellow-500/[0.03]',
        isReady && `border-green-500/30 bg-green-500/[0.05] ${diffGlow}`,
        isCompleted && slotData.result === 'success' && 'border-green-500/15 bg-green-500/[0.02]',
        isCompleted && slotData.result === 'failure' && 'border-red-500/15 bg-red-500/[0.02]',
      )}
    >
      {/* Zone badge + difficulty */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{el.emoji}</span>
          <span className="text-xs text-white/40">{quest.zone_name}</span>
        </div>
        <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium', diffBg, diffColor)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', diffDot)} />
          {quest.difficulty}
        </div>
      </div>

      {/* Quest name */}
      <h3 className="text-base font-semibold text-white/90 leading-tight mb-2">{quest.name}</h3>

      {/* Info row */}
      <div className="flex items-center gap-3 text-[11px] text-white/40 mb-3">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(quest.duration_secs)}
        </span>
        <span className="text-frost-cyan font-mono">{quest.win_xp} XP</span>
      </div>

      {/* Enemy */}
      <div className="flex items-center gap-1.5 text-[11px] text-red-400/60 mb-2">
        <Skull className="w-3 h-3" />
        vs {quest.enemy_name}
      </div>

      {/* Lore */}
      <p className="text-[11px] text-white/30 italic leading-relaxed mb-4 line-clamp-2">
        {quest.lore_intro}
      </p>

      {/* Status-specific content */}
      {isAvailable && (
        <button
          onClick={() => onStartQuest(slotData.slot)}
          disabled={isPendingStart}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-frost-cyan/10 border border-frost-cyan/20 text-frost-cyan text-xs font-medium hover:bg-frost-cyan/20 transition-all disabled:opacity-50"
        >
          {isPendingStart ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Send Warrior
              <ArrowRight className="w-3 h-3" />
            </>
          )}
        </button>
      )}

      {isActive && (
        <div className="space-y-2">
          {warrior && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03]">
              <WarriorImage tokenId={warrior.tokenId} element={warrior.element} size={28} />
              <span className="text-xs text-white/60">#{warrior.tokenId}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className={cn('text-sm font-mono', isReady ? 'text-green-400' : 'text-yellow-400')}>
              {formatCountdown(remaining)}
            </span>
            <button
              onClick={() => tokenId != null && onAbandonQuest(tokenId)}
              className="px-2 py-1 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 text-[10px] transition-colors"
              title="Abandon"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {isReady && (
        <div className="space-y-2">
          {warrior && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-500/[0.05]">
              <WarriorImage tokenId={warrior.tokenId} element={warrior.element} size={28} />
              <span className="text-xs text-white/60">#{warrior.tokenId}</span>
            </div>
          )}
          <motion.button
            onClick={() => tokenId != null && onCompleteQuest(tokenId)}
            disabled={isCompleting}
            animate={{
              boxShadow: [
                '0 0 4px rgba(74, 222, 128, 0.15)',
                '0 0 16px rgba(74, 222, 128, 0.3)',
                '0 0 4px rgba(74, 222, 128, 0.15)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            {isCompleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Complete Quest
              </>
            )}
          </motion.button>
        </div>
      )}

      {isCompleted && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            {slotData.result === 'success' ? (
              <div className="flex items-center gap-1.5 text-green-400 text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">Victory</span>
                <span className="text-frost-cyan font-mono ml-1">+{slotData.xpGained} XP</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-red-400 text-xs">
                <XCircle className="w-4 h-4" />
                <span className="font-medium">Defeated</span>
                <span className="text-white/30 font-mono ml-1">+{slotData.xpGained} XP</span>
              </div>
            )}
          </div>
          <p className="text-[10px] italic leading-relaxed line-clamp-2 text-white/20">
            {slotData.result === 'success' ? quest.lore_success : quest.lore_failure}
          </p>
        </div>
      )}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Tier Advance Overlay
 * ------------------------------------------------------------------------- */

function TierAdvanceOverlay({ show, newTier, onDone }: { show: boolean; newTier: number; onDone: () => void }) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onDone}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="text-center"
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <ChevronUp className="w-12 h-12 mx-auto text-frost-cyan mb-2" />
            </motion.div>
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-3xl font-bold text-white mb-2"
            >
              TIER {newTier - 1} COMPLETE
            </motion.h2>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-lg text-frost-cyan"
            >
              Advancing to Tier {newTier}
            </motion.p>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="w-48 h-0.5 mx-auto mt-4 bg-gradient-to-r from-transparent via-frost-cyan to-transparent"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Tier History Timeline
 * ------------------------------------------------------------------------- */

function TierHistory({ history }: { history: TierHistoryEntry[] }) {
  if (history.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4">
      <div className="text-[11px] text-white/30 uppercase tracking-wider mb-3 font-medium">Tier History</div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {history.map((h) => (
          <div key={h.tier} className="flex-shrink-0 flex items-center gap-0.5">
            <span className="text-[10px] text-white/30 font-mono mr-1">T{h.tier}</span>
            <span className={cn('w-2.5 h-2.5 rounded-sm', h.slot0_result === 'success' ? 'bg-green-400' : h.slot0_result === 'failure' ? 'bg-red-400' : 'bg-white/10')} />
            <span className={cn('w-2.5 h-2.5 rounded-sm', h.slot1_result === 'success' ? 'bg-green-400' : h.slot1_result === 'failure' ? 'bg-red-400' : 'bg-white/10')} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Warrior Picker Modal
 * ------------------------------------------------------------------------- */

function WarriorPickerModal({
  open,
  onClose,
  warriors,
  warriorsOnQuest,
  quest,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  warriors: Warrior[];
  warriorsOnQuest: Set<number>;
  quest: GeneratedQuest | null;
  onSelect: (warrior: Warrior) => void;
}) {
  if (!open || !quest) return null;

  const questParams = { baseDifficulty: quest.base_difficulty, minLevel: quest.min_level, zone: quest.zone_id };
  const eligible = warriors
    .filter((w) => !warriorsOnQuest.has(w.tokenId) && w.level >= quest.min_level && w.powerScore >= quest.min_power_score)
    .sort((a, b) => calculateSuccessChance(b, questParams) - calculateSuccessChance(a, questParams));
  const ineligible = warriors
    .filter((w) => !warriorsOnQuest.has(w.tokenId) && (w.level < quest.min_level || w.powerScore < quest.min_power_score))
    .sort((a, b) => b.powerScore - a.powerScore);
  const onQuest = warriors
    .filter((w) => warriorsOnQuest.has(w.tokenId))
    .sort((a, b) => b.powerScore - a.powerScore);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0c0c14] p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white">
            <X className="w-5 h-5" />
          </button>

          <h2 className="text-lg font-semibold text-white/90 mb-1">Select Warrior</h2>
          <p className="text-xs text-white/40 mb-4">{quest.name} — {quest.difficulty} · {formatDuration(quest.duration_secs)}</p>

          {eligible.length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500/50" />
              No eligible warriors. Need Lv.{quest.min_level}+{quest.min_power_score > 0 ? ` & PS ${quest.min_power_score}+` : ''}.
            </div>
          )}

          <div className="space-y-2">
            {eligible.map((w, idx) => {
              const el = getElement(w.element);
              const chance = calculateSuccessChance(w, {
                baseDifficulty: quest.base_difficulty,
                minLevel: quest.min_level,
                zone: quest.zone_id,
              });
              const hasAdvantage = hasElementAdvantage(w.element, quest.zone_id);

              return (
                <motion.button
                  key={w.tokenId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => onSelect(w)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-frost-cyan/30 hover:bg-frost-cyan/5 transition-all text-left"
                >
                  <WarriorImage tokenId={w.tokenId} element={w.element} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white/90">#{w.tokenId}</span>
                      <span className="text-xs text-white/40">{el.emoji} {el.name}</span>
                      {hasAdvantage && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          Element Advantage
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[10px] text-white/40">
                      <span>Lv.{w.level}</span>
                      <span>PS {w.powerScore}</span>
                      <span>ATK {w.attack}</span>
                      <span>DEF {w.defense}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'text-sm font-bold',
                      chance >= 700 ? 'text-green-400' : chance >= 400 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {(chance / 10).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-white/30">success</div>
                  </div>
                </motion.button>
              );
            })}

            {ineligible.map((w, idx) => {
              const el = getElement(w.element);
              return (
                <motion.div
                  key={w.tokenId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 0.4, y: 0 }}
                  transition={{ delay: (eligible.length + idx) * 0.04, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01]"
                >
                  <WarriorImage tokenId={w.tokenId} element={w.element} size={44} />
                  <div className="flex-1">
                    <div className="text-sm text-white/50">#{w.tokenId} {el.emoji}</div>
                    <div className="text-[10px] text-red-400">
                      {w.level < quest.min_level ? `Level too low (${w.level}/${quest.min_level})` : `Power score too low (${w.powerScore}/${quest.min_power_score})`}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {onQuest.map((w, idx) => {
              const el = getElement(w.element);
              return (
                <motion.div
                  key={w.tokenId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 0.3, y: 0 }}
                  transition={{ delay: (eligible.length + ineligible.length + idx) * 0.04, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01]"
                >
                  <WarriorImage tokenId={w.tokenId} element={w.element} size={44} />
                  <div className="flex-1">
                    <div className="text-sm text-white/50">#{w.tokenId} {el.emoji}</div>
                    <div className="text-[10px] text-yellow-400">Already on a quest</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Quest Result Modal
 * ------------------------------------------------------------------------- */

function ConfettiParticle({ index }: { index: number }) {
  const colors = ['#00e5ff', '#a855f7', '#ec4899', '#4ade80', '#facc15'];
  const color = colors[index % colors.length];
  const startX = Math.random() * 300 - 150;
  const endX = startX + (Math.random() * 100 - 50);
  const rotation = Math.random() * 720 - 360;
  const size = Math.random() * 6 + 4;
  const duration = Math.random() * 1.5 + 1.5;

  return (
    <motion.div
      initial={{ opacity: 1, y: -20, x: startX, rotate: 0, scale: 1 }}
      animate={{ opacity: 0, y: 300, x: endX, rotate: rotation, scale: 0.5 }}
      transition={{ duration, ease: 'easeOut', delay: index * 0.03 }}
      className="absolute top-0 left-1/2 pointer-events-none"
      style={{ width: size, height: size, backgroundColor: color, borderRadius: Math.random() > 0.5 ? '50%' : '2px' }}
    />
  );
}

function AnimatedXPCounter({ target, duration = 1.5 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target <= 0) { setCount(target); return; }
    const startTime = Date.now();
    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);

  return <span>+{count} XP</span>;
}

function QuestResultModal({
  open,
  onClose,
  result,
}: {
  open: boolean;
  onClose: () => void;
  result: { won: boolean; xpGained: number; lore: string; questName: string; enemyName: string; tierAdvanced?: boolean; newTier?: number } | null;
}) {
  if (!open || !result) return null;

  const confettiParticles = Array.from({ length: 20 }, (_, i) => i);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={result.won ? { scale: 0.9, opacity: 0 } : { scale: 0.9, opacity: 0 }}
          animate={result.won
            ? { scale: 1, opacity: 1 }
            : { scale: 1, opacity: 1, x: [0, -8, 8, -8, 8, 0] }
          }
          exit={{ scale: 0.9, opacity: 0 }}
          transition={result.won
            ? { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
            : { duration: 0.5, x: { duration: 0.5, delay: 0.2, ease: 'easeInOut' } }
          }
          className={cn(
            'relative w-full max-w-md rounded-2xl border p-6 text-center overflow-hidden',
            result.won
              ? 'border-green-500/20 bg-gradient-to-b from-green-500/5 to-[#0c0c14]'
              : 'border-red-500/20 bg-gradient-to-b from-red-500/5 to-[#0c0c14]'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {result.won && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {confettiParticles.map((i) => (
                <ConfettiParticle key={i} index={i} />
              ))}
            </div>
          )}

          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white z-10">
            <X className="w-5 h-5" />
          </button>

          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', delay: 0.2, stiffness: 200, damping: 15 }}
            className="mb-4"
          >
            {result.won ? (
              <Trophy className="w-16 h-16 mx-auto text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.4)]" />
            ) : (
              <XCircle className="w-16 h-16 mx-auto text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.4)]" />
            )}
          </motion.div>

          <h2 className={cn('text-2xl font-bold mb-1', result.won ? 'text-green-400' : 'text-red-400')}>
            {result.won ? 'Quest Complete!' : 'Quest Failed'}
          </h2>
          <p className="text-xs text-white/40 mb-4">{result.questName} — vs {result.enemyName}</p>

          <div className="bg-white/[0.03] rounded-xl p-4 mb-4 text-left">
            <p className="text-sm text-white/70 italic leading-relaxed">&ldquo;{result.lore}&rdquo;</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-frost-cyan/10 border border-frost-cyan/20"
          >
            <Sparkles className="w-4 h-4 text-frost-cyan" />
            <span className="text-lg font-bold text-frost-cyan font-mono">
              <AnimatedXPCounter target={result.xpGained} duration={1.5} />
            </span>
          </motion.div>

          <button
            onClick={onClose}
            className="block w-full mt-6 py-2 rounded-lg bg-white/[0.06] text-sm text-white/60 hover:bg-white/[0.1] transition-colors"
          >
            Continue
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Main Page
 * ------------------------------------------------------------------------- */

export default function QuestsPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  // State
  const [progression, setProgression] = useState<Progression | null>(null);
  const [currentQuests, setCurrentQuests] = useState<TierQuestSlot[]>([]);
  const [tierHistory, setTierHistory] = useState<TierHistoryEntry[]>([]);
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [activeQuests, setActiveQuests] = useState<ActiveQuestData[]>([]);
  const [warriorsOnQuest, setWarriorsOnQuest] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingWarriors, setIsLoadingWarriors] = useState(false);

  // Modal state
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedQuest, setSelectedQuest] = useState<GeneratedQuest | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [questResult, setQuestResult] = useState<{ won: boolean; xpGained: number; lore: string; questName: string; enemyName: string; tierAdvanced?: boolean; newTier?: number } | null>(null);
  const [showTierAdvance, setShowTierAdvance] = useState(false);
  const [advanceToTier, setAdvanceToTier] = useState(0);

  // Transaction state
  const [pendingAction, setPendingAction] = useState<'start' | 'complete' | 'abandon' | null>(null);
  const [pendingTokenId, setPendingTokenId] = useState<number | null>(null);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: txHash, writeContract, isPending: isWritePending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  // Fetch progression data from API
  const fetchProgression = useCallback(async () => {
    if (!address || !isConnected) {
      setProgression(null);
      setCurrentQuests([]);
      setTierHistory([]);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/quests?wallet=${address}`);
      const data = await res.json();
      if (data.progression) setProgression(data.progression);
      if (data.currentQuests) setCurrentQuests(data.currentQuests);
      if (data.history) setTierHistory(data.history);
    } catch (err) {
      console.error('[quests] Failed to fetch progression:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => { fetchProgression(); }, [fetchProgression]);

  // Fetch warriors
  const fetchWarriors = useCallback(async () => {
    if (!publicClient || !address || !isConnected) {
      setWarriors([]);
      return;
    }
    setIsLoadingWarriors(true);
    try {
      const ids = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'getWarriorsByOwner',
        args: [address as `0x${string}`],
      }) as bigint[];

      if (!ids || ids.length === 0) {
        setWarriors([]);
        return;
      }

      const details = await Promise.all(
        ids.map((id) =>
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
            abi: FROSTBITE_WARRIOR_ABI,
            functionName: 'getWarrior',
            args: [id],
          })
        )
      );

      setWarriors(
        details
          .map((raw, i) => parseWarriorData(raw as Record<string, unknown>, Number(ids[i])))
          .sort((a, b) => b.powerScore - a.powerScore)
      );
    } catch (err) {
      console.error('[quests] Failed to fetch warriors:', err);
    } finally {
      setIsLoadingWarriors(false);
    }
  }, [publicClient, address, isConnected]);

  useEffect(() => { fetchWarriors(); }, [fetchWarriors]);

  // Fetch active quests from chain
  const fetchActiveQuests = useCallback(async () => {
    if (!publicClient || !address || !isConnected || warriors.length === 0) {
      setActiveQuests([]);
      setWarriorsOnQuest(new Set());
      return;
    }

    try {
      const onQuestSet = new Set<number>();
      const questList: ActiveQuestData[] = [];

      const checks = await Promise.all(
        warriors.map((w) =>
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
            abi: QUEST_ENGINE_ABI,
            functionName: 'isWarriorOnQuest',
            args: [BigInt(w.tokenId)],
          }).catch(() => false)
        )
      );

      const onQuestWarriors = warriors.filter((_, i) => checks[i]);

      if (onQuestWarriors.length > 0) {
        const questDetails = await Promise.all(
          onQuestWarriors.map((w) =>
            publicClient.readContract({
              address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
              abi: QUEST_ENGINE_ABI,
              functionName: 'getActiveQuest',
              args: [BigInt(w.tokenId)],
            })
          )
        );

        for (let i = 0; i < onQuestWarriors.length; i++) {
          const raw = questDetails[i] as Record<string, unknown>;
          const aq: ActiveQuestData = {
            questId: Number(raw.questId ?? raw[0] ?? 0),
            tokenId: Number(raw.tokenId ?? raw[1] ?? 0),
            player: String(raw.player ?? raw[2] ?? ''),
            startedAt: Number(raw.startedAt ?? raw[3] ?? 0),
            endsAt: Number(raw.endsAt ?? raw[4] ?? 0),
            completed: Boolean(raw.completed ?? raw[5] ?? false),
            won: Boolean(raw.won ?? raw[6] ?? false),
          };
          if (!aq.completed) {
            questList.push(aq);
            onQuestSet.add(onQuestWarriors[i].tokenId);
          }
        }
      }

      setActiveQuests(questList);
      setWarriorsOnQuest(onQuestSet);
    } catch (err) {
      console.error('[quests] Failed to fetch active quests:', err);
    }
  }, [publicClient, address, isConnected, warriors]);

  useEffect(() => { fetchActiveQuests(); }, [fetchActiveQuests]);

  // Handle transaction errors
  useEffect(() => {
    const err = writeError || receiptError;
    if (!err) return;

    const errStr = err.message || String(err);
    console.error('[quests] TX error:', errStr);

    let msg = 'Transaction failed';
    if (errStr.includes('QuestNotFinished')) msg = 'Quest not finished yet — wait for the timer';
    else if (errStr.includes('QuestAlreadyCompleted')) msg = 'Quest already completed';
    else if (errStr.includes('WarriorAlreadyOnQuest')) msg = 'Warrior is already on a quest';
    else if (errStr.includes('QuestNotStarted')) msg = 'No active quest for this warrior';
    else if (errStr.includes('User rejected') || errStr.includes('user rejected')) msg = 'Transaction rejected';
    else if (errStr.includes('NotWarriorOwner')) msg = 'You do not own this warrior';
    else if (errStr.includes('NotQuestPlayer')) msg = 'This quest belongs to a different wallet';
    else if (errStr.includes('LevelTooLow')) msg = 'Warrior level is too low for this quest';
    else if (errStr.includes('PowerScoreTooLow')) msg = 'Warrior power score is too low';
    else if (errStr.includes('insufficient funds')) msg = 'Insufficient AVAX for gas';
    else if (errStr.includes('reverted') || errStr.includes('execution reverted')) msg = 'Transaction reverted — check console for details';

    setTxError(msg);
    setPendingAction(null);
    setPendingTokenId(null);
    setPendingSlot(null);
    resetWrite();
    fetchActiveQuests();
    const timer = setTimeout(() => setTxError(null), 5000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError, receiptError]);

  // Handle transaction success
  useEffect(() => {
    if (!isTxSuccess || !txHash) return;

    const action = pendingAction;
    const tokenId = pendingTokenId;
    const slot = pendingSlot;

    if (action === 'start' && selectedQuest && slot !== null && progression) {
      // Immediately mark warrior as on-quest to prevent double-sending
      if (tokenId !== null) {
        setWarriorsOnQuest((prev) => new Set([...prev, tokenId]));
      }

      fetch('/api/v1/quests/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          tier: progression.currentTier,
          slot,
          tokenId,
          txHash,
        }),
      }).then(() => {
        fetchProgression();
      }).catch(console.error);

      setShowPicker(false);
      setSelectedQuest(null);
      setSelectedSlot(null);
    }

    if (action === 'complete' && tokenId !== null) {
      // Immediately remove warrior from on-quest set
      setWarriorsOnQuest((prev) => {
        const next = new Set(prev);
        next.delete(tokenId);
        return next;
      });

      (async () => {
        try {
          const aq = await publicClient!.readContract({
            address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
            abi: QUEST_ENGINE_ABI,
            functionName: 'getActiveQuest',
            args: [BigInt(tokenId)],
          }) as Record<string, unknown>;

          const won = Boolean(aq.won ?? aq[6] ?? false);

          const completeRes = await fetch('/api/v1/quests/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokenId,
              walletAddress: address,
              won,
              txHash,
            }),
          });
          const completeData = await completeRes.json();

          const xpGained = completeData.xpGained ?? 0;

          setQuestResult({
            won,
            xpGained,
            lore: completeData.lore ?? '',
            questName: completeData.questName ?? 'Quest',
            enemyName: completeData.enemyName ?? 'Unknown',
            tierAdvanced: completeData.tierAdvanced,
            newTier: completeData.newTier,
          });
          setShowResult(true);

          // If tier advanced, show overlay after result modal closes
          if (completeData.tierAdvanced) {
            setAdvanceToTier(completeData.newTier);
          }

          fetchProgression();
        } catch (err) {
          console.error('[quests] Failed to read quest result:', err);
        }
      })();
    }

    if (action === 'abandon' && tokenId !== null) {
      // Immediately remove warrior from on-quest set
      setWarriorsOnQuest((prev) => {
        const next = new Set(prev);
        next.delete(tokenId);
        return next;
      });

      fetch('/api/v1/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          walletAddress: address,
          won: false,
          xpGained: 0,
          txHash,
          abandoned: true,
        }),
      }).then(() => {
        fetchProgression();
      }).catch(console.error);
    }

    setPendingAction(null);
    setPendingTokenId(null);
    setPendingSlot(null);
    resetWrite();
    fetchWarriors();
    setTimeout(() => fetchActiveQuests(), 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxSuccess, txHash]);

  // Auto-refresh when quest events arrive from the chain
  useOnContractEvent(
    ['QuestStarted', 'QuestCompleted'],
    useCallback(() => {
      fetchWarriors();
      fetchActiveQuests();
    }, [fetchWarriors, fetchActiveQuests]),
  );

  // Handlers
  function handleStartQuest(slot: number) {
    const slotData = currentQuests.find((q) => q.slot === slot);
    if (!slotData) return;
    setSelectedSlot(slot);
    setSelectedQuest(slotData.quest);
    setShowPicker(true);
  }

  async function handleSelectWarrior(warrior: Warrior) {
    if (!selectedQuest || selectedSlot === null) return;
    if (chain?.id !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }
    setPendingAction('start');
    setPendingTokenId(warrior.tokenId);
    setPendingSlot(selectedSlot);

    writeContract({
      address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
      abi: QUEST_ENGINE_ABI,
      functionName: 'startQuest',
      args: [BigInt(warrior.tokenId), BigInt(selectedQuest.chain_quest_id)],
      gas: 300_000n,
    });
  }

  async function handleCompleteQuest(tokenId: number) {
    if (chain?.id !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }
    setPendingAction('complete');
    setPendingTokenId(tokenId);

    writeContract({
      address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
      abi: QUEST_ENGINE_ABI,
      functionName: 'completeQuest',
      args: [BigInt(tokenId)],
      gas: 300_000n,
    });
  }

  async function handleAbandonQuest(tokenId: number) {
    if (chain?.id !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }
    setPendingAction('abandon');
    setPendingTokenId(tokenId);

    writeContract({
      address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
      abi: QUEST_ENGINE_ABI,
      functionName: 'abandonQuest',
      args: [BigInt(tokenId)],
      gas: 200_000n,
    });
  }

  function handleResultClose() {
    setShowResult(false);
    const result = questResult;
    setQuestResult(null);

    // Show tier advance overlay if applicable
    if (result?.tierAdvanced && advanceToTier > 0) {
      setTimeout(() => setShowTierAdvance(true), 300);
    }
  }

  function handleTierAdvanceDone() {
    setShowTierAdvance(false);
    setAdvanceToTier(0);
    fetchProgression();
  }

  // Count completed in current tier
  const completedInTier = currentQuests.filter((q) => q.status === 'completed').length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-frost-cyan" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 lg:py-8">

        {/* ---- Header ---- */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white/90">Quests</h1>
          <p className="text-xs text-white/30 mt-1">Complete quests to advance through tiers and earn XP</p>
        </div>

        {/* ---- Transaction Status ---- */}
        <AnimatePresence>
          {(isWritePending || isTxPending) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-frost-cyan/10 border border-frost-cyan/20 text-sm text-frost-cyan"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {isWritePending ? 'Confirm transaction in wallet...' : 'Transaction pending...'}
            </motion.div>
          )}
          {txError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {txError}
              <button onClick={() => setTxError(null)} className="ml-auto text-white/30 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Not Connected ---- */}
        {!isConnected ? (
          <div className="text-center py-20 text-white/30">
            <Map className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium mb-1">Connect your wallet</p>
            <p className="text-sm">Connect to start your quest progression</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ---- Progression Header ---- */}
            {progression && (
              <ProgressionHeader progression={progression} completedInTier={completedInTier} />
            )}

            {/* ---- Quest Slots ---- */}
            {currentQuests.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentQuests.map((slotData, i) => (
                  <TierQuestCard
                    key={`${slotData.slot}-${progression?.currentTier}-${slotData.status}`}
                    slotData={slotData}
                    warrior={slotData.tokenId ? warriors.find((w) => w.tokenId === slotData.tokenId) ?? null : null}
                    chainEndsAt={slotData.tokenId ? (activeQuests.find((aq) => aq.tokenId === slotData.tokenId)?.endsAt ?? null) : null}
                    onStartQuest={handleStartQuest}
                    onCompleteQuest={handleCompleteQuest}
                    onAbandonQuest={handleAbandonQuest}
                    isCompleting={pendingAction === 'complete' && pendingTokenId === slotData.tokenId && (isWritePending || isTxPending)}
                    isPendingStart={pendingAction === 'start' && pendingSlot === slotData.slot && (isWritePending || isTxPending)}
                    slotIndex={i}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-white/30">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p className="text-sm">Loading quests...</p>
              </div>
            )}

            {/* ---- Tier History ---- */}
            <TierHistory history={tierHistory} />
          </div>
        )}
      </div>

      {/* Modals */}
      <WarriorPickerModal
        open={showPicker}
        onClose={() => { setShowPicker(false); setSelectedQuest(null); setSelectedSlot(null); }}
        warriors={warriors}
        warriorsOnQuest={warriorsOnQuest}
        quest={selectedQuest}
        onSelect={handleSelectWarrior}
      />

      <QuestResultModal
        open={showResult}
        onClose={handleResultClose}
        result={questResult}
      />

      <TierAdvanceOverlay
        show={showTierAdvance}
        newTier={advanceToTier}
        onDone={handleTierAdvanceDone}
      />
    </div>
  );
}
