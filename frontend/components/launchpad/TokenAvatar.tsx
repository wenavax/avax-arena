'use client';

import { tokenGradient } from '@/lib/launchpad';
import { cn } from '@/lib/utils';

/**
 * Deterministic generative avatar for a launched token — gradient disc derived
 * from the token address (trustless: no image uploads/hosting in v1).
 */
export default function TokenAvatar({
  address,
  symbol,
  size = 40,
  className,
}: {
  address: string;
  symbol?: string;
  size?: number;
  className?: string;
}) {
  const g = tokenGradient(address);
  const letter = (symbol || '?').replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn('relative rounded-full flex items-center justify-center flex-shrink-0 select-none', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
        boxShadow: `0 0 ${Math.round(size / 3)}px ${g.from}33`,
      }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 rounded-full border border-white/20" />
      <span
        className="font-display font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {letter}
      </span>
    </div>
  );
}
