'use client';

import { useContractEventWatcher } from '@/hooks/useContractEvents';

/**
 * Initializes real-time contract event watchers.
 * Place inside Web3Provider so it has access to the public client.
 */
export function EventProvider({ children }: { children: React.ReactNode }) {
  useContractEventWatcher();
  return <>{children}</>;
}
