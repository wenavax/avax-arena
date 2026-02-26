"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface CoinFlipGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

export default function CoinFlipGame({
  onSelect,
  result,
  isRevealing = false,
}: CoinFlipGameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [displaySide, setDisplaySide] = useState<number>(0); // 0 = heads, 1 = tails
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (isRevealing && result !== undefined) {
      setIsFlipping(true);
      setShowResult(false);

      const timer = setTimeout(() => {
        setIsFlipping(false);
        setDisplaySide(result);
        setShowResult(true);
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [isRevealing, result]);

  const handleSelect = (side: number) => {
    if (isFlipping || isRevealing) return;
    setSelected(side);
    setIsFlipping(true);

    setTimeout(() => {
      setIsFlipping(false);
      setDisplaySide(side);
      onSelect(side);
    }, 800);
  };

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] opacity-20"
          style={{
            background:
              "radial-gradient(circle, #ffd700 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Coin */}
      <div className="relative" style={{ perspective: "800px" }}>
        <motion.div
          className="coin relative"
          animate={{
            rotateY: isFlipping ? 1800 : displaySide === 1 ? 180 : 0,
          }}
          transition={{
            duration: isFlipping ? 1.2 : 0.6,
            ease: "easeInOut",
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Heads */}
          <div
            className={cn(
              "absolute inset-0 rounded-full flex items-center justify-center",
              "border-4 border-yellow-500/50",
              "backface-hidden"
            )}
            style={{
              background:
                "radial-gradient(circle at 35% 35%, #ffe066, #ffd700, #b8960f)",
              backfaceVisibility: "hidden",
              boxShadow: showResult && result === 0
                ? "0 0 40px rgba(255, 215, 0, 0.6), 0 0 80px rgba(255, 215, 0, 0.3)"
                : "0 0 20px rgba(255, 215, 0, 0.2)",
            }}
          >
            <span className="text-4xl font-bold text-yellow-900 font-['Orbitron']">
              H
            </span>
            <div
              className="absolute inset-2 rounded-full border border-yellow-600/30"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)",
              }}
            />
          </div>

          {/* Tails */}
          <div
            className={cn(
              "absolute inset-0 rounded-full flex items-center justify-center",
              "border-4 border-gray-400/50"
            )}
            style={{
              background:
                "radial-gradient(circle at 35% 35%, #e8e8e8, #c0c0c0, #8a8a8a)",
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              boxShadow: showResult && result === 1
                ? "0 0 40px rgba(192, 192, 192, 0.6), 0 0 80px rgba(192, 192, 192, 0.3)"
                : "0 0 20px rgba(192, 192, 192, 0.2)",
            }}
          >
            <span className="text-4xl font-bold text-gray-700 font-['Orbitron']">
              T
            </span>
            <div
              className="absolute inset-2 rounded-full border border-gray-300/30"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)",
              }}
            />
          </div>
        </motion.div>

        {/* Coin shadow */}
        <motion.div
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-4 rounded-full bg-black/30 blur-md"
          animate={{
            scale: isFlipping ? [1, 0.5, 1] : 1,
            opacity: isFlipping ? [0.3, 0.1, 0.3] : 0.3,
          }}
          transition={{ duration: 1.2 }}
        />
      </div>

      {/* Result display */}
      <AnimatePresence>
        {showResult && result !== undefined && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="text-center"
          >
            <p
              className="font-['Orbitron'] text-2xl font-bold"
              style={{
                color: result === 0 ? "#ffd700" : "#c0c0c0",
                textShadow: `0 0 20px ${
                  result === 0
                    ? "rgba(255, 215, 0, 0.5)"
                    : "rgba(192, 192, 192, 0.5)"
                }`,
              }}
            >
              {result === 0 ? "HEADS" : "TAILS"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection buttons */}
      <div className="flex gap-6">
        <motion.button
          className={cn(
            "relative px-8 py-4 rounded-xl font-['Orbitron'] font-bold text-lg tracking-wider",
            "border-2 transition-colors duration-300",
            selected === 0
              ? "border-yellow-400 bg-yellow-500/20 text-yellow-300"
              : "border-yellow-500/30 bg-yellow-500/5 text-yellow-500/70 hover:border-yellow-500/60 hover:text-yellow-400"
          )}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSelect(0)}
          disabled={isFlipping || isRevealing}
          style={{
            boxShadow:
              selected === 0
                ? "0 0 30px rgba(255, 215, 0, 0.3), inset 0 0 20px rgba(255, 215, 0, 0.1)"
                : "none",
          }}
        >
          <span className="relative z-10">HEADS</span>
          {selected === 0 && (
            <motion.div
              className="absolute inset-0 rounded-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.1, 0.3, 0.1] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                background:
                  "radial-gradient(circle, rgba(255,215,0,0.2), transparent)",
              }}
            />
          )}
        </motion.button>

        <motion.button
          className={cn(
            "relative px-8 py-4 rounded-xl font-['Orbitron'] font-bold text-lg tracking-wider",
            "border-2 transition-colors duration-300",
            selected === 1
              ? "border-gray-300 bg-gray-400/20 text-gray-200"
              : "border-gray-500/30 bg-gray-500/5 text-gray-400/70 hover:border-gray-400/60 hover:text-gray-300"
          )}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleSelect(1)}
          disabled={isFlipping || isRevealing}
          style={{
            boxShadow:
              selected === 1
                ? "0 0 30px rgba(192, 192, 192, 0.3), inset 0 0 20px rgba(192, 192, 192, 0.1)"
                : "none",
          }}
        >
          <span className="relative z-10">TAILS</span>
          {selected === 1 && (
            <motion.div
              className="absolute inset-0 rounded-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.1, 0.3, 0.1] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                background:
                  "radial-gradient(circle, rgba(192,192,192,0.2), transparent)",
              }}
            />
          )}
        </motion.button>
      </div>
    </div>
  );
}
