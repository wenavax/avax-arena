"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DragonTigerGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

const CARDS = [
  { value: 1, label: "A" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
  { value: 11, label: "J" },
  { value: 12, label: "Q" },
  { value: 13, label: "K" },
];

export default function DragonTigerGame({
  onSelect,
  result,
  isRevealing = false,
}: DragonTigerGameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [isDealing, setIsDealing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [dealtCard, setDealtCard] = useState<number | null>(null);

  useEffect(() => {
    if (isRevealing && result !== undefined) {
      setIsDealing(true);
      setShowResult(false);

      const timer = setTimeout(() => {
        setIsDealing(false);
        setDealtCard(result);
        setShowResult(true);
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [isRevealing, result]);

  const handleSelect = (value: number) => {
    if (isDealing || isRevealing) return;
    setSelected(value);
    onSelect(value);
  };

  const getCardLabel = (value: number) => {
    return CARDS.find((c) => c.value === value)?.label || "";
  };

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 left-1/4 w-48 h-48 rounded-full blur-[100px] opacity-10"
          style={{ background: "#7b2ff7" }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full blur-[100px] opacity-10"
          style={{ background: "#ff4400" }}
        />
      </div>

      {/* Dragon vs Tiger arena */}
      <div className="flex items-center gap-8 w-full max-w-lg justify-center">
        {/* Dragon side */}
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <span className="text-4xl">&#x1f409;</span>
          <span
            className="font-['Orbitron'] text-sm font-bold text-purple-400 uppercase tracking-widest"
            style={{
              textShadow: "0 0 10px rgba(123, 47, 247, 0.5)",
            }}
          >
            Dragon
          </span>
          {/* Dragon card slot */}
          <motion.div
            className={cn(
              "w-20 h-28 rounded-xl border-2 flex items-center justify-center",
              "border-purple-500/30 bg-purple-500/5"
            )}
            animate={
              isDealing
                ? { borderColor: ["rgba(123,47,247,0.3)", "rgba(123,47,247,0.8)", "rgba(123,47,247,0.3)"] }
                : {}
            }
            transition={{ duration: 0.8, repeat: isDealing ? Infinity : 0 }}
          >
            <AnimatePresence>
              {selected !== null && (
                <motion.div
                  initial={{ x: -100, rotateY: 180, opacity: 0 }}
                  animate={{ x: 0, rotateY: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, type: "spring" }}
                  className="w-full h-full rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-purple-900/30 border border-purple-400/30"
                >
                  <span className="font-['JetBrains_Mono'] text-2xl font-bold text-purple-300">
                    {getCardLabel(selected)}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* VS fire effect */}
        <motion.div
          className="flex flex-col items-center"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <span className="text-2xl mb-1">&#x1f525;</span>
          <span
            className="font-['Orbitron'] text-xl font-black"
            style={{
              background: "linear-gradient(135deg, #ff4400, #ffd700)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 10px rgba(255, 68, 0, 0.5))",
            }}
          >
            VS
          </span>
          <span className="text-2xl mt-1">&#x1f525;</span>
        </motion.div>

        {/* Tiger side */}
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <span className="text-4xl">&#x1f42f;</span>
          <span
            className="font-['Orbitron'] text-sm font-bold text-orange-400 uppercase tracking-widest"
            style={{
              textShadow: "0 0 10px rgba(255, 136, 0, 0.5)",
            }}
          >
            Tiger
          </span>
          {/* Tiger card slot */}
          <motion.div
            className={cn(
              "w-20 h-28 rounded-xl border-2 flex items-center justify-center",
              "border-orange-500/30 bg-orange-500/5"
            )}
            animate={
              isDealing
                ? { borderColor: ["rgba(255,136,0,0.3)", "rgba(255,136,0,0.8)", "rgba(255,136,0,0.3)"] }
                : {}
            }
            transition={{ duration: 0.8, repeat: isDealing ? Infinity : 0 }}
          >
            <AnimatePresence>
              {showResult && dealtCard !== null && (
                <motion.div
                  initial={{ x: 100, rotateY: 180, opacity: 0 }}
                  animate={{ x: 0, rotateY: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, type: "spring" }}
                  className="w-full h-full rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-600/30 to-red-900/30 border border-orange-400/30"
                >
                  <span className="font-['JetBrains_Mono'] text-2xl font-bold text-orange-300">
                    {getCardLabel(dealtCard)}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {/* Result display */}
      <AnimatePresence>
        {showResult && result !== undefined && selected !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <p
              className={cn(
                "font-['Orbitron'] text-lg font-bold tracking-wider",
                selected > result
                  ? "text-purple-400 text-glow-purple"
                  : selected < result
                  ? "text-orange-400"
                  : "text-yellow-400"
              )}
              style={{
                textShadow:
                  selected > result
                    ? undefined
                    : selected < result
                    ? "0 0 10px rgba(255,136,0,0.5)"
                    : "0 0 10px rgba(255,215,0,0.5)",
              }}
            >
              {selected > result
                ? "DRAGON WINS!"
                : selected < result
                ? "TIGER WINS!"
                : "TIE!"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card selector - Fan layout */}
      <div className="relative w-full max-w-lg">
        <div className="flex justify-center items-end gap-1">
          {CARDS.map((card, index) => {
            const totalCards = CARDS.length;
            const midIndex = (totalCards - 1) / 2;
            const rotation = (index - midIndex) * 4;
            const yOffset = Math.abs(index - midIndex) * 3;

            return (
              <motion.button
                key={card.value}
                className={cn(
                  "relative w-12 h-16 rounded-lg border-2 flex items-center justify-center",
                  "transition-all duration-200 cursor-pointer",
                  "font-['JetBrains_Mono'] text-sm font-bold",
                  selected === card.value
                    ? "border-purple-400 bg-purple-500/25 text-purple-200 z-20"
                    : "border-white/10 bg-[#1a1a2e] text-gray-400 hover:border-purple-400/50 hover:text-purple-300 hover:z-10"
                )}
                style={{
                  transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
                  boxShadow:
                    selected === card.value
                      ? "0 0 20px rgba(123, 47, 247, 0.4), 0 -5px 20px rgba(123, 47, 247, 0.2)"
                      : "0 2px 8px rgba(0,0,0,0.3)",
                }}
                whileHover={{
                  y: -15,
                  rotate: 0,
                  scale: 1.15,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelect(card.value)}
                disabled={isDealing || isRevealing}
              >
                {/* Card face */}
                <span>{card.label}</span>

                {/* Card inner glow for selected */}
                {selected === card.value && (
                  <motion.div
                    className="absolute inset-0 rounded-lg"
                    animate={{ opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{
                      background:
                        "radial-gradient(circle, rgba(123,47,247,0.3), transparent)",
                    }}
                  />
                )}

                {/* Gradient border for selected */}
                {selected === card.value && (
                  <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
                    <motion.div
                      className="absolute inset-0"
                      animate={{
                        background: [
                          "linear-gradient(0deg, rgba(123,47,247,0.3), transparent)",
                          "linear-gradient(180deg, rgba(123,47,247,0.3), transparent)",
                          "linear-gradient(360deg, rgba(123,47,247,0.3), transparent)",
                        ],
                      }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
