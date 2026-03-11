'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME } from '@/lib/constants';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shows a prominent banner + auto-switch button when the wallet
 * is connected to the wrong chain.
 */
export function ChainGuard() {
  const { chain, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || !chain || chain.id === ACTIVE_CHAIN_ID) return null;

  return (
    <div className="sticky top-0 z-[100] w-full bg-frost-red/90 backdrop-blur-sm text-white py-3 px-4 text-center">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium">
          Wrong network detected ({chain.name}). Please switch to {ACTIVE_NETWORK_NAME}.
        </span>
        <button
          onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin" />
              Switching...
            </>
          ) : (
            <>Switch to {ACTIVE_NETWORK_NAME}</>
          )}
        </button>
      </div>
    </div>
  );
}
