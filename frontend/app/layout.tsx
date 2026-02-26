import type { Metadata } from 'next';
import { Inter, Orbitron, JetBrains_Mono } from 'next/font/google';
import { Web3Provider } from '@/providers/Web3Provider';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ParticleBackground } from '@/components/layout/ParticleBackground';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AVAX Arena | NFT Battle Arena on Avalanche',
  description:
    'Mint cyber warriors, battle NFTs, and earn AVAX on Avalanche C-Chain. AI-powered agents, on-chain chat, and element-based PvP battles.',
  keywords: ['Avalanche', 'AVAX', 'NFT', 'Battle', 'Web3', 'PvP', 'AI Agent', 'Blockchain Gaming'],
  openGraph: {
    title: 'AVAX Arena | NFT Battle Arena on Avalanche',
    description:
      'Mint cyber warriors, battle NFTs, and earn AVAX. AI-powered agents with on-chain element-based PvP battles.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <Web3Provider>
          {/* Background layers */}
          <div className="mesh-bg" aria-hidden="true" />
          <ParticleBackground />

          {/* App shell */}
          <Navbar />
          <main className="relative z-10 flex-1">{children}</main>
          <Footer />
        </Web3Provider>
      </body>
    </html>
  );
}
