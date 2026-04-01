'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESSES, ELEMENTS } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, QUEST_ENGINE_ABI } from '@/lib/contracts';
import type { CurrentQuest } from '@/types/quest';
import { ZONE_ELEMENT_STYLES, DIFFICULTY_STYLES } from '@/types/quest';
import type { Difficulty } from '@/types/quest';

/* ---- Warrior type (matches battle page) ---- */
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

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
}

/* ---- Element advantage check ---- */
const ELEMENT_ADVANTAGES: Record<number, number> = {
  0: 2, 2: 3, 3: 1, 1: 0,
  4: 5, 5: 6, 6: 7, 7: 4,
};

function hasElementAdvantage(warriorElement: number, zoneElement: string): boolean {
  const zoneEl = ELEMENTS.find(e => e.name === zoneElement);
  if (!zoneEl) return false;
  return ELEMENT_ADVANTAGES[warriorElement] === zoneEl.id;
}

interface WarriorSelectModalProps {
  quest: CurrentQuest;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tokenId: number) => void;
  isPending: boolean;
}

export default function WarriorSelectModal({
  quest,
  isOpen,
  onClose,
  onSelect,
  isPending,
}: WarriorSelectModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [selectedWarrior, setSelectedWarrior] = useState<Warrior | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [onQuestTokenIds, setOnQuestTokenIds] = useState<Set<number>>(new Set());

  const q = quest.quest;
  const style = ZONE_ELEMENT_STYLES[q.zone_element] ?? ZONE_ELEMENT_STYLES.Fire;

  // Fetch warriors on open
  useEffect(() => {
    if (!isOpen || !publicClient || !address) return;
    let cancelled = false;

    async function fetchWarriors() {
      setIsLoading(true);
      try {
        const ids = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarriorsByOwner',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled || !ids?.length) {
          setWarriors([]);
          setIsLoading(false);
          return;
        }

        // Fetch warrior details + quest status in parallel
        const [warriorResults, questResults] = await Promise.all([
          Promise.allSettled(
            ids.map(id =>
              publicClient!.readContract({
                address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
                abi: FROSTBITE_WARRIOR_ABI,
                functionName: 'getWarrior',
                args: [id],
              })
            )
          ),
          Promise.allSettled(
            ids.map(id =>
              publicClient!.readContract({
                address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
                abi: QUEST_ENGINE_ABI,
                functionName: 'isWarriorOnQuest',
                args: [id],
              })
            )
          ),
        ]);

        if (cancelled) return;

        const parsed: Warrior[] = [];
        const onQuest = new Set<number>();

        for (let i = 0; i < warriorResults.length; i++) {
          if (warriorResults[i].status === 'fulfilled') {
            const w = parseWarriorData(
              (warriorResults[i] as PromiseFulfilledResult<unknown>).value as Record<string, unknown>,
              Number(ids[i])
            );
            parsed.push(w);
          }
          if (questResults[i].status === 'fulfilled') {
            if ((questResults[i] as PromiseFulfilledResult<unknown>).value === true) {
              onQuest.add(Number(ids[i]));
            }
          }
        }

        setWarriors(parsed.sort((a, b) => b.powerScore - a.powerScore));
        setOnQuestTokenIds(onQuest);
      } catch (err) {
        console.error('[quest] Failed to fetch warriors:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchWarriors();
    return () => { cancelled = true; };
  }, [isOpen, publicClient, address]);

  // Reset selection on close
  useEffect(() => {
    if (!isOpen) setSelectedWarrior(null);
  }, [isOpen]);

  const eligibleWarriors = warriors.filter(w =>
    w.level >= q.min_level && !onQuestTokenIds.has(w.tokenId)
  );
  const ineligibleWarriors = warriors.filter(w =>
    w.level < q.min_level || onQuestTokenIds.has(w.tokenId)
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl border border-white/10 overflow-hidden flex flex-col"
            style={{ background: 'rgb(var(--frost-bg))' }}
          >
            {/* Header */}
            <div
              className="p-5 border-b border-white/[0.06]"
              style={{ background: `linear-gradient(135deg, ${style.color}08, transparent)` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-white text-sm mb-1">Select Warrior</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{style.icon}</span>
                    <span className="text-white/40 text-xs">{q.name}</span>
                    <span
                      className="text-[9px] font-pixel px-1.5 py-0.5 rounded-full border"
                      style={{
                        color: DIFFICULTY_STYLES[q.difficulty as Difficulty].color,
                        borderColor: `${DIFFICULTY_STYLES[q.difficulty as Difficulty].color}40`,
                      }}
                    >
                      {q.difficulty}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-white/30 hover:text-white/60 transition-colors text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Requirements */}
              <div className="flex items-center gap-3 mt-3">
                {q.min_level > 1 && (
                  <span className="text-white/30 text-[10px] font-pixel">
                    Min Level: <span className="text-white/60">{q.min_level}</span>
                  </span>
                )}
                {q.min_power_score > 0 && (
                  <span className="text-white/30 text-[10px] font-pixel">
                    Min Power: <span className="text-white/60">{q.min_power_score}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Warrior list */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : warriors.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/30 text-sm">No warriors found</p>
                  <p className="text-white/20 text-xs mt-1">Mint warriors to start questing</p>
                </div>
              ) : (
                <>
                  {/* Eligible warriors */}
                  {eligibleWarriors.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {eligibleWarriors.map(w => (
                        <WarriorRow
                          key={w.tokenId}
                          warrior={w}
                          isSelected={selectedWarrior?.tokenId === w.tokenId}
                          hasAdvantage={hasElementAdvantage(w.element, q.zone_element)}
                          zoneStyle={style}
                          onClick={() => setSelectedWarrior(w)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Ineligible warriors */}
                  {ineligibleWarriors.length > 0 && (
                    <div className="mt-4">
                      <span className="text-white/20 text-[10px] font-pixel uppercase mb-2 block">
                        Unavailable ({ineligibleWarriors.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ineligibleWarriors.map(w => (
                          <WarriorRow
                            key={w.tokenId}
                            warrior={w}
                            isSelected={false}
                            hasAdvantage={false}
                            zoneStyle={style}
                            onClick={() => {}}
                            disabled
                            reason={
                              onQuestTokenIds.has(w.tokenId) ? 'On Quest' :
                              w.level < q.min_level ? `Lvl ${q.min_level} req` : ''
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer: selected warrior + confirm */}
            <div className="p-4 border-t border-white/[0.06] bg-white/[0.02]">
              {selectedWarrior ? (
                <div className="flex items-center gap-3">
                  {/* Selected preview */}
                  <div className="flex-1 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/avalanche/api/metadata/${selectedWarrior.tokenId}/image?element=${selectedWarrior.element}`}
                        alt={`Warrior #${selectedWarrior.tokenId}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div>
                      <span className="text-white text-xs font-bold">#{selectedWarrior.tokenId}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white/40 text-[10px]">
                          {getElement(selectedWarrior.element).emoji} {getElement(selectedWarrior.element).name}
                        </span>
                        <span className="text-white/30 text-[10px]">PWR {selectedWarrior.powerScore}</span>
                        {hasElementAdvantage(selectedWarrior.element, q.zone_element) && (
                          <span className="text-green-400 text-[9px] font-pixel">+15% BONUS</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Confirm button */}
                  <button
                    onClick={() => onSelect(selectedWarrior.tokenId)}
                    disabled={isPending}
                    className="btn-3d btn-3d-red text-[10px] py-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? 'Sending...' : 'Send to Quest'}
                  </button>
                </div>
              ) : (
                <p className="text-white/20 text-xs text-center font-pixel">
                  Select a warrior to send on this quest
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---- Warrior row component ---- */

function WarriorRow({
  warrior,
  isSelected,
  hasAdvantage,
  zoneStyle,
  onClick,
  disabled = false,
  reason = '',
}: {
  warrior: Warrior;
  isSelected: boolean;
  hasAdvantage: boolean;
  zoneStyle: { color: string; glowColor: string };
  onClick: () => void;
  disabled?: boolean;
  reason?: string;
}) {
  const el = getElement(warrior.element);

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.01 } : undefined}
      whileTap={!disabled ? { scale: 0.99 } : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all w-full
        ${disabled
          ? 'opacity-40 cursor-not-allowed border-white/[0.04] bg-white/[0.01]'
          : isSelected
            ? 'border-white/20 bg-white/[0.04]'
            : 'border-white/[0.06] hover:border-white/12 bg-white/[0.02] hover:bg-white/[0.03]'
        }
      `}
      style={isSelected ? { boxShadow: `0 0 15px ${zoneStyle.glowColor}` } : undefined}
    >
      {/* Avatar */}
      <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/avalanche/api/metadata/${warrior.tokenId}/image?element=${warrior.element}`}
          alt={`#${warrior.tokenId}`}
          className="w-full h-full object-cover warrior-idle"
          style={{ animationDelay: `${(warrior.tokenId % 5) * 0.3}s` }}
          loading="lazy"
        />
        <span className="absolute bottom-0 right-0 text-[8px] leading-none bg-black/60 rounded-tl px-0.5">
          {el.emoji}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-bold">#{warrior.tokenId}</span>
          {hasAdvantage && !disabled && (
            <span className="text-green-400 text-[8px] font-pixel bg-green-500/10 px-1 rounded">ADV</span>
          )}
          {disabled && reason && (
            <span className="text-red-400/60 text-[8px] font-pixel">{reason}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-white/40 text-[10px]">{el.name}</span>
          <span className="text-white/20 text-[10px]">Lvl {warrior.level}</span>
          <span className="text-white/20 text-[10px]">PWR {warrior.powerScore}</span>
        </div>
      </div>

      {/* Stats mini */}
      <div className="text-right flex-shrink-0">
        <span className="text-white/30 text-[9px] font-pixel">
          {warrior.battleWins}W/{warrior.battleLosses}L
        </span>
      </div>
    </motion.button>
  );
}
