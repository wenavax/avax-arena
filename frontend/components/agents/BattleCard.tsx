'use client';

import { cn } from '@/lib/utils';
import { Swords, Clock } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

interface BattleAgent {
  id?: string;
  name?: string;
  strategy?: string;
  walletAddress?: string;
}

interface BattleCardProps {
  status: string;
  stake: string;
  attacker: BattleAgent;
  defender: BattleAgent | null;
  attackerNft: number | null;
  defenderNft: number | null;
  attackerElement: number | null;
  defenderElement: number | null;
  createdAt: string;
}

const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
const ELEMENT_EMOJI = ['🔥', '💧', '🌪️', '❄️', '🌍', '⚡', '🌑', '✨'];

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

export function BattleCard({
  status,
  stake,
  attacker,
  defender,
  attackerNft,
  defenderNft,
  attackerElement,
  defenderElement,
  createdAt,
}: BattleCardProps) {
  const isOpen = status === 'open';

  return (
    <div className={cn(
      'glass-card p-5 border transition-all duration-300',
      isOpen
        ? 'border-frost-orange/30 hover:border-frost-orange/50'
        : 'border-frost-cyan/30 hover:border-frost-cyan/50',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Swords className={cn('w-4 h-4', isOpen ? 'text-frost-orange' : 'text-frost-cyan')} />
          <span className={cn(
            'text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
            isOpen
              ? 'text-frost-orange bg-frost-orange/15 border-frost-orange/30'
              : 'text-frost-cyan bg-frost-cyan/15 border-frost-cyan/30',
          )}>
            {isOpen ? 'Waiting' : 'Active'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-white/30">
          <Clock className="w-3 h-3" />
          <span className="text-[10px] font-mono">{timeSince(createdAt)}</span>
        </div>
      </div>

      {/* VS Layout */}
      <div className="flex items-center gap-3">
        {/* Attacker */}
        <div className="flex-1 text-center">
          <AgentAvatar
            seed={attacker.name?.slice(0, 2) ?? 'AT'}
            gradient="from-red-500 to-frost-orange"
            size="sm"
          />
          <p className="text-xs font-bold text-white mt-2 truncate">
            {attacker.name || (attacker.walletAddress ? shortenAddr(attacker.walletAddress) : 'Unknown')}
          </p>
          {attackerElement !== null && (
            <span className="text-[10px] text-white/40">
              {ELEMENT_EMOJI[attackerElement]} #{attackerNft}
            </span>
          )}
        </div>

        {/* VS */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-lg font-display font-bold gradient-text">VS</span>
          <span className="text-xs font-mono text-frost-gold font-bold">{stake} AVAX</span>
        </div>

        {/* Defender */}
        <div className="flex-1 text-center">
          {defender ? (
            <>
              <AgentAvatar
                seed={defender.name?.slice(0, 2) ?? 'DF'}
                gradient="from-blue-500 to-frost-cyan"
                size="sm"
              />
              <p className="text-xs font-bold text-white mt-2 truncate">
                {defender.name || (defender.walletAddress ? shortenAddr(defender.walletAddress) : 'Unknown')}
              </p>
              {defenderElement !== null && (
                <span className="text-[10px] text-white/40">
                  {ELEMENT_EMOJI[defenderElement]} #{defenderNft}
                </span>
              )}
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center mx-auto">
                <span className="text-white/20 text-xs">?</span>
              </div>
              <p className="text-xs text-white/30 mt-2">Awaiting...</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
