'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES } from '@/lib/constants';
import { QUEST_ENGINE_ABI } from '@/lib/contracts';
import type {
  QuestDataResponse,
  QuestStartResponse,
  QuestCompleteResponse,
  OnChainProgression,
  CurrentQuest,
  QuestProgression,
  QuestZone,
  TierHistoryEntry,
} from '@/types/quest';

/* ---------------------------------------------------------------------------
 * useQuestData — Combines API + on-chain data for the quest system
 * ------------------------------------------------------------------------- */

interface UseQuestDataReturn {
  zones: QuestZone[];
  progression: QuestProgression | null;
  currentQuests: CurrentQuest[];
  history: TierHistoryEntry[];
  chainProgression: OnChainProgression | null;
  isLoading: boolean;
  isChainLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  startQuest: (slot: number, tokenId: number, txHash?: string) => Promise<QuestStartResponse>;
  completeQuest: (tokenId: number, won: boolean, xpGained: number, txHash?: string) => Promise<QuestCompleteResponse>;
  abandonQuest: (tokenId: number) => Promise<QuestCompleteResponse>;
}

export function useQuestData(): UseQuestDataReturn {
  const { address, isConnected } = useAccount();

  const [zones, setZones] = useState<QuestZone[]>([]);
  const [progression, setProgression] = useState<QuestProgression | null>(null);
  const [currentQuests, setCurrentQuests] = useState<CurrentQuest[]>([]);
  const [history, setHistory] = useState<TierHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  // On-chain progression read
  const {
    data: chainProgressionRaw,
    isLoading: isChainLoading,
    refetch: refetchChain,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
    abi: QUEST_ENGINE_ABI,
    functionName: 'getWalletProgression',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && CONTRACT_ADDRESSES.questEngine !== '0x0000000000000000000000000000000000000000',
    },
  });

  // Memoize chainProgression to prevent re-render loops
  const chainProgression: OnChainProgression | null = useMemo(() => {
    if (!chainProgressionRaw) return null;
    const raw = chainProgressionRaw as unknown as readonly bigint[];
    return {
      tier: raw[0],
      questsCompleted: raw[1],
      questsWon: raw[2],
      totalXP: raw[3],
      tierProgress: raw[4],
    };
  }, [chainProgressionRaw]);

  // Extract primitive tier value for dependency — avoids object reference issues
  const chainTier = chainProgression ? Number(chainProgression.tier) : undefined;

  // Fetch API data — depends on address + chainTier (primitive), NOT chainProgression object
  const fetchQuestData = useCallback(async () => {
    if (!address) {
      setZones([]);
      setProgression(null);
      setCurrentQuests([]);
      setHistory([]);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ wallet: address });
      if (chainTier !== undefined) params.set('chainTier', String(chainTier));

      const res = await fetch(`/avalanche/api/v1/quests?${params}`);
      if (!res.ok) throw new Error(`Quest API error: ${res.status}`);

      // Stale check — if another fetch started, discard this one
      if (fetchIdRef.current !== fetchId) return;

      const data: QuestDataResponse = await res.json();
      setZones(data.zones);
      setProgression(data.progression);
      setCurrentQuests(data.currentQuests);
      setHistory(data.history);
    } catch (err) {
      if (fetchIdRef.current !== fetchId) return;
      setError(err instanceof Error ? err.message : 'Failed to load quest data');
    } finally {
      if (fetchIdRef.current === fetchId) {
        setIsLoading(false);
      }
    }
  }, [address, chainTier]);

  // Auto-fetch once on connect/address/chainTier change
  useEffect(() => {
    if (isConnected && address) {
      fetchQuestData();
    }
  }, [isConnected, address, fetchQuestData]);

  // Refetch both chain + API
  const refetch = useCallback(async () => {
    await refetchChain();
    await fetchQuestData();
  }, [refetchChain, fetchQuestData]);

  // Stable refs for mutations (avoid re-creating callbacks when progression/refetch change)
  const progressionRef = useRef(progression);
  progressionRef.current = progression;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Start quest mutation
  const startQuest = useCallback(
    async (slot: number, tokenId: number, txHash?: string): Promise<QuestStartResponse> => {
      if (!address || !progressionRef.current) throw new Error('Not connected');

      const res = await fetch('/avalanche/api/v1/quests/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          tier: progressionRef.current.currentTier,
          slot,
          tokenId,
          txHash,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Start quest failed: ${res.status}`);
      }

      const data: QuestStartResponse = await res.json();
      await refetchRef.current();
      return data;
    },
    [address]
  );

  // Complete quest mutation
  const completeQuest = useCallback(
    async (tokenId: number, won: boolean, xpGained: number, txHash?: string): Promise<QuestCompleteResponse> => {
      if (!address) throw new Error('Not connected');

      const res = await fetch('/avalanche/api/v1/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          tokenId,
          won,
          xpGained,
          txHash,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Complete quest failed: ${res.status}`);
      }

      const data: QuestCompleteResponse = await res.json();
      await refetchRef.current();
      return data;
    },
    [address]
  );

  // Abandon quest mutation
  const abandonQuest = useCallback(
    async (tokenId: number): Promise<QuestCompleteResponse> => {
      if (!address) throw new Error('Not connected');

      const res = await fetch('/avalanche/api/v1/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          tokenId,
          abandoned: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Abandon quest failed: ${res.status}`);
      }

      const data: QuestCompleteResponse = await res.json();
      await refetchRef.current();
      return data;
    },
    [address]
  );

  return {
    zones,
    progression,
    currentQuests,
    history,
    chainProgression,
    isLoading,
    isChainLoading,
    error,
    refetch,
    startQuest,
    completeQuest,
    abandonQuest,
  };
}
