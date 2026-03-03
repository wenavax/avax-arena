'use client';

import { cn } from '@/lib/utils';
import { Swords, Sparkles, MessageCircle, Bot, Trophy } from 'lucide-react';

const EVENT_CONFIG: Record<string, { icon: typeof Swords; color: string; label: string }> = {
  battle_created: { icon: Swords, color: 'text-frost-orange bg-frost-orange/15 border-frost-orange/30', label: 'Battle Created' },
  battle_joined: { icon: Swords, color: 'text-frost-red bg-frost-red/15 border-frost-red/30', label: 'Battle Joined' },
  battle_resolved: { icon: Trophy, color: 'text-frost-gold bg-frost-gold/15 border-frost-gold/30', label: 'Battle Resolved' },
  warrior_minted: { icon: Sparkles, color: 'text-frost-purple bg-frost-purple/15 border-frost-purple/30', label: 'Warrior Minted' },
  message_posted: { icon: MessageCircle, color: 'text-frost-cyan bg-frost-cyan/15 border-frost-cyan/30', label: 'Message Posted' },
  agent_started: { icon: Bot, color: 'text-frost-green bg-frost-green/15 border-frost-green/30', label: 'Agent Joined' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface LiveEventItemProps {
  eventType: string;
  agentName: string | null;
  opponentName?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export function LiveEventItem({ eventType, agentName, opponentName, data, createdAt }: LiveEventItemProps) {
  const config = EVENT_CONFIG[eventType] ?? EVENT_CONFIG.agent_started;
  const Icon = config.icon;

  let description = '';
  switch (eventType) {
    case 'battle_created':
      description = `${agentName ?? 'Agent'} created a battle${data.stake ? ` (${data.stake} AVAX)` : ''}`;
      break;
    case 'battle_joined':
      description = `${agentName ?? 'Agent'} joined battle #${data.battleId ?? '?'}${data.stake ? ` (${data.stake} AVAX)` : ''}`;
      break;
    case 'battle_resolved':
      description = `${agentName ?? 'Agent'} ${opponentName ? `defeated ${opponentName}` : 'won a battle'}`;
      break;
    case 'warrior_minted':
      description = `${agentName ?? 'Agent'} minted a new warrior`;
      break;
    case 'message_posted':
      description = `${agentName ?? 'Agent'}: "${String(data.message ?? '').slice(0, 60)}"`;
      break;
    case 'agent_started':
      description = `${agentName ?? 'Agent'} joined the arena${data.strategy ? ` (${data.strategy})` : ''}`;
      break;
    default:
      description = `${agentName ?? 'Agent'} performed ${eventType}`;
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className={cn('flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border', config.color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70 font-mono truncate">{description}</p>
      </div>
      <span className="text-[10px] text-white/25 font-mono flex-shrink-0">{timeAgo(createdAt)}</span>
    </div>
  );
}
