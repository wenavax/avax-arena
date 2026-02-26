"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Shield, Eye, AlertTriangle, Trophy, Swords } from "lucide-react";
import { cn, shortenAddress, formatAvax } from "@/lib/utils";

interface GameBoardProps {
  gameId: number;
  gameType: number;
  stake: string;
  player1: string;
  player2?: string;
  state: "waiting" | "active" | "finished";
  winner?: string;
  children: React.ReactNode;
}

const GAME_NAMES: Record<number, string> = {
  0: "Coin Flip",
  1: "Dice Duel",
  2: "Rock Paper Scissors",
  3: "Number Guess",
  4: "Dragon Tiger",
  5: "Elemental Clash",
  6: "Crash Dice",
};

const GAME_EMOJIS: Record<number, string> = {
  0: "\ud83e\ude99",
  1: "\ud83c\udfb2",
  2: "\u270a",
  3: "\ud83d\udd22",
  4: "\ud83c\udc04",
  5: "\ud83c\udf0a",
  6: "\ud83c\udfb0",
};

type PlayerStatus = "waiting" | "committed" | "revealed";

function StatusBadge({ status }: { status: PlayerStatus }) {
  const config: Record<PlayerStatus, { label: string; color: string; icon: React.ReactNode }> = {
    waiting: {
      label: "Waiting",
      color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
      icon: <Clock className="w-3 h-3" />,
    },
    committed: {
      label: "Committed",
      color: "text-purple-400 border-purple-400/30 bg-purple-400/10",
      icon: <Shield className="w-3 h-3" />,
    },
    revealed: {
      label: "Revealed",
      color: "text-green-400 border-green-400/30 bg-green-400/10",
      icon: <Eye className="w-3 h-3" />,
    },
  };

  const { label, color, icon } = config[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium",
        color
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function PlayerCard({
  address,
  side,
  status,
  isWinner,
}: {
  address: string;
  side: "left" | "right";
  status: PlayerStatus;
  isWinner?: boolean;
}) {
  // Generate gradient from address hash
  const gradientHue = parseInt(address.slice(2, 6), 16) % 360;
  const gradientHue2 = (gradientHue + 120) % 360;

  return (
    <motion.div
      className={cn(
        "flex flex-col items-center gap-3 p-4 rounded-2xl border backdrop-blur-sm",
        isWinner
          ? "border-green-400/40 bg-green-500/5"
          : "border-white/5 bg-white/[0.02]",
        side === "left" ? "items-start" : "items-end"
      )}
      initial={{ opacity: 0, x: side === "left" ? -30 : 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        boxShadow: isWinner
          ? "0 0 30px rgba(0, 255, 136, 0.15)"
          : "none",
      }}
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className="w-12 h-12 rounded-full"
          style={{
            background: `linear-gradient(135deg, hsl(${gradientHue}, 70%, 50%), hsl(${gradientHue2}, 70%, 50%))`,
          }}
        />
        {isWinner && (
          <motion.div
            className="absolute -top-2 -right-2"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", delay: 0.3 }}
          >
            <Trophy className="w-5 h-5 text-yellow-400" style={{ filter: "drop-shadow(0 0 6px #ffd700)" }} />
          </motion.div>
        )}
      </div>

      {/* Address */}
      <p className="font-['JetBrains_Mono'] text-sm text-gray-300">
        {shortenAddress(address)}
      </p>

      {/* Status */}
      <StatusBadge status={status} />
    </motion.div>
  );
}

export default function GameBoard({
  gameId,
  gameType,
  stake,
  player1,
  player2,
  state,
  winner,
  children,
}: GameBoardProps) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 min default
  const [p1Status, setP1Status] = useState<PlayerStatus>("waiting");
  const [p2Status, setP2Status] = useState<PlayerStatus>("waiting");

  // Derive player statuses from state
  useEffect(() => {
    if (state === "waiting") {
      setP1Status("committed");
      setP2Status("waiting");
    } else if (state === "active") {
      setP1Status("committed");
      setP2Status("committed");
    } else {
      setP1Status("revealed");
      setP2Status("revealed");
    }
  }, [state]);

  // Countdown timer
  useEffect(() => {
    if (state !== "active" || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [state, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const stakeInAvax = formatAvax(BigInt(stake || "0"));

  return (
    <motion.div
      className="glass-card gradient-border overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-xl">{GAME_EMOJIS[gameType] || "\ud83c\udfae"}</span>
          <div>
            <p className="font-['Orbitron'] text-sm font-bold text-white tracking-wider">
              {GAME_NAMES[gameType] || "Unknown"}
            </p>
            <p className="text-xs text-gray-500 font-['JetBrains_Mono']">
              Game #{gameId}
            </p>
          </div>
        </div>

        {/* Stake */}
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Stake</p>
          <p className="font-['JetBrains_Mono'] text-lg font-bold text-glow-cyan" style={{ color: "#00f0ff" }}>
            {stakeInAvax} AVAX
          </p>
        </div>

        {/* State badge */}
        <div>
          <span
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
              state === "waiting" && "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
              state === "active" && "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
              state === "finished" && "text-green-400 border-green-400/30 bg-green-400/10"
            )}
          >
            {state}
          </span>
        </div>
      </div>

      {/* Timer bar */}
      {state === "active" && (
        <div className="px-6 py-2 border-b border-white/5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              <span>Move deadline</span>
            </div>
            <span
              className={cn(
                "font-['JetBrains_Mono'] text-sm font-bold",
                timeLeft < 60 ? "text-red-400" : timeLeft < 120 ? "text-yellow-400" : "text-cyan-400"
              )}
            >
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="progress-bar">
            <motion.div
              className="progress-bar-fill"
              style={{
                width: `${(timeLeft / 300) * 100}%`,
                background:
                  timeLeft < 60
                    ? "linear-gradient(90deg, #ff3366, #ff6688)"
                    : timeLeft < 120
                    ? "linear-gradient(90deg, #ffd700, #ffaa00)"
                    : undefined,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="p-6">
        <div className="flex items-start gap-4">
          {/* Player 1 */}
          <div className="flex-shrink-0 w-36">
            <PlayerCard
              address={player1}
              side="left"
              status={p1Status}
              isWinner={winner === player1}
            />
          </div>

          {/* Center - Game component + VS */}
          <div className="flex-1 relative min-h-[300px]">
            {/* VS divider */}
            {player2 && (
              <motion.div
                className="absolute top-4 left-1/2 -translate-x-1/2 z-10"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-px w-8 bg-gradient-to-r from-transparent to-pink-500/50" />
                  <Swords className="w-5 h-5 text-pink-500" style={{ filter: "drop-shadow(0 0 8px #ff2d87)" }} />
                  <div className="h-px w-8 bg-gradient-to-l from-transparent to-pink-500/50" />
                </div>
              </motion.div>
            )}

            {/* Game component */}
            <div className="relative pt-8">
              {children}
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex-shrink-0 w-36">
            {player2 ? (
              <PlayerCard
                address={player2}
                side="right"
                status={p2Status}
                isWinner={winner === player2}
              />
            ) : (
              <motion.div
                className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-dashed border-white/10"
                animate={{ borderColor: ["rgba(255,255,255,0.1)", "rgba(0,240,255,0.3)", "rgba(255,255,255,0.1)"] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-gray-600 text-xl">?</span>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Waiting for opponent...
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Winner banner */}
      <AnimatePresence>
        {state === "finished" && winner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-green-500/20 bg-green-500/5 px-6 py-3"
          >
            <div className="flex items-center justify-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <p className="text-sm font-semibold text-green-400">
                Winner: <span className="font-['JetBrains_Mono']">{shortenAddress(winner)}</span>
              </p>
              <Trophy className="w-4 h-4 text-yellow-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4 px-6 py-4 border-t border-white/5">
        {state === "active" && (
          <>
            <motion.button
              className="btn-neon btn-neon-purple font-['Orbitron'] text-xs tracking-wider"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Shield className="w-3.5 h-3.5 inline mr-2" />
              Commit Move
            </motion.button>
            <motion.button
              className="btn-neon btn-neon-cyan font-['Orbitron'] text-xs tracking-wider"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Eye className="w-3.5 h-3.5 inline mr-2" />
              Reveal Move
            </motion.button>
          </>
        )}
        {state === "active" && timeLeft === 0 && (
          <motion.button
            className="btn-neon btn-neon-pink font-['Orbitron'] text-xs tracking-wider"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertTriangle className="w-3.5 h-3.5 inline mr-2" />
            Claim Timeout
          </motion.button>
        )}
        {state === "waiting" && (
          <motion.button
            className="btn-primary font-['Orbitron'] text-xs tracking-wider"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Join Game - {stakeInAvax} AVAX
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
