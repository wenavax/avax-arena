import type { Metadata } from 'next';
import { Inter, Orbitron, JetBrains_Mono, Silkscreen } from 'next/font/google';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Web3Provider } from '@/providers/Web3Provider';
import { EventProvider } from '@/providers/EventProvider';
import { Sidebar, MobileTopBar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';
import { ChainGuard } from '@/components/ChainGuard';
import dynamic from 'next/dynamic';

const ParticleBackground = dynamic(
  () => import('@/components/layout/ParticleBackground').then(mod => mod.ParticleBackground),
  { ssr: false }
);
import '@rainbow-me/rainbowkit/styles.css';
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

const silkscreen = Silkscreen({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-silkscreen',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Frostbite | NFT Battle Arena on Avalanche',
  description:
    'Mint cyber warriors, battle NFTs, and earn AVAX on Avalanche C-Chain. Element-based PvP battles, quests, and marketplace.',
  keywords: ['Avalanche', 'AVAX', 'NFT', 'Battle', 'Web3', 'PvP', 'Blockchain Gaming', 'Frostbite', 'GameFi'],
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Frostbite | NFT Battle Arena on Avalanche',
    description:
      'Mint cyber warriors, battle NFTs, and earn AVAX. Element-based PvP battles on Avalanche.',
    type: 'website',
    url: 'https://frostbite.pro',
    siteName: 'Frostbite',
    images: [
      {
        url: 'https://frostbite.pro/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Frostbite — NFT Battle Arena on Avalanche',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frostbite | NFT Battle Arena on Avalanche',
    description: 'Mint cyber warriors, battle NFTs, and earn AVAX. Element-based PvP battles on Avalanche.',
    images: ['https://frostbite.pro/og-image.jpg'],
  },
  metadataBase: new URL('https://frostbite.pro'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${jetbrainsMono.variable} ${silkscreen.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">
        <ThemeProvider>
          <Web3Provider>
          <EventProvider>
            {/* Background layers */}
            <div className="mesh-bg" aria-hidden="true" />
            <ParticleBackground />
            <div className="scanlines" aria-hidden="true" />

            {/* App shell: sidebar + main */}
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col min-h-screen lg:ml-56">
                <MobileTopBar />
                <ChainGuard />
                <main className="relative z-10 flex-1">{children}</main>
                <Footer />
              </div>
            </div>
          </EventProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
