import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { avalanche, avalancheFuji } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'a]v[a]x[a]r[e]n[a]_[d]e[f]a[u]l[t'.replace(/[\[\]]/g, '');

export const config = getDefaultConfig({
  appName: 'Frostbite',
  projectId,
  chains: [avalancheFuji, avalanche],
  ssr: true,
});
