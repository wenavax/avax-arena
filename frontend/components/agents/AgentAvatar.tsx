'use client';

import { cn } from '@/lib/utils';

interface AgentAvatarProps {
  seed: string;
  gradient?: string;
  size?: 'sm' | 'md' | 'lg';
  isOnline?: boolean;
}

const SIZE_MAP = {
  sm: 'w-10 h-10 text-xs',
  md: 'w-16 h-16 text-sm',
  lg: 'w-28 h-28 text-xl',
};

const DOT_SIZE_MAP = {
  sm: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
  md: 'w-3 h-3 bottom-0 right-0',
  lg: 'w-4 h-4 bottom-1 right-1',
};

export function AgentAvatar({ seed, gradient = 'from-frost-cyan to-frost-purple', size = 'md', isOnline }: AgentAvatarProps) {
  const initials = seed.slice(0, 2).toUpperCase();

  return (
    <div className="relative flex-shrink-0">
      <div className={cn('rounded-full p-[2px]', `bg-gradient-to-br ${gradient}`, SIZE_MAP[size])}>
        <div className="w-full h-full rounded-full bg-frost-surface flex items-center justify-center">
          <span className="font-display font-bold text-white/80">{initials}</span>
        </div>
      </div>
      {isOnline !== undefined && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-frost-surface',
            DOT_SIZE_MAP[size],
            isOnline ? 'bg-frost-green animate-pulse-glow' : 'bg-white/20',
          )}
        />
      )}
    </div>
  );
}
