'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, keccak256, encodePacked } from 'viem';
import { GAME_ENGINE_ABI } from '@/lib/contracts';
import { CONTRACT_ADDRESSES } from '@/lib/constants';

// Convert human-readable ABI to parsed format for wagmi v2/viem compatibility
// The viem library supports human-readable ABI strings natively in contract functions

const GAME_ENGINE_ADDRESS = CONTRACT_ADDRESSES.gameEngine as `0x${string}`;

export function useGameEngine() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createGame = (gameType: number, stakeInAvax: string) => {
    writeContract({
      address: GAME_ENGINE_ADDRESS,
      abi: GAME_ENGINE_ABI,
      functionName: 'createGame',
      args: [gameType],
      value: parseEther(stakeInAvax),
    });
  };

  const joinGame = (gameId: bigint, stakeInAvax: string) => {
    writeContract({
      address: GAME_ENGINE_ADDRESS,
      abi: GAME_ENGINE_ABI,
      functionName: 'joinGame',
      args: [gameId],
      value: parseEther(stakeInAvax),
    });
  };

  const commitMove = (gameId: bigint, move: number, salt: `0x${string}`) => {
    const commit = keccak256(encodePacked(['uint8', 'bytes32'], [move, salt]));
    writeContract({
      address: GAME_ENGINE_ADDRESS,
      abi: GAME_ENGINE_ABI,
      functionName: 'commitMove',
      args: [gameId, commit],
    });
  };

  const revealMove = (gameId: bigint, move: number, salt: `0x${string}`) => {
    writeContract({
      address: GAME_ENGINE_ADDRESS,
      abi: GAME_ENGINE_ABI,
      functionName: 'revealMove',
      args: [gameId, move, salt],
    });
  };

  const claimTimeout = (gameId: bigint) => {
    writeContract({
      address: GAME_ENGINE_ADDRESS,
      abi: GAME_ENGINE_ABI,
      functionName: 'claimTimeout',
      args: [gameId],
    });
  };

  return {
    createGame,
    joinGame,
    commitMove,
    revealMove,
    claimTimeout,
    hash,
    isPending,
    isConfirming,
    isSuccess,
  };
}

// Hook to read game data by ID
export function useGame(gameId: bigint) {
  return useReadContract({
    address: GAME_ENGINE_ADDRESS,
    abi: GAME_ENGINE_ABI,
    functionName: 'getGame',
    args: [gameId],
  });
}

// Hook to read a player's game IDs
export function usePlayerGames(address: `0x${string}` | undefined) {
  return useReadContract({
    address: GAME_ENGINE_ADDRESS,
    abi: GAME_ENGINE_ABI,
    functionName: 'getPlayerGames',
    args: address ? [address] : undefined,
  });
}

// Hook to read player stats (wins + total games)
export function usePlayerStats(address: `0x${string}` | undefined) {
  const wins = useReadContract({
    address: GAME_ENGINE_ADDRESS,
    abi: GAME_ENGINE_ABI,
    functionName: 'playerWins',
    args: address ? [address] : undefined,
  });
  const totalGames = useReadContract({
    address: GAME_ENGINE_ADDRESS,
    abi: GAME_ENGINE_ABI,
    functionName: 'playerTotalGames',
    args: address ? [address] : undefined,
  });

  return {
    wins: wins.data as bigint | undefined,
    totalGames: totalGames.data as bigint | undefined,
    isLoading: wins.isLoading || totalGames.isLoading,
    isError: wins.isError || totalGames.isError,
  };
}

// Hook to read total game count
export function useGameCounter() {
  return useReadContract({
    address: GAME_ENGINE_ADDRESS,
    abi: GAME_ENGINE_ABI,
    functionName: 'gameCounter',
  });
}

// Utility: generate a random salt for commit-reveal
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`;
}
