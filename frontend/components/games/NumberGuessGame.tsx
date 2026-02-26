"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface NumberGuessGameProps {
  onSelect: (move: number) => void;
  result?: number;
  isRevealing?: boolean;
}

export default function NumberGuessGame({
  onSelect,
  result,
  isRevealing = false,
}: NumberGuessGameProps) {
  const [selected, setSelected] = useState<number>(50);
  const [confirmed, setConfirmed] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [displayNumber, setDisplayNumber] = useState<number>(50);
  const [isAnimating, setIsAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRevealing && result !== undefined) {
      setIsAnimating(true);
      setShowResult(false);

      // Rapid counter animation
      let count = 0;
      const maxCycles = 30;
      const interval = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 100) + 1);
        count++;
        if (count >= maxCycles) {
          clearInterval(interval);
          setDisplayNumber(result);
          setIsAnimating(false);
          setShowResult(true);
        }
      }, 60);

      return () => clearInterval(interval);
    }
  }, [isRevealing, result]);

  const handleConfirm = () => {
    if (confirmed || isRevealing) return;
    setConfirmed(true);
    setDisplayNumber(selected);
    onSelect(selected);
  };

  // Generate gauge tick marks
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5);

  // Calculate gauge arc position (percentage to angle: 0-100 maps to -135 to 135 degrees)
  const valueToAngle = (val: number) => -135 + (val / 100) * 270;
  const needleAngle = valueToAngle(confirmed ? displayNumber : selected);

  // Color based on value
  const getValueColor = (val: number) => {
    if (val <= 25) return "#00ff88";
    if (val <= 50) return "#00f0ff";
    if (val <= 75) return "#ffd700";
    return "#ff3366";
  };

  const currentColor = getValueColor(confirmed ? displayNumber : selected);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] opacity-15"
          style={{
            background: `radial-gradient(circle, ${currentColor} 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* Gauge / Dial */}
      <div className="relative w-64 h-40 mb-4">
        {/* Gauge background arc */}
        <svg
          viewBox="0 0 200 120"
          className="w-full h-full"
          style={{ filter: `drop-shadow(0 0 10px ${currentColor}33)` }}
        >
          {/* Background arc */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Gradient arc (filled portion) */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00ff88" />
              <stop offset="33%" stopColor="#00f0ff" />
              <stop offset="66%" stopColor="#ffd700" />
              <stop offset="100%" stopColor="#ff3366" />
            </linearGradient>
          </defs>
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="251"
            strokeDashoffset={251 - (251 * (confirmed ? displayNumber : selected)) / 100}
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />

          {/* Tick marks */}
          {ticks.map((tick) => {
            const angle = (-135 + (tick / 100) * 270) * (Math.PI / 180);
            const innerR = 72;
            const outerR = tick % 25 === 0 ? 85 : 80;
            const cx = 100;
            const cy = 110;
            return (
              <line
                key={tick}
                x1={cx + innerR * Math.cos(angle)}
                y1={cy + innerR * Math.sin(angle)}
                x2={cx + outerR * Math.cos(angle)}
                y2={cy + outerR * Math.sin(angle)}
                stroke={
                  tick % 25 === 0
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(255,255,255,0.15)"
                }
                strokeWidth={tick % 25 === 0 ? 2 : 1}
              />
            );
          })}

          {/* Labels */}
          {[0, 25, 50, 75, 100].map((label) => {
            const angle = (-135 + (label / 100) * 270) * (Math.PI / 180);
            const r = 96;
            const cx = 100;
            const cy = 110;
            return (
              <text
                key={label}
                x={cx + r * Math.cos(angle)}
                y={cy + r * Math.sin(angle)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize="8"
                fontFamily="Orbitron"
              >
                {label}
              </text>
            );
          })}

          {/* Needle */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: "100px 110px",
              transition: isAnimating ? "none" : "transform 0.3s ease",
            }}
          >
            <line
              x1="100"
              y1="110"
              x2="100"
              y2="40"
              stroke={currentColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 4px ${currentColor})`,
              }}
            />
            <circle
              cx="100"
              cy="110"
              r="5"
              fill={currentColor}
              style={{
                filter: `drop-shadow(0 0 8px ${currentColor})`,
              }}
            />
          </g>
        </svg>

        {/* Center number display */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <motion.p
            className="font-['JetBrains_Mono'] text-4xl font-bold"
            style={{
              color: currentColor,
              textShadow: `0 0 20px ${currentColor}88, 0 0 40px ${currentColor}44`,
            }}
            animate={isAnimating ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.15, repeat: isAnimating ? Infinity : 0 }}
          >
            {confirmed ? displayNumber : selected}
          </motion.p>
        </div>
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
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">
              Result
            </p>
            <p
              className="font-['JetBrains_Mono'] text-3xl font-bold"
              style={{
                color: getValueColor(result),
                textShadow: `0 0 20px ${getValueColor(result)}88`,
              }}
            >
              {result}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slider input */}
      {!confirmed && (
        <motion.div
          className="w-full max-w-xs space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Range slider */}
          <div className="relative">
            <input
              ref={inputRef}
              type="range"
              min="1"
              max="100"
              value={selected}
              onChange={(e) => setSelected(parseInt(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #00ff88 0%, #00f0ff 33%, #ffd700 66%, #ff3366 100%)`,
                WebkitAppearance: "none",
              }}
            />
            {/* Gradient bar background */}
            <div
              className="absolute top-0 left-0 w-full h-2 rounded-full pointer-events-none opacity-30"
              style={{
                background:
                  "linear-gradient(to right, #00ff88, #00f0ff, #ffd700, #ff3366)",
              }}
            />
          </div>

          {/* Number input */}
          <div className="flex items-center gap-3 justify-center">
            <input
              type="number"
              min="1"
              max="100"
              value={selected}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= 100) setSelected(val);
              }}
              className={cn(
                "w-20 text-center py-2 rounded-lg font-['JetBrains_Mono'] text-lg font-bold",
                "bg-[#1a1a2e] border border-cyan-500/30 text-cyan-300",
                "focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
              )}
            />
            <motion.button
              className={cn(
                "btn-neon btn-neon-cyan font-['Orbitron'] text-sm tracking-wider"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleConfirm}
            >
              CONFIRM
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
