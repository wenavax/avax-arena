import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { avalanche, avalancheFuji } from 'wagmi/chains';
import { http } from 'wagmi';

// RainbowKit requires a non-empty projectId at config time (including SSG).
// In production, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID must be set to a real
// WalletConnect Cloud project ID. The build-time placeholder allows SSG to
// succeed but WalletConnect will not function without a real ID.
const BUILD_PLACEHOLDER = 'build-time-placeholder';
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || BUILD_PLACEHOLDER;

if (typeof window !== 'undefined' && projectId === BUILD_PLACEHOLDER) {
  console.error(
    '[wagmi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. ' +
    'WalletConnect will not work. Get a project ID at https://cloud.walletconnect.com/',
  );
}

export const config = getDefaultConfig({
  appName: 'Frostbite',
  projectId,
  chains: [avalancheFuji, avalanche],
  transports: {
    [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc', {
      timeout: 30_000,
    }),
    [avalanche.id]: http('https://api.avax.network/ext/bc/C/rpc', {
      timeout: 30_000,
    }),
  },
  ssr: true,
});
