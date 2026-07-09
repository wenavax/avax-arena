'use client';

/**
 * GameStageBanner — a slim maturity warning shown at the top of games that are
 * not production-money-ready. One shared look across the site: stage chip
 * (TESTNET / ALPHA / BETA) + a plain-language line about what that means for
 * the player's funds/progress. Keep messages honest and specific.
 */
import { AlertTriangle } from 'lucide-react';

export type GameStage = 'TESTNET' | 'ALPHA' | 'BETA';

const STAGE_COLOR: Record<GameStage, string> = {
  TESTNET: '#f97316', // orange — test chain, test funds
  ALPHA: '#a78bfa',   // violet — early build, things will change
  BETA: '#4dd0e1',    // cyan — near-final, still stabilising
};

export default function GameStageBanner({ stage, message }: { stage: GameStage; message: string }) {
  const c = STAGE_COLOR[stage];
  return (
    <div
      role="note"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-4 py-2.5 text-[12.5px] leading-relaxed"
      style={{
        borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
        background: `color-mix(in srgb, ${c} 8%, transparent)`,
      }}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold tracking-[0.14em]" style={{ color: c, fontSize: 10 }}>
        <AlertTriangle size={13} strokeWidth={2.4} />
        {stage}
      </span>
      <span className="text-white/65">{message}</span>
    </div>
  );
}
