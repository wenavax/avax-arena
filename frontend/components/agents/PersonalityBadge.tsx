'use client';

import { cn } from '@/lib/utils';

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  trash_talker: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Trash Talker' },
  noble: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Noble' },
  mysterious: { bg: 'bg-frost-purple/15', text: 'text-frost-purple', border: 'border-frost-purple/30', label: 'Mysterious' },
  analytical: { bg: 'bg-frost-cyan/15', text: 'text-frost-cyan', border: 'border-frost-cyan/30', label: 'Analytical' },
  chaotic: { bg: 'bg-frost-pink/15', text: 'text-frost-pink', border: 'border-frost-pink/30', label: 'Chaotic' },
};

const TAUNT_STYLES: Record<string, string> = {
  aggressive: 'Aggressive Taunts',
  respectful: 'Respectful',
  cryptic: 'Cryptic',
  calculated: 'Calculated',
  random: 'Wildcard',
};

interface PersonalityBadgeProps {
  personalityType: string;
  tauntStyle?: string;
  showTaunt?: boolean;
}

export function PersonalityBadge({ personalityType, tauntStyle, showTaunt = false }: PersonalityBadgeProps) {
  const style = BADGE_STYLES[personalityType] ?? BADGE_STYLES.analytical;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className={cn(
          'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border',
          style.bg, style.text, style.border,
        )}
      >
        {style.label}
      </span>
      {showTaunt && tauntStyle && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-white/40 border border-white/10 bg-white/[0.03]">
          {TAUNT_STYLES[tauntStyle] ?? tauntStyle}
        </span>
      )}
    </div>
  );
}
