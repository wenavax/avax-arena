'use client';

import { motion } from 'framer-motion';
import { Map, Pickaxe, Swords, Gem, FlaskConical, ScrollText } from 'lucide-react';

const upcomingFeatures = [
  { icon: Swords, title: 'Daily Quests', desc: 'Complete daily challenges to earn FSB points and rare rewards.' },
  { icon: Map, title: 'Exploration', desc: 'Send your warriors on expeditions across the Frostbite world.' },
  { icon: Pickaxe, title: 'Resource Mining', desc: 'Mine rare materials to craft powerful gear for your warriors.' },
  { icon: Gem, title: 'Rare Drops', desc: 'Discover legendary items and exclusive NFT rewards.' },
  { icon: FlaskConical, title: 'Crafting System', desc: 'Combine resources to forge unique weapons and armor.' },
  { icon: ScrollText, title: 'Storyline Missions', desc: 'Uncover the lore of Frostbite through epic story quests.' },
];

export default function QuestsPage() {
  return (
    <div className="min-h-screen px-4 py-6 sm:py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Map className="w-10 h-10 text-frost-cyan" />
          <h1 className="text-4xl md:text-5xl font-display font-bold gradient-text">
            QUESTS
          </h1>
          <Map className="w-10 h-10 text-frost-cyan" />
        </div>
        <p className="text-white/50 text-lg mb-8">Epic adventures await your warriors</p>

        {/* Under Development Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-frost-cyan/30 bg-frost-cyan/5"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-frost-cyan opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-frost-cyan" />
          </span>
          <span className="text-frost-cyan font-display text-sm font-bold uppercase tracking-wider">
            Under Development
          </span>
        </motion.div>
      </motion.div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
        {upcomingFeatures.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="glass-card p-6 border border-white/5 hover:border-frost-cyan/20 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-frost-cyan/10 flex items-center justify-center mb-4 group-hover:bg-frost-cyan/20 transition-colors">
                <Icon className="w-6 h-6 text-frost-cyan" />
              </div>
              <h3 className="font-display font-bold text-white text-lg mb-2">{feature.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Message */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="text-center"
      >
        <p className="text-white/20 text-sm">
          The quest system is being built. Stay tuned for updates!
        </p>
      </motion.div>
    </div>
  );
}
