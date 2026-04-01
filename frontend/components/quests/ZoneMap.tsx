'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ZoneCard from './ZoneCard';
import type { QuestZone, CurrentQuest } from '@/types/quest';
import { ZONE_ELEMENT_STYLES } from '@/types/quest';

interface ZoneMapProps {
  zones: QuestZone[];
  currentQuests: CurrentQuest[];
  selectedZoneId: number | null;
  onSelectZone: (zoneId: number) => void;
  currentTier: number;
}

export default function ZoneMap({
  zones,
  currentQuests,
  selectedZoneId,
  onSelectZone,
  currentTier,
}: ZoneMapProps) {
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);

  // Count active/available quests per zone
  const questCountByZone = currentQuests.reduce<Record<number, number>>((acc, q) => {
    if (q.status !== 'completed') {
      acc[q.quest.zone_id] = (acc[q.quest.zone_id] || 0) + 1;
    }
    return acc;
  }, {});

  // Get the active zone from current quests (for highlighting)
  const activeZoneIds = new Set(
    currentQuests.filter(q => q.status === 'active').map(q => q.quest.zone_id)
  );

  return (
    <div className="w-full">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-white text-sm uppercase tracking-wider">
          Quest Zones
        </h2>
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-white/30 text-xs font-pixel">
          8 Zones
        </span>
      </div>

      {/* Zone grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {zones.map((zone, i) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            isActive={selectedZoneId === zone.id}
            questCount={questCountByZone[zone.id] || 0}
            onClick={() => onSelectZone(zone.id)}
            index={i}
          />
        ))}
      </div>

      {/* Selected zone detail panel */}
      <AnimatePresence mode="wait">
        {selectedZoneId !== null && (
          <ZoneDetail
            zone={zones.find(z => z.id === selectedZoneId)!}
            hasActiveQuest={activeZoneIds.has(selectedZoneId)}
            questCount={questCountByZone[selectedZoneId] || 0}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---- Zone detail panel (appears below grid when a zone is selected) ---- */

function ZoneDetail({
  zone,
  hasActiveQuest,
  questCount,
}: {
  zone: QuestZone;
  hasActiveQuest: boolean;
  questCount: number;
}) {
  const style = ZONE_ELEMENT_STYLES[zone.element] ?? ZONE_ELEMENT_STYLES.Fire;

  return (
    <motion.div
      key={zone.id}
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div
        className="relative rounded-2xl border border-white/[0.06] p-5 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${style.color}08, transparent)`,
        }}
      >
        {/* Background glow */}
        <div
          className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: style.color }}
        />

        <div className="relative flex flex-col sm:flex-row gap-4">
          {/* Left: icon + title */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-3xl">{style.icon}</span>
              <div>
                <h3 className="font-display text-white text-sm">{zone.name}</h3>
                <span
                  className="text-[10px] font-pixel uppercase"
                  style={{ color: style.color }}
                >
                  {zone.element} Zone
                </span>
              </div>
            </div>
            <p className="text-white/40 text-xs leading-relaxed">
              {zone.lore ? zone.lore.slice(0, 200) + '...' : zone.description}
            </p>
          </div>

          {/* Right: stats */}
          <div className="flex sm:flex-col items-center gap-3 sm:gap-2 text-center sm:min-w-[100px]">
            {hasActiveQuest && (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: style.color }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ background: style.color }}
                  />
                </span>
                <span className="text-[10px] font-pixel" style={{ color: style.color }}>
                  Active
                </span>
              </div>
            )}
            {questCount > 0 && (
              <span className="text-white/40 text-[10px] font-pixel">
                {questCount} quest{questCount > 1 ? 's' : ''} here
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
