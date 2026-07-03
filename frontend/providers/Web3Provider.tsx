'use client';

import { useState } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { avalanche } from 'viem/chains';
import { config, readOnlyConfig } from '@/lib/wagmi';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Fallback: without a Privy App ID we still provide a read-only wagmi context
  // so on-chain reads render and the app never crashes (wallet actions disabled).
  if (!PRIVY_APP_ID) {
    if (typeof window !== 'undefined') {
      console.error(
        '[Web3Provider] NEXT_PUBLIC_PRIVY_APP_ID is not set — wallet actions disabled (read-only mode).'
      );
    }
    return (
      <WagmiProvider config={readOnlyConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: resolvedTheme === 'light' ? 'light' : 'dark',
          accentColor: '#ed2f39',
          logo: '/favicon-32x32.png',
          landingHeader: 'Frostbite Arena',
          loginMessage: 'Enter the arena — email, social, or wallet',
        },
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        defaultChain: avalanche,
        supportedChains: [avalanche],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={config}>{children}</PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
