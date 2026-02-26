"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface RPSGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

const CHOICES = [
  { id: 1, emoji: "\u270a", label: "Rock", color: "#6366f1" },
  { id: 2, emoji: "\u270b", label: "Paper", color: "#818cf8" },
  { id: 3, emoji: "\u270c\ufe0f", label: "Scissors", color: "#a78bfa" },
];

export default function RPSGame({
  onSelect,
  result,
  isRevealing = false,
}: RPSGameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultOutcome, setResultOutcome] = useState<"win" | "lose" | "draw" | null>(null);

  useEffect(() => {
    if (isRevealing && result !== undefined && selected !== null) {
      setIsShaking(true);
      setShowResult(false);

      const timer = setTimeout(() => {
        setIsShaking(false);
        setShowResult(true);

        // Determine outcome
        if (selected === result) {
          setResultOutcome("draw");
        } else if (
          (selected === 1 && result === 3) ||
          (selected === 2 && result === 1) ||
          (selected === 3 && result === 2)
        ) {
          setResultOutcome("win");
        } else {
          setResultOutcome("lose");
        }
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isRevealing, result, selected]);

  const handleSelect = (id: number) => {
    if (isShaking || isRevealing) return;
    setSelected(id);
    onSelect(id);
  };

  const getResultGlow = (choiceId: number): string => {
    if (!showResult || !resultOutcome) return "";
    if (choiceId === selected) {
      if (resultOutcome === "win") return "0 0 30px rgba(0, 255, 136, 0.5), 0 0 60px rgba(0, 255, 136, 0.2)";
      if (resultOutcome === "lose") return "0 0 30px rgba(255, 51, 102, 0.5), 0 0 60px rgba(255, 51, 102, 0.2)";
      return "0 0 30px rgba(255, 215, 0, 0.5), 0 0 60px rgba(255, 215, 0, 0.2)";
    }
    return "";
  };

  const getResultBorder = (choiceId: number): string => {
    if (!showResult || !resultOutcome || choiceId !== selected) return "";
    if (resultOutcome === "win") return "border-green-400";
    if (resultOutcome === "lose") return "border-red-400";
    return "border-yellow-400";
  };

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-[120px] opacity-15"
          style={{
            background:
              "radial-gradient(circle, #6366f1 0%, #4f46e5 50%, transparent 70%)",
          }}
        />
      </div>

      {/* VS Display */}
      <AnimatePresence>
        {showResult && result !== undefined && selected !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="flex items-center gap-6 mb-4"
          >
            {/* Player choice */}
            <motion.div
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center text-4xl",
                "border-2",
                resultOutcome === "win"
                  ? "border-green-400 bg-green-500/10"
                  : resultOutcome === "lose"
                  ? "border-red-400 bg-red-500/10"
                  : "border-yellow-400 bg-yellow-500/10"
              )}
              initial={{ x: -50 }}
              animate={{ x: 0 }}
              style={{
                boxShadow: resultOutcome === "win"
                  ? "0 0 30px rgba(0,255,136,0.3)"
                  : resultOutcome === "lose"
                  ? "0 0 30px rgba(255,51,102,0.3)"
                  : "0 0 30px rgba(255,215,0,0.3)",
              }}
            >
              {CHOICES.find((c) => c.id === selected)?.emoji}
            </motion.div>

            {/* VS */}
            <motion.span
              className="font-['Orbitron'] text-2xl font-black text-glow-pink"
              style={{ color: "#ff2d87" }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              VS
            </motion.span>

            {/* Opponent choice */}
            <motion.div
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center text-4xl",
                "border-2",
                resultOutcome === "lose"
                  ? "border-green-400 bg-green-500/10"
                  : resultOutcome === "win"
                  ? "border-red-400 bg-red-500/10"
                  : "border-yellow-400 bg-yellow-500/10"
              )}
              initial={{ x: 50 }}
              animate={{ x: 0 }}
              style={{
                boxShadow: resultOutcome === "lose"
                  ? "0 0 30px rgba(0,255,136,0.3)"
                  : resultOutcome === "win"
                  ? "0 0 30px rgba(255,51,102,0.3)"
                  : "0 0 30px rgba(255,215,0,0.3)",
              }}
            >
              {CHOICES.find((c) => c.id === result)?.emoji}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result text */}
      <AnimatePresence>
        {showResult && resultOutcome && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "font-['Orbitron'] text-xl font-bold tracking-wider",
              resultOutcome === "win" && "text-green-400 text-glow-green",
              resultOutcome === "lose" && "text-red-400",
              resultOutcome === "draw" && "text-yellow-400"
            )}
            style={{
              textShadow:
                resultOutcome === "lose"
                  ? "0 0 10px rgba(255,51,102,0.5), 0 0 40px rgba(255,51,102,0.2)"
                  : resultOutcome === "draw"
                  ? "0 0 10px rgba(255,215,0,0.5), 0 0 40px rgba(255,215,0,0.2)"
                  : undefined,
            }}
          >
            {resultOutcome === "win" && "YOU WIN!"}
            {resultOutcome === "lose" && "YOU LOSE"}
            {resultOutcome === "draw" && "DRAW!"}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Hand options */}
      <div className="flex items-center gap-8">
        {CHOICES.map((choice, index) => (
          <motion.button
            key={choice.id}
            className={cn(
              "relative w-[100px] h-[100px] rounded-full flex items-center justify-center",
              "border-2 transition-all duration-300",
              selected === choice.id
                ? cn("border-indigo-400 bg-indigo-500/20", getResultBorder(choice.id))
                : "border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-400/60"
            )}
            whileHover={{ scale: 1.1, y: -5 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSelect(choice.id)}
            disabled={isShaking || isRevealing}
            initial={{ opacity: 0, y: 30 }}
            animate={{
              opacity: 1,
              y: isShaking ? [0, -20, 0, -20, 0, -20, 0] : 0,
            }}
            transition={
              isShaking
                ? { duration: 1.2, ease: "easeInOut" }
                : { delay: index * 0.1 }
            }
            style={{
              boxShadow: selected === choice.id
                ? getResultGlow(choice.id) ||
                  `0 0 25px ${choice.color}66, inset 0 0 15px ${choice.color}22`
                : "none",
            }}
          >
            <span className="hand text-5xl select-none">{choice.emoji}</span>

            {/* Label */}
            <span
              className={cn(
                "absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-semibold uppercase tracking-wider",
                selected === choice.id ? "text-indigo-300" : "text-gray-500"
              )}
            >
              {choice.label}
            </span>

            {/* Selection ring */}
            {selected === choice.id && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-indigo-400/50"
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
