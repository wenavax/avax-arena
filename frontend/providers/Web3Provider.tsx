'use client';

import { useState } from 'react';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { useTheme } from 'next-themes';
import { config } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

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

  const rainbowTheme = resolvedTheme === 'light'
    ? lightTheme({
        accentColor: '#dc2626',
        accentColorForeground: '#ffffff',
        borderRadius: 'medium',
        fontStack: 'system',
        overlayBlur: 'small',
      })
    : darkTheme({
        accentColor: '#ff2020',
        accentColorForeground: '#0a0a0f',
        borderRadius: 'medium',
        fontStack: 'system',
        overlayBlur: 'small',
      });

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
