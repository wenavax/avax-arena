"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ElementalClashGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

const ELEMENTS = [
  { id: 1, emoji: "\ud83d\udd25", name: "Fire", color: "#ff4400", glow: "rgba(255, 68, 0, 0.5)", beats: [3, 4] },
  { id: 2, emoji: "\ud83d\udca7", name: "Water", color: "#00aaff", glow: "rgba(0, 170, 255, 0.5)", beats: [1, 5] },
  { id: 3, emoji: "\ud83c\udf2a\ufe0f", name: "Wind", color: "#ccddff", glow: "rgba(204, 221, 255, 0.5)", beats: [2, 5] },
  { id: 4, emoji: "\u2744\ufe0f", name: "Ice", color: "#88ddff", glow: "rgba(136, 221, 255, 0.5)", beats: [2, 3] },
  { id: 5, emoji: "\ud83c\udf0d", name: "Earth", color: "#88cc00", glow: "rgba(136, 204, 0, 0.5)", beats: [1, 4] },
];

// Element CSS classes from globals.css
const ELEMENT_CLASSES: Record<number, string> = {
  1: "element-fire",
  2: "element-water",
  3: "element-wind",
  4: "element-lightning", // closest to Ice in the CSS
  5: "element-earth",
};

export default function ElementalClashGame({
  onSelect,
  result,
  isRevealing = false,
}: ElementalClashGameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isClashing, setIsClashing] = useState(false);
  const [outcome, setOutcome] = useState<"win" | "lose" | "draw" | null>(null);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    if (isRevealing && result !== undefined && selected !== null) {
      setIsClashing(true);
      setShowResult(false);
      setShowBurst(false);

      const timer = setTimeout(() => {
        setIsClashing(false);
        setShowResult(true);
        setShowBurst(true);

        const playerElement = ELEMENTS.find((e) => e.id === selected);
        if (selected === result) {
          setOutcome("draw");
        } else if (playerElement?.beats.includes(result)) {
          setOutcome("win");
        } else {
          setOutcome("lose");
        }

        // Remove burst after animation
        setTimeout(() => setShowBurst(false), 1000);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isRevealing, result, selected]);

  const handleSelect = (id: number) => {
    if (isClashing || isRevealing) return;
    setSelected(id);
    onSelect(id);
  };

  // Pentagon layout positions
  const getPosition = (index: number, total: number, radius: number) => {
    const angle = (index * (360 / total) - 90) * (Math.PI / 180);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      {/* Ambient multi-element glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {ELEMENTS.map((el, i) => {
          const pos = getPosition(i, 5, 150);
          return (
            <motion.div
              key={el.id}
              className="absolute w-32 h-32 rounded-full blur-[80px] opacity-10"
              style={{
                background: el.color,
                left: `calc(50% + ${pos.x}px - 64px)`,
                top: `calc(40% + ${pos.y}px - 64px)`,
              }}
              animate={{
                opacity: selected === el.id ? 0.25 : 0.08,
                scale: selected === el.id ? 1.3 : 1,
              }}
              transition={{ duration: 0.5 }}
            />
          );
        })}
      </div>

      {/* Clash result display */}
      <AnimatePresence>
        {showResult && result !== undefined && selected !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="flex items-center gap-6 mb-2"
          >
            {/* Player element */}
            <motion.div
              className="text-5xl"
              initial={{ x: -40 }}
              animate={{ x: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              {ELEMENTS.find((e) => e.id === selected)?.emoji}
            </motion.div>

            {/* Burst effect */}
            <motion.div
              className="relative"
              animate={{ scale: showBurst ? [0, 1.5, 1] : 1 }}
              transition={{ duration: 0.5 }}
            >
              <span
                className="font-['Orbitron'] text-xl font-black"
                style={{
                  background: "linear-gradient(135deg, #ff2d87, #ff4400, #ffd700)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                VS
              </span>
            </motion.div>

            {/* Opponent element */}
            <motion.div
              className="text-5xl"
              initial={{ x: 40 }}
              animate={{ x: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              {ELEMENTS.find((e) => e.id === result)?.emoji}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Outcome text */}
      <AnimatePresence>
        {outcome && showResult && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "font-['Orbitron'] text-xl font-bold tracking-wider",
              outcome === "win" && "text-green-400 text-glow-green",
              outcome === "lose" && "text-red-400",
              outcome === "draw" && "text-yellow-400"
            )}
            style={{
              textShadow:
                outcome === "lose"
                  ? "0 0 10px rgba(255,51,102,0.5)"
                  : outcome === "draw"
                  ? "0 0 10px rgba(255,215,0,0.5)"
                  : undefined,
            }}
          >
            {outcome === "win" && "VICTORY!"}
            {outcome === "lose" && "DEFEATED"}
            {outcome === "draw" && "STALEMATE"}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Pentagon element selector */}
      <div className="relative w-72 h-72">
        {/* Connection lines showing what beats what */}
        <svg className="absolute inset-0 w-full h-full" viewBox="-150 -150 300 300">
          {ELEMENTS.map((el) => {
            const fromPos = getPosition(el.id - 1, 5, 100);
            return el.beats.map((beatsId) => {
              const toPos = getPosition(beatsId - 1, 5, 100);
              return (
                <line
                  key={`${el.id}-${beatsId}`}
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toPos.x}
                  y2={toPos.y}
                  stroke={
                    selected === el.id
                      ? `${el.color}66`
                      : "rgba(255,255,255,0.05)"
                  }
                  strokeWidth={selected === el.id ? 2 : 1}
                  strokeDasharray={selected === el.id ? "none" : "4 4"}
                  style={{
                    transition: "all 0.3s ease",
                  }}
                />
              );
            });
          })}
        </svg>

        {/* Element orbs */}
        {ELEMENTS.map((element, index) => {
          const pos = getPosition(index, 5, 100);
          const isSelected = selected === element.id;

          return (
            <motion.button
              key={element.id}
              className={cn(
                "absolute w-16 h-16 rounded-full flex items-center justify-center",
                "border-2 transition-all duration-300 cursor-pointer",
                isSelected
                  ? "border-opacity-80 z-10"
                  : "border-opacity-30 hover:border-opacity-60"
              )}
              style={{
                left: `calc(50% + ${pos.x}px - 32px)`,
                top: `calc(50% + ${pos.y}px - 32px)`,
                borderColor: element.color,
                background: isSelected
                  ? `radial-gradient(circle, ${element.color}33, ${element.color}11)`
                  : `radial-gradient(circle, ${element.color}11, transparent)`,
                boxShadow: isSelected
                  ? `0 0 30px ${element.glow}, 0 0 60px ${element.glow}, inset 0 0 15px ${element.color}22`
                  : `0 0 10px ${element.color}22`,
              }}
              whileHover={{
                scale: 1.15,
                boxShadow: `0 0 25px ${element.glow}, 0 0 50px ${element.color}33`,
              }}
              whileTap={{ scale: 0.9 }}
              animate={
                isSelected
                  ? {
                      scale: [1, 1.1, 1],
                    }
                  : isClashing
                  ? {
                      scale: [1, 0.95, 1],
                      opacity: [1, 0.6, 1],
                    }
                  : {}
              }
              transition={{
                duration: isSelected ? 1.5 : 0.8,
                repeat: isSelected || isClashing ? Infinity : 0,
              }}
              onClick={() => handleSelect(element.id)}
              disabled={isClashing || isRevealing}
            >
              <span className="text-2xl select-none">{element.emoji}</span>

              {/* Particle effect pseudo-elements */}
              {isSelected && (
                <>
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 rounded-full"
                      style={{ background: element.color }}
                      animate={{
                        x: [0, (Math.random() - 0.5) * 40],
                        y: [0, (Math.random() - 0.5) * 40],
                        opacity: [0.8, 0],
                        scale: [1, 0],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.25,
                      }}
                    />
                  ))}
                </>
              )}

              {/* Ring pulse for selected */}
              {isSelected && (
                <motion.div
                  className="absolute inset-0 rounded-full border"
                  style={{ borderColor: element.color }}
                  animate={{
                    scale: [1, 1.5],
                    opacity: [0.5, 0],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                />
              )}
            </motion.button>
          );
        })}

        {/* Center label */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          {selected ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <p
                className="font-['Orbitron'] text-xs font-bold uppercase tracking-widest"
                style={{
                  color: ELEMENTS.find((e) => e.id === selected)?.color,
                  textShadow: `0 0 10px ${ELEMENTS.find((e) => e.id === selected)?.glow}`,
                }}
              >
                {ELEMENTS.find((e) => e.id === selected)?.name}
              </p>
            </motion.div>
          ) : (
            <p className="text-xs text-gray-600 font-['Orbitron'] uppercase tracking-wider">
              Choose
            </p>
          )}
        </div>
      </div>

      {/* Element legend */}
      <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-500">
        {ELEMENTS.map((el) => (
          <span key={el.id} className={cn(ELEMENT_CLASSES[el.id], "opacity-60")}>
            {el.emoji} {el.name}
          </span>
        ))}
      </div>
    </div>
  );
}
