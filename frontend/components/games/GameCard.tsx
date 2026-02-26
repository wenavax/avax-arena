"use client";

import { motion } from "framer-motion";
import { Users, Gamepad2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface GameCardProps {
  name: string;
  emoji: string;
  description: string;
  color: string;
  glowColor: string;
  slug: string;
  activePlayers?: number;
  totalGames?: number;
}

export default function GameCard({
  name,
  emoji,
  description,
  color,
  glowColor,
  slug,
  activePlayers = 0,
  totalGames = 0,
}: GameCardProps) {
  return (
    <Link href={`/play?game=${slug}`} className="block">
      <motion.div
        className="game-card glass-card group relative overflow-hidden p-6"
        whileHover={{ y: -8, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          boxShadow: `0 0 0px ${glowColor}`,
        }}
      >
        {/* Background gradient overlay */}
        <div
          className={cn(
            "absolute inset-0 opacity-10 bg-gradient-to-br transition-opacity duration-500 group-hover:opacity-25",
            color
          )}
        />

        {/* Animated corner accents */}
        <div
          className="absolute top-0 right-0 w-32 h-32 opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
          style={{ background: glowColor }}
        />
        <div
          className="absolute bottom-0 left-0 w-24 h-24 opacity-10 blur-xl transition-opacity duration-500 group-hover:opacity-30"
          style={{ background: glowColor }}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Emoji with float animation */}
          <motion.div
            className="text-6xl mb-4 inline-block"
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {emoji}
          </motion.div>

          {/* Game name */}
          <h3
            className="font-['Orbitron'] text-xl font-bold text-white mb-2 tracking-wide"
            style={{
              textShadow: `0 0 20px ${glowColor}`,
            }}
          >
            {name}
          </h3>

          {/* Description */}
          <p className="text-sm text-gray-400 leading-relaxed mb-4 min-h-[40px]">
            {description}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-4 mb-4">
            {activePlayers > 0 && (
              <motion.div
                className="flex items-center gap-1.5 text-xs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <Users className="w-3 h-3 text-gray-500" />
                <span className="text-gray-300">
                  {activePlayers}{" "}
                  <span className="text-gray-500">playing</span>
                </span>
              </motion.div>
            )}
            {totalGames > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Gamepad2 className="w-3 h-3 text-gray-500" />
                <span className="text-gray-300">
                  {totalGames.toLocaleString()}{" "}
                  <span className="text-gray-500">games</span>
                </span>
              </div>
            )}
          </div>

          {/* Play Now button */}
          <motion.div
            className={cn(
              "flex items-center justify-center gap-2 py-3 px-5 rounded-xl",
              "bg-gradient-to-r text-white font-semibold text-sm tracking-wide uppercase",
              "transition-all duration-300",
              "opacity-80 group-hover:opacity-100",
              color
            )}
            whileHover={{
              boxShadow: `0 0 30px ${glowColor}, 0 0 60px ${glowColor}`,
            }}
          >
            <span className="font-['Orbitron'] text-xs">Play Now</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </motion.div>
        </div>

        {/* Hover glow border effect */}
        <motion.div
          className="absolute inset-0 rounded-[20px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            boxShadow: `inset 0 0 30px ${glowColor}, 0 0 40px ${glowColor}`,
          }}
        />
      </motion.div>
    </Link>
  );
}
