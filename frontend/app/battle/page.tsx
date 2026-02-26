'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sword,
  Shield,
  Zap,
  Sparkles,
  Trophy,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { ELEMENTS, MIN_BATTLE_STAKE, ELEMENT_ADVANTAGES } from '@/lib/constants';
import { BATTLE_ENGINE_ABI, ARENA_WARRIOR_ABI } from '@/lib/contracts';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { cn, shortenAddress } from '@/lib/utils';

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

interface Battle {
  id: number;
  player1: string;
  player2: string;
  nft1: number;
  nft2: number;
  stake: bigint;
  winner: string;
  resolved: boolean;
  createdAt: number;
  resolvedAt: number;
}

/* ---------------------------------------------------------------------------
 * Mock Data
 * ------------------------------------------------------------------------- */

const MOCK_WARRIORS: Warrior[] = [
  { tokenId: 1, attack: 85, defense: 72, speed: 68, element: 0, specialPower: 90, level: 5, experience: 2400, battleWins: 12, battleLosses: 3, powerScore: 315 },
  { tokenId: 7, attack: 60, defense: 88, speed: 75, element: 1, specialPower: 82, level: 4, experience: 1800, battleWins: 9, battleLosses: 5, powerScore: 305 },
  { tokenId: 14, attack: 92, defense: 55, speed: 90, element: 5, specialPower: 78, level: 6, experience: 3200, battleWins: 18, battleLosses: 7, powerScore: 315 },
  { tokenId: 23, attack: 70, defense: 80, speed: 65, element: 3, specialPower: 85, level: 3, experience: 1200, battleWins: 6, battleLosses: 4, powerScore: 300 },
];

const MOCK_OPEN_BATTLES: (Battle & { creatorWarrior: Warrior })[] = [
  {
    id: 1, player1: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', player2: '0x0000000000000000000000000000000000000000',
    nft1: 5, nft2: 0, stake: BigInt('10000000000000000'), winner: '0x0000000000000000000000000000000000000000',
    resolved: false, createdAt: Math.floor(Date.now() / 1000) - 300, resolvedAt: 0,
    creatorWarrior: { tokenId: 5, attack: 78, defense: 82, speed: 70, element: 0, specialPower: 88, level: 4, experience: 2000, battleWins: 10, battleLosses: 4, powerScore: 318 },
  },
  {
    id: 2, player1: '0xabcdef1234567890abcdef1234567890abcdef34', player2: '0x0000000000000000000000000000000000000000',
    nft1: 12, nft2: 0, stake: BigInt('50000000000000000'), winner: '0x0000000000000000000000000000000000000000',
    resolved: false, createdAt: Math.floor(Date.now() / 1000) - 600, resolvedAt: 0,
    creatorWarrior: { tokenId: 12, attack: 95, defense: 60, speed: 88, element: 5, specialPower: 92, level: 7, experience: 4200, battleWins: 22, battleLosses: 8, powerScore: 335 },
  },
  {
    id: 3, player1: '0x9876543210fedcba9876543210fedcba98765432', player2: '0x0000000000000000000000000000000000000000',
    nft1: 8, nft2: 0, stake: BigInt('20000000000000000'), winner: '0x0000000000000000000000000000000000000000',
    resolved: false, createdAt: Math.floor(Date.now() / 1000) - 120, resolvedAt: 0,
    creatorWarrior: { tokenId: 8, attack: 65, defense: 90, speed: 55, element: 4, specialPower: 75, level: 3, experience: 1500, battleWins: 7, battleLosses: 6, powerScore: 285 },
  },
  {
    id: 4, player1: '0xfedcba9876543210fedcba9876543210fedcba98', player2: '0x0000000000000000000000000000000000000000',
    nft1: 19, nft2: 0, stake: BigInt('100000000000000000'), winner: '0x0000000000000000000000000000000000000000',
    resolved: false, createdAt: Math.floor(Date.now() / 1000) - 45, resolvedAt: 0,
    creatorWarrior: { tokenId: 19, attack: 88, defense: 75, speed: 82, element: 7, specialPower: 95, level: 8, experience: 5600, battleWins: 30, battleLosses: 10, powerScore: 340 },
  },
];

const MOCK_HISTORY: (Battle & { myWarrior: Warrior; theirWarrior: Warrior })[] = [
  {
    id: 101, player1: '0xYOU', player2: '0xaaa111bbb222ccc333ddd444eee555fff666777',
    nft1: 1, nft2: 5, stake: BigInt('10000000000000000'),
    winner: '0xYOU', resolved: true,
    createdAt: Math.floor(Date.now() / 1000) - 86400, resolvedAt: Math.floor(Date.now() / 1000) - 86380,
    myWarrior: { tokenId: 1, attack: 85, defense: 72, speed: 68, element: 0, specialPower: 90, level: 5, experience: 2400, battleWins: 12, battleLosses: 3, powerScore: 315 },
    theirWarrior: { tokenId: 5, attack: 78, defense: 82, speed: 70, element: 2, specialPower: 88, level: 4, experience: 2000, battleWins: 10, battleLosses: 4, powerScore: 318 },
  },
  {
    id: 102, player1: '0xbbb222ccc333ddd444eee555fff666777aaa111b', player2: '0xYOU',
    nft1: 12, nft2: 7, stake: BigInt('20000000000000000'),
    winner: '0xbbb222ccc333ddd444eee555fff666777aaa111b', resolved: true,
    createdAt: Math.floor(Date.now() / 1000) - 172800, resolvedAt: Math.floor(Date.now() / 1000) - 172780,
    myWarrior: { tokenId: 7, attack: 60, defense: 88, speed: 75, element: 1, specialPower: 82, level: 4, experience: 1800, battleWins: 9, battleLosses: 5, powerScore: 305 },
    theirWarrior: { tokenId: 12, attack: 95, defense: 60, speed: 88, element: 5, specialPower: 92, level: 7, experience: 4200, battleWins: 22, battleLosses: 8, powerScore: 335 },
  },
  {
    id: 103, player1: '0xYOU', player2: '0xccc333ddd444eee555fff666777aaa111bbb222c',
    nft1: 14, nft2: 8, stake: BigInt('50000000000000000'),
    winner: '0xYOU', resolved: true,
    createdAt: Math.floor(Date.now() / 1000) - 259200, resolvedAt: Math.floor(Date.now() / 1000) - 259180,
    myWarrior: { tokenId: 14, attack: 92, defense: 55, speed: 90, element: 5, specialPower: 78, level: 6, experience: 3200, battleWins: 18, battleLosses: 7, powerScore: 315 },
    theirWarrior: { tokenId: 8, attack: 65, defense: 90, speed: 55, element: 4, specialPower: 75, level: 3, experience: 1500, battleWins: 7, battleLosses: 6, powerScore: 285 },
  },
  {
    id: 104, player1: '0xddd444eee555fff666777aaa111bbb222ccc333d', player2: '0xYOU',
    nft1: 19, nft2: 23, stake: BigInt('30000000000000000'),
    winner: '0xYOU', resolved: true,
    createdAt: Math.floor(Date.now() / 1000) - 345600, resolvedAt: Math.floor(Date.now() / 1000) - 345580,
    myWarrior: { tokenId: 23, attack: 70, defense: 80, speed: 65, element: 3, specialPower: 85, level: 3, experience: 1200, battleWins: 6, battleLosses: 4, powerScore: 300 },
    theirWarrior: { tokenId: 19, attack: 88, defense: 75, speed: 82, element: 7, specialPower: 95, level: 8, experience: 5600, battleWins: 30, battleLosses: 10, powerScore: 340 },
  },
];

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hasElementAdvantage(attackerElement: number, defenderElement: number): boolean {
  return ELEMENT_ADVANTAGES[attackerElement] === defenderElement;
}

/* ---------------------------------------------------------------------------
 * Warrior Mini Card
 * ------------------------------------------------------------------------- */

function WarriorMiniCard({
  warrior,
  selected,
  onClick,
  size = 'normal',
}: {
  warrior: Warrior;
  selected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
}) {
  const element = getElement(warrior.element);
  const isSmall = size === 'small';

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'relative rounded-xl text-left transition-all overflow-hidden',
        isSmall ? 'p-2.5' : 'p-3',
        selected
          ? 'ring-2 ring-arena-cyan shadow-[0_0_20px_rgba(0,240,255,0.2)]'
          : 'ring-1 ring-white/10 hover:ring-white/20',
        'bg-gradient-to-br from-white/[0.04] to-transparent',
      )}
      style={{
        borderLeft: `3px solid ${element.glowColor.replace('0.3', '0.8')}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className={isSmall ? 'text-lg' : 'text-2xl'}>{element.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'font-mono font-bold text-white',
              isSmall ? 'text-xs' : 'text-sm',
            )}>
              #{warrior.tokenId}
            </span>
            <span className={cn(
              'font-semibold bg-gradient-to-r bg-clip-text text-transparent',
              element.color,
              isSmall ? 'text-[10px]' : 'text-xs',
            )}>
              {element.name}
            </span>
          </div>
          <div className={cn(
            'flex items-center gap-2 text-white/50 font-mono',
            isSmall ? 'text-[10px] gap-1.5' : 'text-xs',
          )}>
            <span className="flex items-center gap-0.5">
              <Zap className={isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              {warrior.powerScore}
            </span>
            <span>Lv.{warrior.level}</span>
          </div>
        </div>
      </div>

      {selected && (
        <motion.div
          layoutId="warrior-selected"
          className="absolute inset-0 rounded-xl ring-2 ring-arena-cyan pointer-events-none"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

/* ---------------------------------------------------------------------------
 * Warrior Stats Preview
 * ------------------------------------------------------------------------- */

function WarriorStatsPreview({ warrior }: { warrior: Warrior }) {
  const element = getElement(warrior.element);
  const stats = [
    { label: 'ATK', value: warrior.attack, color: 'bg-red-500' },
    { label: 'DEF', value: warrior.defense, color: 'bg-blue-500' },
    { label: 'SPD', value: warrior.speed, color: 'bg-green-500' },
    { label: 'SPC', value: warrior.specialPower, color: 'bg-purple-500' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 mt-4"
      style={{ boxShadow: `0 0 40px ${element.glowColor}` }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{element.emoji}</span>
        <div>
          <h4 className="font-display font-bold text-white">
            Warrior #{warrior.tokenId}
          </h4>
          <span className={cn(
            'text-xs font-semibold bg-gradient-to-r bg-clip-text text-transparent',
            element.color,
          )}>
            {element.name} Element
          </span>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xl font-mono font-bold text-arena-cyan">
            {warrior.powerScore}
          </div>
          <div className="text-[10px] uppercase text-white/40 tracking-wider">Power Score</div>
        </div>
      </div>

      <div className="space-y-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-white/40 w-8">{stat.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', stat.color)}
                initial={{ width: 0 }}
                animate={{ width: `${stat.value}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs font-mono text-white/60 w-7 text-right">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5 text-xs text-white/40">
        <span>Level {warrior.level}</span>
        <span>{warrior.battleWins}W / {warrior.battleLosses}L</span>
        <span>{warrior.experience} XP</span>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Battle Result Modal
 * ------------------------------------------------------------------------- */

function BattleResultModal({
  isOpen,
  onClose,
  myWarrior,
  theirWarrior,
  isWinner,
  stakeAmount,
}: {
  isOpen: boolean;
  onClose: () => void;
  myWarrior: Warrior;
  theirWarrior: Warrior;
  isWinner: boolean;
  stakeAmount: string;
}) {
  const myElement = getElement(myWarrior.element);
  const theirElement = getElement(theirWarrior.element);
  const iHaveAdvantage = hasElementAdvantage(myWarrior.element, theirWarrior.element);
  const theyHaveAdvantage = hasElementAdvantage(theirWarrior.element, myWarrior.element);

  // Combat score breakdown
  const myBaseScore = myWarrior.attack + myWarrior.defense + myWarrior.speed + myWarrior.specialPower;
  const theirBaseScore = theirWarrior.attack + theirWarrior.defense + theirWarrior.speed + theirWarrior.specialPower;
  const myBonus = iHaveAdvantage ? Math.round(myBaseScore * 0.15) : 0;
  const theirBonus = theyHaveAdvantage ? Math.round(theirBaseScore * 0.15) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-2xl glass-card p-6 sm:p-8 overflow-hidden"
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {/* Confetti-like particles for winner */}
            {isWinner && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      background: ['#00f0ff', '#7b2ff7', '#ff2d87', '#ffd700', '#00ff88'][i % 5],
                      left: `${Math.random() * 100}%`,
                      top: `-5%`,
                    }}
                    animate={{
                      y: ['0vh', `${60 + Math.random() * 40}vh`],
                      x: [0, (Math.random() - 0.5) * 200],
                      rotate: [0, Math.random() * 720],
                      opacity: [1, 0],
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      delay: Math.random() * 0.8,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Result Header */}
            <motion.div
              className="text-center mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
            >
              {isWinner ? (
                <>
                  <Trophy className="w-12 h-12 text-arena-gold mx-auto mb-2" />
                  <h2 className="font-display text-3xl sm:text-4xl font-black text-arena-gold text-glow-green">
                    VICTORY!
                  </h2>
                  <p className="text-arena-green text-sm mt-1 font-semibold">
                    +{stakeAmount} AVAX earned
                  </p>
                </>
              ) : (
                <>
                  <Shield className="w-12 h-12 text-arena-red mx-auto mb-2" />
                  <h2 className="font-display text-3xl sm:text-4xl font-black text-arena-red">
                    DEFEAT
                  </h2>
                  <p className="text-white/40 text-sm mt-1">
                    -{stakeAmount} AVAX
                  </p>
                </>
              )}
            </motion.div>

            {/* VS Screen */}
            <div className="flex items-center gap-4 sm:gap-6 justify-center mb-6">
              {/* My Warrior */}
              <motion.div
                className={cn(
                  'flex-1 glass-card p-4 text-center',
                  isWinner ? 'ring-2 ring-arena-green/50' : 'ring-1 ring-arena-red/30 opacity-70',
                )}
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
                style={{ boxShadow: isWinner ? `0 0 30px ${myElement.glowColor}` : 'none' }}
              >
                <span className="text-4xl block mb-2">{myElement.emoji}</span>
                <span className="text-xs font-mono text-arena-cyan">#{myWarrior.tokenId}</span>
                <div className={cn(
                  'text-xs font-semibold mt-1 bg-gradient-to-r bg-clip-text text-transparent',
                  myElement.color,
                )}>
                  {myElement.name}
                </div>
                <div className="text-lg font-mono font-bold text-white mt-1">{myWarrior.powerScore}</div>
                <div className="text-[10px] text-white/30 uppercase">Power</div>
              </motion.div>

              {/* VS */}
              <motion.div
                className="flex-shrink-0"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-arena-pink to-arena-purple flex items-center justify-center">
                  <span className="font-display font-black text-white text-lg sm:text-xl">VS</span>
                </div>
              </motion.div>

              {/* Their Warrior */}
              <motion.div
                className={cn(
                  'flex-1 glass-card p-4 text-center',
                  !isWinner ? 'ring-2 ring-arena-green/50' : 'ring-1 ring-arena-red/30 opacity-70',
                )}
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
                style={{ boxShadow: !isWinner ? `0 0 30px ${theirElement.glowColor}` : 'none' }}
              >
                <span className="text-4xl block mb-2">{theirElement.emoji}</span>
                <span className="text-xs font-mono text-white/60">#{theirWarrior.tokenId}</span>
                <div className={cn(
                  'text-xs font-semibold mt-1 bg-gradient-to-r bg-clip-text text-transparent',
                  theirElement.color,
                )}>
                  {theirElement.name}
                </div>
                <div className="text-lg font-mono font-bold text-white mt-1">{theirWarrior.powerScore}</div>
                <div className="text-[10px] text-white/30 uppercase">Power</div>
              </motion.div>
            </div>

            {/* Combat Score Breakdown */}
            <motion.div
              className="bg-white/[0.03] rounded-xl p-4 mb-6 border border-white/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <h4 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-semibold">
                Combat Breakdown
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/40 text-xs mb-1">Your Score</div>
                  <div className="font-mono">
                    <span className="text-white font-bold">{myBaseScore}</span>
                    {myBonus > 0 && (
                      <span className="text-arena-green ml-1">+{myBonus}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white/40 text-xs mb-1">Opponent Score</div>
                  <div className="font-mono">
                    <span className="text-white font-bold">{theirBaseScore}</span>
                    {theirBonus > 0 && (
                      <span className="text-arena-green ml-1">+{theirBonus}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Element Advantage */}
              {(iHaveAdvantage || theyHaveAdvantage) && (
                <div className={cn(
                  'mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs',
                  iHaveAdvantage ? 'text-arena-green' : 'text-arena-red',
                )}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {iHaveAdvantage
                    ? `${myElement.name} has advantage over ${theirElement.name}! (+15% bonus)`
                    : `${theirElement.name} has advantage over ${myElement.name}! (+15% bonus)`
                  }
                </div>
              )}
            </motion.div>

            {/* Close Button */}
            <motion.button
              onClick={onClose}
              className="w-full btn-primary text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isWinner ? 'Claim Victory' : 'Return to Arena'}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Sections
 * ------------------------------------------------------------------------- */

function HeroSection() {
  return (
    <section className="relative text-center py-16 sm:py-20 px-4 overflow-hidden">
      {/* Background glow orbs */}
      <div className="orb w-80 h-80 bg-arena-pink top-0 -left-32 opacity-20" />
      <div className="orb w-96 h-96 bg-arena-purple -top-20 -right-40 opacity-20" style={{ animationDelay: '3s' }} />

      <motion.div
        className="relative z-10 max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Sword className="w-8 h-8 text-arena-pink" />
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black">
            <span className="gradient-text">BATTLE ARENA</span>
          </h1>
          <Sword className="w-8 h-8 text-arena-pink transform scale-x-[-1]" />
        </div>

        <p className="text-lg sm:text-xl text-white/50 mb-8 font-medium">
          Stake AVAX. Battle NFTs. Claim Victory.
        </p>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
          {[
            { label: 'Total Battles', value: '12,847', icon: Sword },
            { label: 'Active Battles', value: '23', icon: Zap },
            { label: 'Total Staked', value: '584 AVAX', icon: Sparkles },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="stat-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <stat.icon className="w-5 h-5 text-arena-cyan mx-auto mb-1.5" />
              <div className="text-lg sm:text-xl font-mono font-bold text-white">{stat.value}</div>
              <div className="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mt-0.5">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Create Battle Section
 * ------------------------------------------------------------------------- */

function CreateBattleSection({
  warriors,
  isConnected,
}: {
  warriors: Warrior[];
  isConnected: boolean;
}) {
  const [selectedWarrior, setSelectedWarrior] = useState<Warrior | null>(null);
  const [stakeAmount, setStakeAmount] = useState(MIN_BATTLE_STAKE);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(() => {
    if (!selectedWarrior) return;
    setIsCreating(true);
    // In production, this would call the contract
    setTimeout(() => setIsCreating(false), 2000);
  }, [selectedWarrior]);

  const isValidStake = useMemo(() => {
    const amount = parseFloat(stakeAmount);
    return !isNaN(amount) && amount >= parseFloat(MIN_BATTLE_STAKE);
  }, [stakeAmount]);

  return (
    <section className="px-4 pb-16">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Sword className="w-5 h-5 text-arena-cyan" />
            <h2 className="font-display text-2xl font-bold text-white">Create Battle</h2>
          </div>

          <div className="glass-card p-6">
            {!isConnected ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 text-lg font-semibold mb-2">Wallet Not Connected</p>
                <p className="text-white/25 text-sm">Connect your wallet to create battles and stake AVAX</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Warrior Selection */}
                <div>
                  <label className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-3 block">
                    Select Your Warrior
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {warriors.map((w) => (
                      <WarriorMiniCard
                        key={w.tokenId}
                        warrior={w}
                        selected={selectedWarrior?.tokenId === w.tokenId}
                        onClick={() => setSelectedWarrior(w)}
                      />
                    ))}
                  </div>

                  {warriors.length === 0 && (
                    <div className="text-center py-8 text-white/30 text-sm">
                      <p>No warriors found. Mint one first!</p>
                    </div>
                  )}
                </div>

                {/* Right: Stake & Action */}
                <div className="flex flex-col">
                  {/* Stake Input */}
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2 block">
                      Stake Amount (AVAX)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        step="0.001"
                        min={MIN_BATTLE_STAKE}
                        className={cn(
                          'w-full bg-white/[0.04] border rounded-xl px-4 py-3 font-mono text-white',
                          'focus:outline-none focus:ring-2 transition-all',
                          isValidStake
                            ? 'border-white/10 focus:ring-arena-cyan/40 focus:border-arena-cyan/40'
                            : 'border-arena-red/30 focus:ring-arena-red/40',
                        )}
                        placeholder={MIN_BATTLE_STAKE}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-mono">
                        AVAX
                      </span>
                    </div>
                    <p className="text-[10px] text-white/30 mt-1.5">
                      Minimum stake: {MIN_BATTLE_STAKE} AVAX
                    </p>
                  </div>

                  {/* Quick Stake Buttons */}
                  <div className="flex gap-2 mb-4">
                    {['0.01', '0.05', '0.1', '0.5'].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setStakeAmount(amount)}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-xs font-mono transition-all',
                          stakeAmount === amount
                            ? 'bg-arena-cyan/20 text-arena-cyan border border-arena-cyan/30'
                            : 'bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06] hover:text-white/60',
                        )}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>

                  {/* Selected warrior preview */}
                  <div className="flex-1">
                    {selectedWarrior ? (
                      <WarriorStatsPreview warrior={selectedWarrior} />
                    ) : (
                      <div className="glass-card p-6 mt-4 flex items-center justify-center h-[180px]">
                        <p className="text-white/20 text-sm text-center">
                          Select a warrior to see stats
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Create Button */}
                  <motion.button
                    onClick={handleCreate}
                    disabled={!selectedWarrior || !isValidStake || isCreating}
                    className={cn(
                      'mt-4 w-full py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2',
                      selectedWarrior && isValidStake && !isCreating
                        ? 'btn-primary'
                        : 'bg-white/5 text-white/20 cursor-not-allowed',
                    )}
                    whileHover={selectedWarrior && isValidStake ? { scale: 1.02 } : {}}
                    whileTap={selectedWarrior && isValidStake ? { scale: 0.98 } : {}}
                  >
                    {isCreating ? (
                      <motion.div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : (
                      <>
                        <Sword className="w-4 h-4" />
                        Create Battle
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Open Battles Section
 * ------------------------------------------------------------------------- */

function OpenBattlesSection({
  battles,
  warriors,
  isConnected,
}: {
  battles: (Battle & { creatorWarrior: Warrior })[];
  warriors: Warrior[];
  isConnected: boolean;
}) {
  const [joiningBattleId, setJoiningBattleId] = useState<number | null>(null);
  const [selectedJoinWarrior, setSelectedJoinWarrior] = useState<Warrior | null>(null);

  const handleJoin = useCallback((battleId: number) => {
    if (!selectedJoinWarrior) return;
    // In production, call joinBattle on the contract
    setJoiningBattleId(null);
    setSelectedJoinWarrior(null);
  }, [selectedJoinWarrior]);

  return (
    <section className="px-4 pb-16">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-arena-purple" />
            <h2 className="font-display text-2xl font-bold text-white">Open Battles</h2>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-arena-green/10 text-arena-green text-xs font-mono font-bold">
              {battles.length} available
            </span>
          </div>

          {battles.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Sword className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-white/30">No open battles. Be the first to create one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {battles.map((battle, i) => {
                const element = getElement(battle.creatorWarrior.element);
                const stakeFormatted = formatEther(battle.stake);
                const isJoining = joiningBattleId === battle.id;

                return (
                  <motion.div
                    key={battle.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="glass-card p-5 flex flex-col relative overflow-hidden group"
                    style={{
                      borderTop: `3px solid ${element.glowColor.replace('0.3', '0.6')}`,
                    }}
                  >
                    {/* Glow effect on hover */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse at top, ${element.glowColor}, transparent 70%)`,
                      }}
                    />

                    <div className="relative z-10">
                      {/* Creator info */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">{element.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <span className={cn(
                            'text-xs font-semibold bg-gradient-to-r bg-clip-text text-transparent',
                            element.color,
                          )}>
                            {element.name}
                          </span>
                          <div className="text-[10px] text-white/30 font-mono truncate">
                            {shortenAddress(battle.player1)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-arena-cyan text-sm">
                            #{battle.creatorWarrior.tokenId}
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-white/[0.03] rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-white/30 uppercase">Power</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {battle.creatorWarrior.powerScore}
                          </div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-white/30 uppercase">Level</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {battle.creatorWarrior.level}
                          </div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-white/30 uppercase">W/L</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {battle.creatorWarrior.battleWins}/{battle.creatorWarrior.battleLosses}
                          </div>
                        </div>
                      </div>

                      {/* Stake & Time */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-arena-gold" />
                          <span className="font-mono font-bold text-arena-gold text-sm">
                            {stakeFormatted} AVAX
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-white/30 text-[10px]">
                          <Clock className="w-3 h-3" />
                          {timeAgo(battle.createdAt)}
                        </div>
                      </div>

                      {/* Join Battle */}
                      <AnimatePresence mode="wait">
                        {isJoining ? (
                          <motion.div
                            key="joining"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-2"
                          >
                            <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold block">
                              Choose Your Warrior
                            </label>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {warriors.map((w) => (
                                <WarriorMiniCard
                                  key={w.tokenId}
                                  warrior={w}
                                  selected={selectedJoinWarrior?.tokenId === w.tokenId}
                                  onClick={() => setSelectedJoinWarrior(w)}
                                  size="small"
                                />
                              ))}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => {
                                  setJoiningBattleId(null);
                                  setSelectedJoinWarrior(null);
                                }}
                                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white/5 text-white/40 hover:bg-white/10 transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleJoin(battle.id)}
                                disabled={!selectedJoinWarrior}
                                className={cn(
                                  'flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1',
                                  selectedJoinWarrior
                                    ? 'bg-gradient-to-r from-arena-cyan to-arena-purple text-white'
                                    : 'bg-white/5 text-white/20 cursor-not-allowed',
                                )}
                              >
                                <Sword className="w-3 h-3" />
                                Fight!
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.button
                            key="join-btn"
                            onClick={() => {
                              if (!isConnected) return;
                              setJoiningBattleId(battle.id);
                            }}
                            className={cn(
                              'w-full py-2.5 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                              isConnected
                                ? 'btn-neon btn-neon-cyan'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={isConnected ? { scale: 1.03 } : {}}
                            whileTap={isConnected ? { scale: 0.97 } : {}}
                          >
                            <Sword className="w-3.5 h-3.5" />
                            {isConnected ? 'Join Battle' : 'Connect Wallet'}
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Battle History Section
 * ------------------------------------------------------------------------- */

function BattleHistorySection({
  history,
  isConnected,
  onViewResult,
}: {
  history: (Battle & { myWarrior: Warrior; theirWarrior: Warrior })[];
  isConnected: boolean;
  onViewResult: (battle: Battle & { myWarrior: Warrior; theirWarrior: Warrior }) => void;
}) {
  if (!isConnected) {
    return (
      <section className="px-4 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-arena-gold" />
            <h2 className="font-display text-2xl font-bold text-white">Battle History</h2>
          </div>
          <div className="glass-card p-12 text-center">
            <Clock className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-white/30">Connect wallet to view your battle history</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-16">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-arena-gold" />
            <h2 className="font-display text-2xl font-bold text-white">Battle History</h2>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="arena-table">
                <thead>
                  <tr>
                    <th>Battle</th>
                    <th>Opponent</th>
                    <th>My NFT</th>
                    <th>Their NFT</th>
                    <th className="text-right">Stake</th>
                    <th className="text-center">Result</th>
                    <th className="text-right">Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((battle, i) => {
                    const isWinner = battle.winner === '0xYOU';
                    const myElement = getElement(battle.myWarrior.element);
                    const theirElement = getElement(battle.theirWarrior.element);
                    const opponent = battle.player1 === '0xYOU' ? battle.player2 : battle.player1;

                    return (
                      <motion.tr
                        key={battle.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.05 }}
                        className="cursor-pointer"
                        onClick={() => onViewResult(battle)}
                      >
                        <td>
                          <span className="font-mono text-sm text-arena-cyan font-bold">
                            #{battle.id}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-sm text-white/60">
                            {shortenAddress(opponent)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span>{myElement.emoji}</span>
                            <span className="font-mono text-xs text-white/80">
                              #{battle.myWarrior.tokenId}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span>{theirElement.emoji}</span>
                            <span className="font-mono text-xs text-white/80">
                              #{battle.theirWarrior.tokenId}
                            </span>
                          </div>
                        </td>
                        <td className="text-right">
                          <span className="font-mono text-sm text-arena-gold font-semibold">
                            {formatEther(battle.stake)}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase',
                            isWinner
                              ? 'bg-arena-green/10 text-arena-green ring-1 ring-arena-green/20'
                              : 'bg-arena-red/10 text-arena-red ring-1 ring-arena-red/20',
                          )}>
                            {isWinner ? (
                              <>
                                <Trophy className="w-3 h-3" />
                                Win
                              </>
                            ) : (
                              <>
                                <Shield className="w-3 h-3" />
                                Loss
                              </>
                            )}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="text-xs text-white/40 font-mono">
                            {formatDate(battle.resolvedAt)}
                          </span>
                        </td>
                        <td>
                          <ArrowRight className="w-4 h-4 text-white/20" />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {history.length === 0 && (
              <div className="p-12 text-center">
                <Sword className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-white/25 text-sm">No battles yet. Enter the arena!</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function BattlePage() {
  const { address, isConnected } = useAccount();
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedBattleResult, setSelectedBattleResult] = useState<
    (Battle & { myWarrior: Warrior; theirWarrior: Warrior }) | null
  >(null);

  // In production, these would come from contract reads
  const warriors = isConnected ? MOCK_WARRIORS : MOCK_WARRIORS; // Show mock data regardless for preview
  const openBattles = MOCK_OPEN_BATTLES;
  const battleHistory = MOCK_HISTORY;

  const handleViewResult = useCallback(
    (battle: Battle & { myWarrior: Warrior; theirWarrior: Warrior }) => {
      setSelectedBattleResult(battle);
      setShowResultModal(true);
    },
    [],
  );

  return (
    <div className="min-h-screen">
      <HeroSection />

      <CreateBattleSection
        warriors={warriors}
        isConnected={isConnected}
      />

      <OpenBattlesSection
        battles={openBattles}
        warriors={warriors}
        isConnected={isConnected}
      />

      <BattleHistorySection
        history={battleHistory}
        isConnected={isConnected}
        onViewResult={handleViewResult}
      />

      {/* Battle Result Modal */}
      {selectedBattleResult && (
        <BattleResultModal
          isOpen={showResultModal}
          onClose={() => {
            setShowResultModal(false);
            setSelectedBattleResult(null);
          }}
          myWarrior={selectedBattleResult.myWarrior}
          theirWarrior={selectedBattleResult.theirWarrior}
          isWinner={selectedBattleResult.winner === '0xYOU'}
          stakeAmount={formatEther(selectedBattleResult.stake)}
        />
      )}
    </div>
  );
}
