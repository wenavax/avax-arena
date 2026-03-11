/**
 * Centralized chain configuration for server-side API routes.
 * Uses viem chain definitions based on NEXT_PUBLIC_NETWORK env var.
 */

import { createPublicClient, http } from 'viem';
import { avalanche } from 'viem/chains';
import { IS_MAINNET, ACTIVE_RPC_URLS, ACTIVE_RPC_URL, ACTIVE_NETWORK_NAME } from './constants';

/** The active viem chain object */
export const activeChain = avalanche;

/** Network label for API responses */
export const networkLabel = 'avalanche-mainnet';

/** Create a public client for the active network */
export function createActiveClient(rpcUrl?: string) {
  return createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl ?? ACTIVE_RPC_URL, { timeout: 15_000 }),
  });
}

/** Execute a read with RPC fallback across all configured URLs */
export async function withRpcFallback<T>(
  fn: (client: ReturnType<typeof createPublicClient>) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const rpcUrl of ACTIVE_RPC_URLS) {
    try {
      const client = createPublicClient({
        chain: activeChain,
        transport: http(rpcUrl, { timeout: 10_000 }),
      });
      return await fn(client);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export { IS_MAINNET, ACTIVE_RPC_URL, ACTIVE_RPC_URLS, ACTIVE_NETWORK_NAME };
