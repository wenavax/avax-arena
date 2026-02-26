'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  Shield,
  Eye,
  Trophy,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { cn, shortenAddress } from '@/lib/utils';
import { GAMES } from '@/lib/constants';

// Game phase enum matching smart contract states
type GamePhase = 'waiting' | 'commit' | 'reveal' | 'finished';

// Mock game data structure
interface GameData {
  id: number;
  gameType: number;
  player1: string;
  player2: string | null;
  stake: string;
  phase: GamePhase;
  p1Committed: boolean;
  p2Committed: boolean;
  p1Revealed: boolean;
  p2Revealed: boolean;
  p1Move: number | null;
  p2Move: number | null;
  winner: string | null;
  createdAt: string;
  moveDeadline: string | null;
}

// Generate mock data based on gameId
function getMockGame(gameId: string): GameData {
  const id = parseInt(gameId, 10) || 42;
  const phases: GamePhase[] = ['waiting', 'commit', 'reveal', 'finished'];
  const phaseIndex = id % 4;

  return {
    id,
    gameType: id % 7,
    player1: '0x1234567890abcdef1234567890abcdef12345678',
    player2:
      phaseIndex === 0
        ? null
        : '0xabcdef1234567890abcdef1234567890abcdef12',
    stake: ['0.5', '1.0', '2.5', '0.25'][id % 4],
    phase: phases[phaseIndex],
    p1Committed: phaseIndex >= 2,
    p2Committed: phaseIndex >= 2,
    p1Revealed: phaseIndex >= 3,
    p2Revealed: phaseIndex >= 3,
    p1Move: phaseIndex >= 3 ? (id % 3) + 1 : null,
    p2Move: phaseIndex >= 3 ? ((id + 1) % 3) + 1 : null,
    winner:
      phaseIndex === 3
        ? '0x1234567890abcdef1234567890abcdef12345678'
        : null,
    createdAt: '2 min ago',
    moveDeadline: phaseIndex >= 1 ? '4:32' : null,
  };
}

// Component for player info card
function PlayerCard({
  address,
  label,
  isCurrentUser,
  hasCommitted,
  hasRevealed,
  move,
  gameInfo,
  isWinner,
}: {
  address: string | null;
  label: string;
  isCurrentUser: boolean;
  hasCommitted: boolean;
  hasRevealed: boolean;
  move: number | null;
  gameInfo: (typeof GAMES)[number];
  isWinner: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

  const moveLabel =
    move !== null && gameInfo.moveLabels.length > 0
      ? gameInfo.moveLabels[move - 1] ?? `Move ${move}`
      : move !== null
        ? `${move}`
        : null;

  return (
    <div
      className={cn(
        'glass-card p-5 relative overflow-hidden',
        isWinner && 'ring-2 ring-arena-gold/50 shadow-glow-gold',
        isCurrentUser && !isWinner && 'ring-1 ring-arena-cyan/30'
      )}
    >
      {isWinner && (
        <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl bg-arena-gold/20 border-b border-l border-arena-gold/30">
          <Trophy className="w-4 h-4 text-arena-gold inline mr-1" />
          <span className="text-xs font-bold text-arena-gold">WINNER</span>
        </div>
      )}

      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">
        {label}
      </p>

      {address ? (
        <>
          {/* Avatar */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className={cn(
                'w-10 h-10 rounded-full',
                isCurrentUser
                  ? 'bg-gradient-to-br from-arena-cyan to-arena-purple'
                  : 'bg-gradient-to-br from-arena-pink to-arena-purple'
              )}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white font-medium">
                  {shortenAddress(address)}
                </span>
                <button
                  onClick={copyAddress}
                  className="text-gray-500 hover:text-arena-cyan transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-arena-green" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {isCurrentUser && (
                <span className="text-xs text-arena-cyan">You</span>
              )}
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-3 text-xs">
            <div
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md',
                hasCommitted
                  ? 'bg-arena-green/10 text-arena-green'
                  : 'bg-white/[0.03] text-gray-500'
              )}
            >
              <Shield className="w-3 h-3" />
              {hasCommitted ? 'Committed' : 'Pending'}
            </div>
            <div
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md',
                hasRevealed
                  ? 'bg-arena-green/10 text-arena-green'
                  : 'bg-white/[0.03] text-gray-500'
              )}
            >
              <Eye className="w-3 h-3" />
              {hasRevealed ? 'Revealed' : 'Hidden'}
            </div>
          </div>

          {/* Revealed move */}
          {moveLabel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-3 text-center py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]"
            >
              <span className="text-lg font-bold text-white">{moveLabel}</span>
            </motion.div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-4">
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-10 h-10 rounded-full bg-gray-700/50 mb-3"
          />
          <span className="text-gray-500 text-sm">Waiting for opponent...</span>
        </div>
      )}
    </div>
  );
}

// Move selection component
function MoveSelector({
  gameInfo,
  selectedMove,
  onSelect,
}: {
  gameInfo: (typeof GAMES)[number];
  selectedMove: number | null;
  onSelect: (move: number) => void;
}) {
  const [min, max] = gameInfo.moveRange;
  const hasLabels = gameInfo.moveLabels.length > 0;

  // For games with labels (few options), show button grid
  if (hasLabels) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {gameInfo.moveLabels.map((label, index) => {
          const moveValue = min + index;
          const isSelected = selectedMove === moveValue;
          return (
            <motion.button
              key={moveValue}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(moveValue)}
              className={cn(
                'p-4 rounded-xl text-center transition-all duration-200 border',
                isSelected
                  ? 'bg-arena-cyan/15 border-arena-cyan/40 text-white shadow-glow-cyan'
                  : 'bg-white/[0.03] border-white/[0.06] text-gray-300 hover:bg-white/[0.06] hover:border-white/[0.12]'
              )}
            >
              <span className="text-lg font-bold block">{label}</span>
            </motion.button>
          );
        })}
      </div>
    );
  }

  // For number-range games (e.g., number-guess 1-100, crash-dice 1-20), show input
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-gray-400 text-sm">
        Pick a number from {min} to {max}
      </p>
      <div className="flex items-center gap-4">
        <input
          type="number"
          min={min}
          max={max}
          value={selectedMove ?? ''}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (val >= min && val <= max) onSelect(val);
          }}
          placeholder={`${min}-${max}`}
          className={cn(
            'w-32 bg-arena-surface border border-arena-border rounded-xl px-4 py-3',
            'text-white font-mono text-2xl text-center placeholder-gray-600',
            'focus:outline-none focus:border-arena-cyan/50 focus:ring-1 focus:ring-arena-cyan/20',
            'transition-all duration-200'
          )}
        />
      </div>
      {selectedMove !== null && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-arena-cyan font-mono text-sm"
        >
          Selected: {selectedMove}
        </motion.p>
      )}
    </div>
  );
}

export default function GameRoomPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameData, setGameData] = useState<GameData | null>(null);
  const [selectedMove, setSelectedMove] = useState<number | null>(null);
  const [txStatus, setTxStatus] = useState<
    'idle' | 'pending' | 'confirming' | 'confirmed' | 'error'
  >('idle');

  // Current user address (mock)
  const currentUser = '0x1234567890abcdef1234567890abcdef12345678';

  // Load mock game data
  useEffect(() => {
    setGameData(getMockGame(gameId));
  }, [gameId]);

  if (!gameData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-arena-cyan animate-spin" />
      </div>
    );
  }

  const gameInfo = GAMES[gameData.gameType];
  const isPlayer1 =
    currentUser.toLowerCase() === gameData.player1.toLowerCase();
  const isPlayer2 =
    gameData.player2 &&
    currentUser.toLowerCase() === gameData.player2.toLowerCase();
  const isParticipant = isPlayer1 || isPlayer2;
  const isWinner =
    gameData.winner &&
    currentUser.toLowerCase() === gameData.winner.toLowerCase();

  const handleCommit = () => {
    if (selectedMove === null) return;
    setTxStatus('pending');
    setTimeout(() => setTxStatus('confirming'), 1000);
    setTimeout(() => setTxStatus('confirmed'), 3000);
  };

  const handleReveal = () => {
    setTxStatus('pending');
    setTimeout(() => setTxStatus('confirming'), 1000);
    setTimeout(() => setTxStatus('confirmed'), 3000);
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <Link
            href="/play"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-arena-cyan transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Lobby
          </Link>
        </motion.div>

        {/* Game Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <motion.span
            className="text-6xl inline-block mb-3"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            {gameInfo.emoji}
          </motion.span>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mb-2">
            <span className="gradient-text">{gameInfo.name}</span>
          </h1>
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="font-mono text-gray-400">
              Game #{gameData.id}
            </span>
            <span className="text-gray-600">|</span>
            <span className="text-arena-gold font-mono font-bold">
              {gameData.stake} AVAX
            </span>
            {gameData.moveDeadline && (
              <>
                <span className="text-gray-600">|</span>
                <span className="flex items-center gap-1 text-arena-orange">
                  <Clock className="w-3.5 h-3.5" />
                  {gameData.moveDeadline}
                </span>
              </>
            )}
          </div>
        </motion.div>

        {/* Phase Indicator */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            {(['waiting', 'commit', 'reveal', 'finished'] as GamePhase[]).map(
              (phase, index) => {
                const phaseLabels = ['Waiting', 'Commit', 'Reveal', 'Finished'];
                const phaseIndex = ['waiting', 'commit', 'reveal', 'finished'].indexOf(
                  gameData.phase
                );
                const isActive = phase === gameData.phase;
                const isPast = index < phaseIndex;

                return (
                  <div key={phase} className="flex items-center gap-2 sm:gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={cn(
                          'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                          isActive
                            ? 'bg-arena-cyan text-arena-bg shadow-glow-cyan'
                            : isPast
                              ? 'bg-arena-green/20 text-arena-green border border-arena-green/30'
                              : 'bg-white/[0.04] text-gray-600 border border-white/[0.06]'
                        )}
                      >
                        {isPast ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isActive
                            ? 'text-arena-cyan'
                            : isPast
                              ? 'text-arena-green'
                              : 'text-gray-600'
                        )}
                      >
                        {phaseLabels[index]}
                      </span>
                    </div>
                    {index < 3 && (
                      <div
                        className={cn(
                          'hidden sm:block w-12 h-0.5 rounded-full mb-5',
                          index < phaseIndex
                            ? 'bg-arena-green/40'
                            : 'bg-white/[0.06]'
                        )}
                      />
                    )}
                  </div>
                );
              }
            )}
          </div>
        </motion.div>

        {/* Player Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8"
        >
          <PlayerCard
            address={gameData.player1}
            label="Player 1"
            isCurrentUser={isPlayer1}
            hasCommitted={gameData.p1Committed}
            hasRevealed={gameData.p1Revealed}
            move={gameData.p1Move}
            gameInfo={gameInfo}
            isWinner={
              gameData.winner?.toLowerCase() ===
              gameData.player1.toLowerCase()
            }
          />
          <PlayerCard
            address={gameData.player2}
            label="Player 2"
            isCurrentUser={!!isPlayer2}
            hasCommitted={gameData.p2Committed}
            hasRevealed={gameData.p2Revealed}
            move={gameData.p2Move}
            gameInfo={gameInfo}
            isWinner={
              !!gameData.player2 &&
              !!gameData.winner &&
              gameData.winner.toLowerCase() ===
                gameData.player2.toLowerCase()
            }
          />
        </motion.div>

        {/* VS Separator */}
        <div className="flex items-center justify-center mb-8">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-arena-border" />
          <div className="mx-4 font-display text-2xl font-black text-gray-600">
            VS
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-arena-border" />
        </div>

        {/* Action Area based on phase */}
        <AnimatePresence mode="wait">
          {/* WAITING PHASE */}
          {gameData.phase === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-card p-8 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-arena-cyan/10 mb-4"
              >
                <Loader2 className="w-8 h-8 text-arena-cyan animate-spin" />
              </motion.div>
              <h3 className="font-display text-xl font-bold text-white mb-2">
                Waiting for Opponent
              </h3>
              <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                Share this game link to invite an opponent, or wait for someone
                to join from the lobby.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-arena-surface border border-arena-border">
                <span className="font-mono text-sm text-gray-300">
                  /play/{gameData.id}
                </span>
                <button className="text-gray-500 hover:text-arena-cyan transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* COMMIT PHASE - Select and commit move */}
          {gameData.phase === 'commit' && (
            <motion.div
              key="commit"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-card p-6 sm:p-8"
            >
              <div className="text-center mb-6">
                <Shield className="w-8 h-8 text-arena-purple mx-auto mb-2" />
                <h3 className="font-display text-xl font-bold text-white mb-1">
                  Choose Your Move
                </h3>
                <p className="text-gray-400 text-sm">
                  Your move will be encrypted and committed on-chain.
                  No one can see it until reveal.
                </p>
              </div>

              <div className="mb-8">
                <MoveSelector
                  gameInfo={gameInfo}
                  selectedMove={selectedMove}
                  onSelect={setSelectedMove}
                />
              </div>

              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={handleCommit}
                  disabled={
                    selectedMove === null ||
                    txStatus === 'pending' ||
                    txStatus === 'confirming'
                  }
                  className={cn(
                    'btn-primary flex items-center gap-2',
                    (selectedMove === null || txStatus !== 'idle') &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  {txStatus === 'pending' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing Transaction...
                    </>
                  ) : txStatus === 'confirming' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Confirming...
                    </>
                  ) : txStatus === 'confirmed' ? (
                    <>
                      <Check className="w-5 h-5" />
                      Move Committed!
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      Commit Move
                    </>
                  )}
                </button>

                {/* TX Status */}
                {txStatus !== 'idle' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-xs"
                  >
                    {txStatus === 'confirmed' ? (
                      <span className="text-arena-green flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Transaction confirmed
                        <ExternalLink className="w-3 h-3 ml-1 cursor-pointer hover:text-arena-cyan" />
                      </span>
                    ) : txStatus === 'error' ? (
                      <span className="text-arena-red flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Transaction failed
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        Processing on-chain...
                      </span>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* REVEAL PHASE */}
          {gameData.phase === 'reveal' && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-card p-6 sm:p-8 text-center"
            >
              <Eye className="w-8 h-8 text-arena-cyan mx-auto mb-2" />
              <h3 className="font-display text-xl font-bold text-white mb-2">
                Time to Reveal
              </h3>
              <p className="text-gray-400 text-sm mb-6">
                Both players have committed. Reveal your move to determine the
                winner.
              </p>
              <button
                onClick={handleReveal}
                disabled={txStatus !== 'idle'}
                className={cn(
                  'btn-neon btn-neon-cyan flex items-center gap-2 mx-auto',
                  txStatus !== 'idle' && 'opacity-50 cursor-not-allowed'
                )}
              >
                {txStatus === 'pending' || txStatus === 'confirming' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Revealing...
                  </>
                ) : txStatus === 'confirmed' ? (
                  <>
                    <Check className="w-5 h-5" />
                    Revealed!
                  </>
                ) : (
                  <>
                    <Eye className="w-5 h-5" />
                    Reveal Move
                  </>
                )}
              </button>
            </motion.div>
          )}

          {/* FINISHED PHASE */}
          {gameData.phase === 'finished' && (
            <motion.div
              key="finished"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              className={cn(
                'glass-card p-8 sm:p-10 text-center relative overflow-hidden',
                isWinner
                  ? 'ring-2 ring-arena-gold/40'
                  : 'ring-1 ring-arena-border'
              )}
            >
              {/* Confetti-like orbs for winner */}
              {isWinner && (
                <>
                  <div className="absolute -top-10 -left-10 w-40 h-40 bg-arena-gold/10 rounded-full blur-3xl" />
                  <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-arena-cyan/10 rounded-full blur-3xl" />
                </>
              )}

              <div className="relative z-10">
                {isWinner ? (
                  <>
                    <motion.div
                      initial={{ rotate: -10 }}
                      animate={{ rotate: [0, -5, 5, 0] }}
                      transition={{ duration: 1, repeat: 2 }}
                    >
                      <Trophy className="w-16 h-16 text-arena-gold mx-auto mb-4" />
                    </motion.div>
                    <h3 className="font-display text-3xl font-black text-arena-gold text-glow-cyan mb-2">
                      VICTORY!
                    </h3>
                    <p className="text-gray-300 mb-4">
                      You won{' '}
                      <span className="text-arena-gold font-mono font-bold">
                        {(parseFloat(gameData.stake) * 2).toFixed(2)} AVAX
                      </span>
                    </p>
                  </>
                ) : isParticipant ? (
                  <>
                    <div className="text-5xl mb-4">
                      <span role="img" aria-label="sad">
                        😔
                      </span>
                    </div>
                    <h3 className="font-display text-2xl font-bold text-arena-red mb-2">
                      Defeat
                    </h3>
                    <p className="text-gray-400 mb-4">
                      Better luck next time! Challenge again?
                    </p>
                  </>
                ) : (
                  <>
                    <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="font-display text-2xl font-bold text-white mb-2">
                      Game Complete
                    </h3>
                    <p className="text-gray-400 mb-4">
                      Winner:{' '}
                      <span className="text-arena-gold font-mono">
                        {gameData.winner
                          ? shortenAddress(gameData.winner)
                          : 'Draw'}
                      </span>
                    </p>
                  </>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                  <Link href="/play" className="btn-primary text-sm">
                    Back to Lobby
                  </Link>
                  <Link
                    href="/play"
                    className="btn-neon btn-neon-purple text-sm"
                  >
                    Play Again
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Info Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500"
        >
          <span>
            Created {gameData.createdAt} | Stake: {gameData.stake} AVAX per
            player
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 hover:text-arena-cyan transition-colors cursor-pointer">
              <ExternalLink className="w-3 h-3" />
              View on Snowtrace
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
