'use client';

// P1-lite: read the connected wallet's real FrostbiteHeroes NFTs and map them
// into AdventureHero shape. Same ownerOf-scan pattern as WorldLoginGate (the
// hero contract has no enumeration). Read-only — no transactions.

import { useMemo } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { HERO_CONTRACT, HERO_ABI } from '@/lib/game/nft/contracts';
import { heroFromChain } from './heroes';
import type { AdventureHero } from './types';

interface ChainHeroData {
  element: number;
  rarity: number;
  level: number;
  atk: number;
  def: number;
  spd: number;
}

export function useChainAdventureHeroes(): {
  heroes: AdventureHero[];
  isLoading: boolean;
  isConnected: boolean;
} {
  const { address } = useAccount();

  const { data: totalSupply } = useReadContract({
    address: HERO_CONTRACT,
    abi: HERO_ABI,
    functionName: 'totalSupply',
    chainId: 43114,
    query: { enabled: !!address },
  });

  const ownerOfContracts = useMemo(() => {
    if (!totalSupply || !address) return [];
    return Array.from({ length: Number(totalSupply) }, (_, i) => ({
      address: HERO_CONTRACT as `0x${string}`,
      abi: HERO_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(i + 1)] as const,
      chainId: 43114 as const,
    }));
  }, [totalSupply, address]);

  const { data: ownerResults, isLoading: ownersLoading } = useReadContracts({
    contracts: ownerOfContracts,
    query: { enabled: ownerOfContracts.length > 0 },
  });

  const ownedTokenIds = useMemo(() => {
    if (!ownerResults || !address) return [];
    const wallet = address.toLowerCase();
    const ids: number[] = [];
    ownerResults.forEach((r, i) => {
      if (r.status === 'success' && typeof r.result === 'string' && r.result.toLowerCase() === wallet) {
        ids.push(i + 1);
      }
    });
    return ids;
  }, [ownerResults, address]);

  const heroContracts = useMemo(
    () =>
      ownedTokenIds.map((tokenId) => ({
        address: HERO_CONTRACT as `0x${string}`,
        abi: HERO_ABI,
        functionName: 'getHero' as const,
        args: [BigInt(tokenId)] as const,
        chainId: 43114 as const,
      })),
    [ownedTokenIds]
  );

  const { data: heroResults, isLoading: heroesLoading } = useReadContracts({
    contracts: heroContracts,
    query: { enabled: heroContracts.length > 0 },
  });

  const heroes = useMemo<AdventureHero[]>(() => {
    if (!heroResults || ownedTokenIds.length === 0) return [];
    return ownedTokenIds
      .map((tokenId, i) => {
        const r = heroResults[i];
        if (r?.status !== 'success' || !r.result) return null;
        const d = r.result as unknown as ChainHeroData;
        return heroFromChain(tokenId, {
          element: Number(d.element),
          rarity: Number(d.rarity),
          level: Number(d.level),
          atk: Number(d.atk),
          def: Number(d.def),
          spd: Number(d.spd),
        });
      })
      .filter(Boolean) as AdventureHero[];
  }, [heroResults, ownedTokenIds]);

  return {
    heroes,
    isLoading: !!address && (ownersLoading || heroesLoading),
    isConnected: !!address,
  };
}
