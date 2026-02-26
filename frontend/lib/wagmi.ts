import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { avalanche, avalancheFuji } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'AVAX Arena',
  projectId: 'YOUR_PROJECT_ID', // placeholder
  chains: [avalanche, avalancheFuji],
  ssr: true,
});
