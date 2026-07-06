import { createConfig } from '@privy-io/wagmi';
import { createConfig as createWagmiConfig, http } from 'wagmi';
import { avalanche, avalancheFuji } from 'viem/chains';
import { ACTIVE_RPC_URL } from './constants';

// Shared transports. Fuji is included so the launchpad can run rehearsals on
// the testnet (NEXT_PUBLIC_LAUNCHPAD_CHAIN=fuji) — mainnet UX is unaffected.
const transports = {
  [avalanche.id]: http(ACTIVE_RPC_URL, { timeout: 30_000 }),
  [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc', { timeout: 30_000 }),
};

// Privy-bridged wagmi config — used INSIDE <PrivyProvider>. Privy injects the
// wallet connectors at runtime, so no WalletConnect projectId is needed here.
// Every existing wagmi hook (useAccount / useWriteContract / usePublicClient /
// useSwitchChain / useWalletClient ...) keeps working unchanged.
export const config = createConfig({
  chains: [avalanche, avalancheFuji],
  transports,
});

// Read-only fallback used ONLY when NEXT_PUBLIC_PRIVY_APP_ID is missing, so the
// app still renders on-chain data (public reads) instead of crashing.
export const readOnlyConfig = createWagmiConfig({
  chains: [avalanche, avalancheFuji],
  transports,
  ssr: true,
});
