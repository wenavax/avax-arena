"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Skull } from "lucide-react";
import { cn } from "@/lib/utils";

interface CrashDiceGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

export default function CrashDiceGame({
  onSelect,
  result,
  isRevealing = false,
}: CrashDiceGameProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCriticalHit, setIsCriticalHit] = useState(false);
  const [isCriticalFail, setIsCriticalFail] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  const cycleValues = useCallback(() => {
    let count = 0;
    const maxCycles = 25;
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 20) + 1);
      count++;
      if (count >= maxCycles) {
        clearInterval(interval);
      }
    }, 70);
    return interval;
  }, []);

  useEffect(() => {
    if (isRevealing && result !== undefined) {
      setIsRolling(true);
      setShowResult(false);
      setIsCriticalHit(false);
      setIsCriticalFail(false);
      setShowFlash(false);

      const interval = cycleValues();

      const timer = setTimeout(() => {
        clearInterval(interval);
        setIsRolling(false);
        setDisplayValue(result);
        setShowResult(true);

        if (result === 20) {
          setIsCriticalHit(true);
          setShowFlash(true);
          setTimeout(() => setShowFlash(false), 500);
        } else if (result === 1) {
          setIsCriticalFail(true);
        }
      }, 1800);

      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
  }, [isRevealing, result, cycleValues]);

  const handleSelect = (value: number) => {
    if (isRolling || isRevealing) return;
    setSelected(value);
    setDisplayValue(value);
    onSelect(value);
  };

  const getNumberColor = (num: number) => {
    if (num === 20) return "#ff2d87";
    if (num === 1) return "#ff3366";
    if (num >= 15) return "#00ff88";
    if (num >= 10) return "#00f0ff";
    if (num >= 5) return "#ffd700";
    return "#ff8800";
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6 relative">
      {/* Screen flash for critical hit */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              background: "radial-gradient(circle, #ff2d87, transparent)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] transition-opacity duration-500",
            isCriticalHit ? "opacity-30" : isCriticalFail ? "opacity-20" : "opacity-10"
          )}
          style={{
            background: `radial-gradient(circle, ${
              isCriticalHit ? "#ff2d87" : isCriticalFail ? "#ff3366" : "#00f0ff"
            } 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* D20 Shape */}
      <div className="relative mb-4">
        <motion.div
          className={cn("d20 relative", isCriticalHit && "critical")}
          animate={
            isRolling
              ? {
                  rotate: [0, 120, 240, 360],
                  scale: [1, 0.9, 1.1, 1],
                }
              : isCriticalHit
              ? {
                  scale: [1, 1.05, 1],
                }
              : {}
          }
          transition={{
            duration: isRolling ? 0.6 : 1,
            repeat: isRolling ? Infinity : isCriticalHit ? Infinity : 0,
            ease: "easeInOut",
          }}
        >
          {/* Diamond/D20 polygon shape */}
          <svg width="140" height="160" viewBox="0 0 140 160" className="drop-shadow-lg">
            {/* Main diamond shape */}
            <defs>
              <linearGradient id="d20grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a1a3e" />
                <stop offset="50%" stopColor="#12122a" />
                <stop offset="100%" stopColor="#0a0a1e" />
              </linearGradient>
              <linearGradient id="d20border" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isCriticalHit ? "#ff2d87" : isCriticalFail ? "#ff3366" : "#00f0ff"} />
                <stop offset="50%" stopColor={isCriticalHit ? "#ff6b9d" : isCriticalFail ? "#ff6688" : "#7b2ff7"} />
                <stop offset="100%" stopColor={isCriticalHit ? "#ff2d87" : isCriticalFail ? "#ff3366" : "#00f0ff"} />
              </linearGradient>
            </defs>

            {/* Outer shape */}
            <polygon
              points="70,5 135,50 120,130 20,130 5,50"
              fill="url(#d20grad)"
              stroke="url(#d20border)"
              strokeWidth="2"
            />
            {/* Internal facet lines */}
            <line x1="70" y1="5" x2="70" y2="80" stroke="url(#d20border)" strokeWidth="0.5" opacity="0.3" />
            <line x1="70" y1="5" x2="20" y2="130" stroke="url(#d20border)" strokeWidth="0.5" opacity="0.2" />
            <line x1="70" y1="5" x2="120" y2="130" stroke="url(#d20border)" strokeWidth="0.5" opacity="0.2" />
            <line x1="5" y1="50" x2="120" y2="130" stroke="url(#d20border)" strokeWidth="0.5" opacity="0.15" />
            <line x1="135" y1="50" x2="20" y2="130" stroke="url(#d20border)" strokeWidth="0.5" opacity="0.15" />
            <line x1="5" y1="50" x2="135" y2="50" stroke="url(#d20border)" strokeWidth="0.5" opacity="0.2" />
          </svg>

          {/* Center number */}
          <div className="absolute inset-0 flex items-center justify-center">
            {displayValue !== null ? (
              <motion.span
                className="font-['JetBrains_Mono'] text-3xl font-bold"
                style={{
                  color: getNumberColor(displayValue),
                  textShadow: `0 0 20px ${getNumberColor(displayValue)}88, 0 0 40px ${getNumberColor(displayValue)}44`,
                }}
                animate={isRolling ? { scale: [0.8, 1.2, 0.8] } : {}}
                transition={{ duration: 0.15, repeat: isRolling ? Infinity : 0 }}
              >
                {displayValue}
              </motion.span>
            ) : (
              <span className="font-['JetBrains_Mono'] text-xl text-gray-600">D20</span>
            )}
          </div>

          {/* Critical hit particles */}
          <AnimatePresence>
            {isCriticalHit && (
              <>
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "#ff2d87",
                      left: "50%",
                      top: "50%",
                    }}
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{
                      x: Math.cos((i * Math.PI * 2) / 8) * 60,
                      y: Math.sin((i * Math.PI * 2) / 8) * 60,
                      opacity: [1, 0],
                      scale: [1, 0],
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.12,
                    }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          {/* Critical fail skull */}
          <AnimatePresence>
            {isCriticalFail && (
              <motion.div
                className="absolute -top-4 -right-4"
                initial={{ opacity: 0, scale: 0, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: "spring" }}
              >
                <Skull className="w-8 h-8 text-red-500" style={{ filter: "drop-shadow(0 0 8px #ff3366)" }} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Result label */}
      <AnimatePresence>
        {showResult && result !== undefined && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <p
              className={cn(
                "font-['Orbitron'] text-lg font-bold tracking-wider",
                isCriticalHit && "text-glow-pink",
                isCriticalFail && "text-red-400"
              )}
              style={{
                color: isCriticalHit ? "#ff2d87" : isCriticalFail ? "#ff3366" : "#00f0ff",
                textShadow: isCriticalHit
                  ? "0 0 20px rgba(255,45,135,0.6)"
                  : isCriticalFail
                  ? "0 0 20px rgba(255,51,102,0.6)"
                  : "0 0 20px rgba(0,240,255,0.4)",
              }}
            >
              {isCriticalHit ? "CRITICAL HIT!" : isCriticalFail ? "CRITICAL FAIL!" : `Rolled ${result}`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Circular number selector */}
      <div className="relative w-72 h-72">
        {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
          const angle = ((num - 1) * (360 / 20) - 90) * (Math.PI / 180);
          const radius = 115;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isChosen = selected === num;

          return (
            <motion.button
              key={num}
              className={cn(
                "absolute w-9 h-9 rounded-full flex items-center justify-center",
                "font-['JetBrains_Mono'] text-xs font-bold",
                "border transition-all duration-200",
                isChosen
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 z-10"
                  : "border-white/10 bg-[#1a1a2e]/80 text-gray-400 hover:border-cyan-400/50 hover:text-cyan-300"
              )}
              style={{
                left: `calc(50% + ${x}px - 18px)`,
                top: `calc(50% + ${y}px - 18px)`,
                boxShadow: isChosen
                  ? `0 0 15px ${getNumberColor(num)}66, inset 0 0 8px ${getNumberColor(num)}22`
                  : "none",
              }}
              whileHover={{ scale: 1.2, zIndex: 20 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSelect(num)}
              disabled={isRolling || isRevealing}
            >
              {num}
              {isChosen && (
                <motion.div
                  className="absolute inset-0 rounded-full border border-cyan-400/50"
                  animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </motion.button>
          );
        })}

        {/* Center label */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <p className="font-['Orbitron'] text-xs text-gray-600 uppercase tracking-widest">
            {selected ? `Selected: ${selected}` : "Choose 1-20"}
          </p>
        </div>
      </div>
    </div>
  );
}
