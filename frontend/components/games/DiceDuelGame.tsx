"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DiceDuelGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

function DiceDots({ value }: { value: number }) {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [
      [0, 2],
      [2, 0],
    ],
    3: [
      [0, 2],
      [1, 1],
      [2, 0],
    ],
    4: [
      [0, 0],
      [0, 2],
      [2, 0],
      [2, 2],
    ],
    5: [
      [0, 0],
      [0, 2],
      [1, 1],
      [2, 0],
      [2, 2],
    ],
    6: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
    ],
  };

  const dots = dotPositions[value] || [];

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full p-2">
      {Array.from({ length: 9 }).map((_, idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        const hasDot = dots.some(([r, c]) => r === row && c === col);
        return (
          <div key={idx} className="flex items-center justify-center">
            {hasDot && (
              <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DiceDuelGame({
  onSelect,
  result,
  isRevealing = false,
}: DiceDuelGameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [displayValue, setDisplayValue] = useState<number>(1);
  const [showResult, setShowResult] = useState(false);

  const cycleValues = useCallback(() => {
    let count = 0;
    const maxCycles = 20;
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= maxCycles) {
        clearInterval(interval);
      }
    }, 80);
    return interval;
  }, []);

  useEffect(() => {
    if (isRevealing && result !== undefined) {
      setIsRolling(true);
      setShowResult(false);
      const interval = cycleValues();

      const timer = setTimeout(() => {
        clearInterval(interval);
        setIsRolling(false);
        setDisplayValue(result);
        setShowResult(true);
      }, 1600);

      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
  }, [isRevealing, result, cycleValues]);

  const handleSelect = (value: number) => {
    if (isRolling || isRevealing) return;
    setSelected(value);
    onSelect(value);
  };

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {/* Ambient fire glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-[120px] opacity-15"
          style={{
            background:
              "radial-gradient(circle, #ff6600 0%, #ff3300 50%, transparent 70%)",
          }}
        />
      </div>

      {/* Main dice display */}
      <div className="relative">
        <motion.div
          className={cn(
            "dice w-28 h-28 rounded-2xl flex items-center justify-center",
            "border-2 border-orange-500/40",
            isRolling && "rolling"
          )}
          style={{
            background:
              "linear-gradient(135deg, #2a1a1a 0%, #1a0a0a 100%)",
            boxShadow: showResult
              ? "0 0 40px rgba(255, 100, 0, 0.4), 0 0 80px rgba(255, 60, 0, 0.2), inset 0 0 20px rgba(255, 100, 0, 0.1)"
              : "0 0 20px rgba(255, 100, 0, 0.15), inset 0 0 10px rgba(255, 100, 0, 0.05)",
          }}
          animate={
            isRolling
              ? {
                  rotateX: [0, 180, 360, 540, 720],
                  rotateY: [0, 90, 180, 270, 360],
                  rotateZ: [0, 45, 90, 135, 180],
                }
              : { rotateX: 0, rotateY: 0, rotateZ: 0 }
          }
          transition={{
            duration: isRolling ? 1.5 : 0.5,
            ease: "easeInOut",
          }}
        >
          <div className="w-full h-full">
            <DiceDots value={displayValue} />
          </div>
        </motion.div>

        {/* Dice shadow */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-20 h-3 rounded-full bg-orange-900/20 blur-md" />
      </div>

      {/* Display value */}
      <AnimatePresence>
        {showResult && result !== undefined && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="text-center"
          >
            <p
              className="font-['Orbitron'] text-3xl font-bold text-orange-400"
              style={{
                textShadow:
                  "0 0 20px rgba(255, 100, 0, 0.5), 0 0 40px rgba(255, 60, 0, 0.3)",
              }}
            >
              {result}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dice face selector - 2x3 grid */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <motion.button
            key={value}
            className={cn(
              "relative w-20 h-20 rounded-xl border-2 transition-all duration-300",
              selected === value
                ? "border-orange-400 bg-orange-500/20"
                : "border-orange-500/20 bg-orange-500/5 hover:border-orange-500/50 hover:bg-orange-500/10"
            )}
            whileHover={{ scale: 1.08, y: -3 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => handleSelect(value)}
            disabled={isRolling || isRevealing}
            style={{
              boxShadow:
                selected === value
                  ? "0 0 25px rgba(255, 100, 0, 0.3), inset 0 0 15px rgba(255, 100, 0, 0.1)"
                  : "none",
            }}
          >
            <DiceDots value={value} />
            {selected === value && (
              <motion.div
                className="absolute inset-0 rounded-xl"
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,100,0,0.2), transparent)",
                }}
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
