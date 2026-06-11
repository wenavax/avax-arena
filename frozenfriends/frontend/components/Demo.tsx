'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, FastForward, MessageSquare, Gift, Heart, Sparkles, Eye } from 'lucide-react';
import { Pet, randomPet, applyMoodDelta, personalityLabel } from '@/lib/pet-visual';
import { DiaryEntry, generateEvent } from '@/lib/events';
import { PetSvg } from './PetSvg';

const MAX_DIARY = 5;

export function Demo() {
  const [pet, setPet] = useState<Pet | null>(null);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [day, setDay] = useState(1);
  const [animatingEvent, setAnimatingEvent] = useState(false);

  function spawn() {
    setPet(randomPet());
    setDiary([]);
    setDay(1);
  }

  function skipDay() {
    if (!pet || animatingEvent) return;
    setAnimatingEvent(true);

    // Generate a "random other pet" for the event
    const other = randomPet();
    const event = generateEvent(pet, other);

    setTimeout(() => {
      const updated = applyMoodDelta(pet, event.moodDelta);
      setPet(updated);
      setDiary((d) => [event, ...d].slice(0, MAX_DIARY));
      setDay((d) => d + 1);
      setAnimatingEvent(false);
    }, 700);
  }

  return (
    <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
      {/* Left: Pet panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col items-center">
        {!pet ? (
          <div className="flex flex-col items-center justify-center text-center py-12 min-h-[420px]">
            <div className="text-6xl mb-4 opacity-30">🐧</div>
            <p className="text-white/40 mb-6">No Frost Sprite yet</p>
            <button
              onClick={spawn}
              className="px-6 py-3 bg-frost-500 hover:bg-frost-300 text-frost-900 font-semibold rounded-xl flex items-center gap-2 transition-colors"
            >
              <Shuffle className="w-4 h-4" />
              Spawn a Sprite
            </button>
          </div>
        ) : (
          <div className="w-full">
            {/* Pet visual */}
            <div className="relative flex justify-center mb-4">
              <motion.div
                key={pet.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
              >
                <PetSvg pet={pet} size={200} />
              </motion.div>
              {animatingEvent && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-2 right-2 text-2xl"
                >
                  💭
                </motion.div>
              )}
            </div>

            {/* Pet name + meta */}
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold text-white/90">{pet.name}</h3>
              <p className="text-xs text-white/40 mt-1">{personalityLabel(pet)}</p>
              <p className="text-[10px] text-white/30 mt-1">Day {day} · Mood {pet.mood}/100</p>
            </div>

            {/* Stat bars */}
            <div className="space-y-2 mb-5">
              <StatBar label="Bold" value={pet.bold} color="#fbbf24" />
              <StatBar label="Social" value={pet.social} color="#a855f7" />
              <StatBar label="Curious" value={pet.curious} color="#ec4899" />
              <StatBar label="Mood" value={pet.mood} color="#06b6d4" />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={skipDay}
                disabled={animatingEvent}
                className="flex-1 px-4 py-2.5 bg-frost-500/20 hover:bg-frost-500/30 border border-frost-500/40 text-frost-300 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <FastForward className="w-4 h-4" />
                Skip 24h
              </button>
              <button
                onClick={spawn}
                disabled={animatingEvent}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                aria-label="New pet"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Diary */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4 text-white/80">
          <Eye className="w-4 h-4" />
          <h3 className="font-semibold">Diary</h3>
          <span className="text-xs text-white/30 ml-auto">{diary.length}/{MAX_DIARY} entries</span>
        </div>

        {diary.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">
            <p>Press <strong className="text-frost-300">Skip 24h</strong> to see what your sprite did overnight.</p>
            <p className="mt-3 text-xs text-white/30">AI-generated narratives in the real game. Pre-written templates in this demo.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {diary.map((e) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 text-xs text-white/40 mb-2">
                    {e.eventType === 'chat' ? (
                      <MessageSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Gift className="w-3.5 h-3.5" />
                    )}
                    <span>{e.eventType === 'chat' ? 'Chat' : 'Gift'}</span>
                    <span className="text-white/20">·</span>
                    <span>met {e.otherName}</span>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed">{e.narrative}</p>
                  <div className="flex items-center gap-2 mt-3 text-[10px]">
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                        e.moodDelta >= 0
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      <Heart className="w-2.5 h-2.5" />
                      {e.moodDelta >= 0 ? '+' : ''}{e.moodDelta} mood
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/50 mb-1">
        <span>{label}</span>
        <span className="font-mono text-white/30">{value}/100</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
