'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import { type Log, type Address } from 'viem';
import { CONTRACT_ADDRESSES } from '@/lib/constants';
import {
  FROSTBITE_WARRIOR_ABI,
  BATTLE_ENGINE_ABI,
  TEAM_BATTLE_ABI,
  MARKETPLACE_ABI,
  QUEST_ENGINE_ABI,
  BATCH_MINTER_ABI,
} from '@/lib/contracts';

/* ---------------------------------------------------------------------------
 * Event types emitted by the system
 * ------------------------------------------------------------------------- */

export type ContractEventName =
  // ArenaWarrior
  | 'WarriorMinted'
  | 'BattleRecorded'
  | 'LevelUp'
  | 'WarriorsMerged'
  // BattleEngine
  | 'BattleCreated'
  | 'BattleJoined'
  | 'BattleResolved'
  | 'BattleCancelled'
  // TeamBattleEngine
  | 'TeamBattleCreated'
  | 'TeamBattleJoined'
  | 'TeamBattleResolved'
  | 'TeamBattleCancelled'
  // Marketplace
  | 'ItemListed'
  | 'ListingCancelled'
  | 'ItemSold'
  | 'OfferMade'
  | 'OfferAccepted'
  | 'AuctionCreated'
  | 'BidPlaced'
  | 'AuctionEnded'
  // QuestEngine
  | 'QuestStarted'
  | 'QuestCompleted'
  // BatchMinter
  | 'BatchMinted';

export interface ContractEvent {
  name: ContractEventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: string;
  address: Address;
  timestamp: number; // client-side arrival time
}

type EventCallback = (event: ContractEvent) => void;

/* ---------------------------------------------------------------------------
 * Global event bus — singleton so multiple components share one set of watchers
 * ------------------------------------------------------------------------- */

const listeners = new Set<EventCallback>();
let watchersActive = false;
const unwatchFns: (() => void)[] = [];

function broadcast(event: ContractEvent) {
  listeners.forEach((cb) => {
    try {
      cb(event);
    } catch {
      // listener errors should not break the bus
    }
  });
}

function toContractEvent(name: ContractEventName, log: Log): ContractEvent {
  return {
    name,
    args: (log as unknown as { args: Record<string, unknown> }).args ?? {},
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? '0x',
    address: log.address,
    timestamp: Date.now(),
  };
}

/* ---------------------------------------------------------------------------
 * Start / stop watchers
 * ------------------------------------------------------------------------- */

function startWatchers(publicClient: ReturnType<typeof usePublicClient>) {
  if (watchersActive || !publicClient) return;
  watchersActive = true;

  const watch = <T extends readonly unknown[]>(
    address: Address,
    abi: T,
    eventName: string,
    contractEventName: ContractEventName,
  ) => {
    try {
      const unwatch = publicClient.watchContractEvent({
        address,
        abi: abi as any,
        eventName,
        onLogs: (logs) => {
          for (const log of logs) {
            broadcast(toContractEvent(contractEventName, log as unknown as Log));
          }
        },
        pollingInterval: 4_000, // 4s — Avalanche block time is ~2s
      });
      unwatchFns.push(unwatch);
    } catch {
      // contract address might be zero — skip silently
    }
  };

  const addr = CONTRACT_ADDRESSES;
  const ZERO = '0x0000000000000000000000000000000000000000';

  // ArenaWarrior events
  if (addr.frostbiteWarrior !== ZERO) {
    watch(addr.frostbiteWarrior as Address, FROSTBITE_WARRIOR_ABI, 'WarriorMinted', 'WarriorMinted');
    watch(addr.frostbiteWarrior as Address, FROSTBITE_WARRIOR_ABI, 'BattleRecorded', 'BattleRecorded');
    watch(addr.frostbiteWarrior as Address, FROSTBITE_WARRIOR_ABI, 'LevelUp', 'LevelUp');
    watch(addr.frostbiteWarrior as Address, FROSTBITE_WARRIOR_ABI, 'WarriorsMerged', 'WarriorsMerged');
  }

  // BattleEngine events
  if (addr.battleEngine !== ZERO) {
    watch(addr.battleEngine as Address, BATTLE_ENGINE_ABI, 'BattleCreated', 'BattleCreated');
    watch(addr.battleEngine as Address, BATTLE_ENGINE_ABI, 'BattleJoined', 'BattleJoined');
    watch(addr.battleEngine as Address, BATTLE_ENGINE_ABI, 'BattleResolved', 'BattleResolved');
    watch(addr.battleEngine as Address, BATTLE_ENGINE_ABI, 'BattleCancelled', 'BattleCancelled');
  }

  // TeamBattleEngine events
  if (addr.teamBattleEngine !== ZERO) {
    watch(addr.teamBattleEngine as Address, TEAM_BATTLE_ABI, 'TeamBattleCreated', 'TeamBattleCreated');
    watch(addr.teamBattleEngine as Address, TEAM_BATTLE_ABI, 'TeamBattleJoined', 'TeamBattleJoined');
    watch(addr.teamBattleEngine as Address, TEAM_BATTLE_ABI, 'TeamBattleResolved', 'TeamBattleResolved');
    watch(addr.teamBattleEngine as Address, TEAM_BATTLE_ABI, 'TeamBattleCancelled', 'TeamBattleCancelled');
  }

  // Marketplace events
  if (addr.marketplace !== ZERO) {
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'ItemListed', 'ItemListed');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'ListingCancelled', 'ListingCancelled');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'ItemSold', 'ItemSold');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'OfferMade', 'OfferMade');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'OfferAccepted', 'OfferAccepted');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'AuctionCreated', 'AuctionCreated');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'BidPlaced', 'BidPlaced');
    watch(addr.marketplace as Address, MARKETPLACE_ABI, 'AuctionEnded', 'AuctionEnded');
  }

  // QuestEngine events
  if (addr.questEngine !== ZERO) {
    watch(addr.questEngine as Address, QUEST_ENGINE_ABI, 'QuestStarted', 'QuestStarted');
    watch(addr.questEngine as Address, QUEST_ENGINE_ABI, 'QuestCompleted', 'QuestCompleted');
  }

  // BatchMinter events
  if (addr.batchMinter !== ZERO) {
    watch(addr.batchMinter as Address, BATCH_MINTER_ABI, 'BatchMinted', 'BatchMinted');
  }
}

function stopWatchers() {
  unwatchFns.forEach((fn) => fn());
  unwatchFns.length = 0;
  watchersActive = false;
}

/* ---------------------------------------------------------------------------
 * React hooks
 * ------------------------------------------------------------------------- */

/**
 * Initializes contract event watchers when the first component mounts.
 * Call this once near the app root (e.g. in a provider or layout).
 */
export function useContractEventWatcher() {
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!publicClient) return;

    // Only start if no watchers are active yet
    if (!watchersActive) {
      startWatchers(publicClient);
    }

    return () => {
      // Only stop if nobody else is listening
      if (listeners.size === 0) {
        stopWatchers();
      }
    };
  }, [publicClient]);
}

/**
 * Subscribe to specific contract events.
 *
 * @param eventNames - Array of event names to listen to (empty = all events)
 * @param callback - Called for each matching event
 *
 * @example
 * useOnContractEvent(['BattleCreated', 'BattleResolved'], (event) => {
 *   console.log(event.name, event.args);
 *   refetchBattles();
 * });
 */
export function useOnContractEvent(
  eventNames: ContractEventName[],
  callback: EventCallback,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const filterSet = useRef(new Set(eventNames));
  useEffect(() => {
    filterSet.current = new Set(eventNames);
  }, [eventNames.join(',')]);

  useEffect(() => {
    const handler: EventCallback = (event) => {
      if (filterSet.current.size === 0 || filterSet.current.has(event.name)) {
        callbackRef.current(event);
      }
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);
}

/**
 * Subscribe to ALL contract events.
 */
export function useOnAnyContractEvent(callback: EventCallback) {
  return useOnContractEvent([], callback);
}
