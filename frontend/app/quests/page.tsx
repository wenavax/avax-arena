'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Map, AlertTriangle, Loader2 } from 'lucide-react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useSwitchChain } from 'wagmi';
import { QUEST_ENGINE_ABI, FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import { CONTRACT_ADDRESSES, AVALANCHE_CHAIN_ID } from '@/lib/constants';
import { useQuestData } from '@/hooks/useQuestData';
import type { CurrentQuest, QuestCompleteResponse } from '@/types/quest';

import ZoneMap from '@/components/quests/ZoneMap';
import QuestCard from '@/components/quests/QuestCard';
import WarriorSelectModal from '@/components/quests/WarriorSelectModal';
import QuestCompleteOverlay from '@/components/quests/QuestCompleteOverlay';
import TierProgressBar from '@/components/quests/TierProgressBar';
import QuestHistory from '@/components/quests/QuestHistory';
import QuestStats from '@/components/quests/QuestStats';

export default function QuestsPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  const {
    zones,
    progression,
    currentQuests,
    history,
    isLoading,
    error,
    refetch,
    startQuest,
    completeQuest,
    abandonQuest,
  } = useQuestData();

  // UI state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [warriorModalQuest, setWarriorModalQuest] = useState<CurrentQuest | null>(null);
  const [completeOverlay, setCompleteOverlay] = useState<QuestCompleteResponse | null>(null);
  const [completeZoneElement, setCompleteZoneElement] = useState<string>('Fire');
  const [actionPendingSlot, setActionPendingSlot] = useState<number | null>(null);

  // Stuck warrior recovery
  const [stuckWarriors, setStuckWarriors] = useState<{ tokenId: number; endsAt: number }[]>([]);
  const [recoveringId, setRecoveringId] = useState<number | null>(null);

  // Detect stuck warriors on-chain
  useEffect(() => {
    if (!publicClient || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarriorsByOwner',
          args: [address],
        }) as bigint[];

        const stuck: { tokenId: number; endsAt: number }[] = [];
        for (const id of ids) {
          try {
            const onQuest = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
              abi: QUEST_ENGINE_ABI,
              functionName: 'isWarriorOnQuest',
              args: [id],
            }) as boolean;
            if (onQuest) {
              const aq = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
                abi: QUEST_ENGINE_ABI,
                functionName: 'getActiveQuest',
                args: [id],
              }) as any;
              const endsAt = Number(aq.endsAt ?? aq[4] ?? 0);
              stuck.push({ tokenId: Number(id), endsAt });
            }
          } catch { /* skip */ }
        }
        if (!cancelled) setStuckWarriors(stuck);
      } catch { /* skip */ }
    })();
    return () => { cancelled = true; };
  }, [publicClient, address]);

  // On-chain tx
  const { writeContractAsync, data: txHash, isPending: isTxPending } = useWriteContract();
  const { isLoading: isTxConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const isActionPending = isTxPending || isTxConfirming;

  // Auto-select zone from current quests (only once)
  useEffect(() => {
    if (selectedZoneId === null && currentQuests.length > 0) {
      const activeQuest = currentQuests.find(q => q.status === 'active');
      setSelectedZoneId(activeQuest ? activeQuest.quest.zone_id : currentQuests[0].quest.zone_id);
    }
  }, [currentQuests, selectedZoneId]);

  // Ensure correct chain
  const ensureChain = useCallback(async () => {
    if (chainId !== AVALANCHE_CHAIN_ID) {
      await switchChainAsync({ chainId: AVALANCHE_CHAIN_ID });
    }
  }, [chainId, switchChainAsync]);

  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const handleRecoverWarrior = useCallback(async (tokenId: number, isComplete: boolean) => {
    setRecoveringId(tokenId);
    setRecoveryError(null);
    try {
      await ensureChain();
      const fn = isComplete ? 'completeQuest' : 'abandonQuest';
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
        abi: QUEST_ENGINE_ABI,
        functionName: fn,
        args: [BigInt(tokenId)],
        gas: fn === 'completeQuest' ? 500000n : 200000n,
      });
      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      // Notify API about the recovery
      try {
        await fetch('/avalanche/api/v1/quests/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            tokenId,
            abandoned: !isComplete,
            won: false,
            xpGained: 0,
            txHash: hash,
          }),
        });
      } catch { /* API notification is best-effort */ }

      setStuckWarriors(prev => prev.filter(w => w.tokenId !== tokenId));
      await refetch();
    } catch (err: any) {
      console.error('[quest] Recovery failed:', err);
      const msg = err?.shortMessage || err?.message || 'Recovery failed';
      if (msg.includes('rejected') || msg.includes('denied')) {
        // User cancelled, no error
      } else {
        setRecoveryError(`#${tokenId}: ${msg.slice(0, 80)}`);
      }
    } finally {
      setRecoveringId(null);
    }
  }, [ensureChain, writeContractAsync, publicClient, refetch, address]);

  // ---- Quest Actions ----

  const handleStartQuest = useCallback((slot: number) => {
    setWarriorModalQuest(currentQuests.find(q => q.slot === slot) ?? null);
  }, [currentQuests]);

  const handleWarriorSelected = useCallback(async (tokenId: number) => {
    if (!warriorModalQuest || !progression) return;

    const quest = warriorModalQuest;
    const slot = quest.slot;
    setActionPendingSlot(slot);

    try {
      await ensureChain();

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
        abi: QUEST_ENGINE_ABI,
        functionName: 'startQuest',
        args: [BigInt(tokenId), BigInt(quest.quest.chain_quest_id)],
        gas: 300000n,
      });

      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      await startQuest(slot, tokenId, hash);
      setWarriorModalQuest(null);
      // Force refetch to update UI immediately
      setTimeout(() => refetch(), 500);
    } catch (err) {
      console.error('[quest] Start failed:', err);
    } finally {
      setActionPendingSlot(null);
    }
  }, [warriorModalQuest, progression, ensureChain, writeContractAsync, publicClient, startQuest]);

  const handleCompleteQuest = useCallback(async (tokenId: number) => {
    const quest = currentQuests.find(q => q.tokenId === tokenId && q.status === 'active');
    if (!quest) return;

    setActionPendingSlot(quest.slot);

    try {
      await ensureChain();

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
        abi: QUEST_ENGINE_ABI,
        functionName: 'completeQuest',
        args: [BigInt(tokenId)],
        gas: 500000n,
      });

      let won = false;
      let xpGained = 0;

      if (publicClient && hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        for (const log of receipt.logs) {
          try {
            if (log.data && log.data.length >= 130) {
              const wonHex = log.data.slice(2, 66);
              const xpHex = log.data.slice(66, 130);
              won = BigInt('0x' + wonHex) === 1n;
              xpGained = Number(BigInt('0x' + xpHex));
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      if (xpGained === 0) {
        xpGained = won ? quest.quest.win_xp : quest.quest.loss_xp;
      }

      const result = await completeQuest(tokenId, won, xpGained, hash);
      setCompleteZoneElement(quest.quest.zone_element);
      setCompleteOverlay(result);
      setTimeout(() => refetch(), 500);
    } catch (err) {
      console.error('[quest] Complete failed:', err);
    } finally {
      setActionPendingSlot(null);
    }
  }, [currentQuests, ensureChain, writeContractAsync, publicClient, completeQuest]);

  const handleAbandonQuest = useCallback(async (tokenId: number) => {
    const quest = currentQuests.find(q => q.tokenId === tokenId && q.status === 'active');
    if (!quest) return;

    setActionPendingSlot(quest.slot);

    try {
      await ensureChain();

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
        abi: QUEST_ENGINE_ABI,
        functionName: 'abandonQuest',
        args: [BigInt(tokenId)],
        gas: 200000n,
      });

      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      const result = await abandonQuest(tokenId);
      setCompleteZoneElement(quest.quest.zone_element);
      setCompleteOverlay(result);
      setTimeout(() => refetch(), 500);
    } catch (err) {
      console.error('[quest] Abandon failed:', err);
    } finally {
      setActionPendingSlot(null);
    }
  }, [currentQuests, ensureChain, writeContractAsync, publicClient, abandonQuest]);

  // ---- Not Connected State ----
  if (!isConnected) {
    return (
      <div className="min-h-screen px-4 py-6 sm:py-12">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Map className="w-8 h-8 text-frost-cyan" />
            <h1 className="text-3xl md:text-4xl font-display font-bold gradient-text">QUESTS</h1>
          </div>
          <p className="text-white/40 text-sm mb-8">Connect your wallet to start questing</p>
          <div className="glass-card inline-block p-8 text-center">
            <span className="text-4xl block mb-3">⚔️</span>
            <p className="text-white/30 text-xs font-pixel">8 Zones • Tier Progression • Boss Battles</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loading State ----
  if (isLoading && !progression) {
    return (
      <div className="min-h-screen px-4 py-6 sm:py-12 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-frost-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/30 text-xs font-pixel">Loading quest data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Map className="w-7 h-7 text-frost-cyan" />
            <h1 className="text-2xl md:text-3xl font-display font-bold gradient-text">QUESTS</h1>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-white/30 hover:text-white/60 transition-colors text-xs font-pixel disabled:opacity-30"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Stuck Warriors Recovery */}
        {stuckWarriors.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-pixel">
                {stuckWarriors.length} warrior{stuckWarriors.length > 1 ? 's' : ''} stuck in quest — claim or abandon to free them
              </span>
            </div>
            {recoveryError && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px]">
                {recoveryError}
              </div>
            )}
            <div className="space-y-2">
              {stuckWarriors.map(sw => {
                const now = Math.floor(Date.now() / 1000);
                const isReady = now >= sw.endsAt;
                return (
                  <div key={sw.tokenId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/20">
                    <div className="flex items-center gap-2">
                      <span className="text-white/60 text-xs font-pixel">#{sw.tokenId}</span>
                      <span className={`text-[10px] font-pixel ${isReady ? 'text-green-400' : 'text-amber-400'}`}>
                        {isReady ? 'Ready to claim' : 'In progress'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {isReady && (
                        <button
                          onClick={() => handleRecoverWarrior(sw.tokenId, true)}
                          disabled={recoveringId !== null}
                          className="btn-3d btn-3d-green !px-3 !py-1 !text-[9px] disabled:opacity-40"
                        >
                          {recoveringId === sw.tokenId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRecoverWarrior(sw.tokenId, false)}
                        disabled={recoveringId !== null}
                        className="px-3 py-1 rounded-lg border border-red-500/20 text-red-400/70 text-[9px] font-pixel hover:border-red-500/40 disabled:opacity-40"
                      >
                        {recoveringId === sw.tokenId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Abandon'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tier Progress Bar */}
        {progression && (
          <div className="mb-6 rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
            <TierProgressBar progression={progression} currentQuests={currentQuests} />
          </div>
        )}

        {/* Main content: 2-column on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left column: Zone Map + Quest Cards (2/3) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Zone Map */}
            {zones.length > 0 && (
              <ZoneMap
                zones={zones}
                currentQuests={currentQuests}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
                currentTier={progression?.currentTier ?? 0}
              />
            )}

            {/* Current Tier Quests */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-white text-sm uppercase tracking-wider">
                  Current Quests
                </h2>
                <div className="flex-1 h-px bg-white/[0.06]" />
                {progression && (
                  <span className="text-white/30 text-[10px] font-pixel">
                    Tier {progression.currentTier}
                  </span>
                )}
              </div>

              {currentQuests.length === 0 ? (
                <div className="text-center py-8 rounded-2xl border border-white/[0.04] bg-white/[0.01]">
                  <span className="text-3xl block mb-2">🗺️</span>
                  <p className="text-white/20 text-xs font-pixel">Your quest slots will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentQuests.map(quest => (
                    <QuestCard
                      key={quest.slot}
                      quest={quest}
                      onStart={handleStartQuest}
                      onComplete={handleCompleteQuest}
                      onAbandon={handleAbandonQuest}
                      isActionPending={actionPendingSlot === quest.slot && isActionPending}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Stats + History (1/3) */}
          <div className="space-y-6">
            {progression && <QuestStats progression={progression} />}

            {history.length > 0 && progression && (
              <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
                <QuestHistory history={history} currentTier={progression.currentTier} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warrior Selection Modal */}
      {warriorModalQuest && (
        <WarriorSelectModal
          quest={warriorModalQuest}
          isOpen={!!warriorModalQuest}
          onClose={() => setWarriorModalQuest(null)}
          onSelect={handleWarriorSelected}
          isPending={isActionPending}
        />
      )}

      {/* Quest Complete Overlay */}
      <QuestCompleteOverlay
        result={completeOverlay}
        zoneElement={completeZoneElement}
        onClose={() => setCompleteOverlay(null)}
      />
    </div>
  );
}
