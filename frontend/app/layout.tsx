import type { Metadata } from 'next';
import { Inter, Orbitron, JetBrains_Mono, Silkscreen } from 'next/font/google';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Web3Provider } from '@/providers/Web3Provider';
import { EventProvider } from '@/providers/EventProvider';
import { Sidebar, MobileTopBar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';
import { ActivityTicker } from '@/components/layout/ActivityTicker';
import { ChainGuard } from '@/components/ChainGuard';
import dynamic from 'next/dynamic';

const MusicPlayer = dynamic(
  () => import('@/components/layout/MusicPlayer').then(mod => mod.MusicPlayer),
  { ssr: false }
);

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
  title: {
    default: 'Frostbite | NFT Battle Arena on Avalanche',
    template: '%s | Frostbite',
  },
  description:
    'Mint cyber warriors, battle NFTs, and earn AVAX on Avalanche C-Chain. Element-based PvP battles, quests, fusion, and decentralized marketplace.',
  keywords: [
    'Avalanche', 'AVAX', 'NFT', 'Battle', 'Web3', 'PvP', 'Blockchain Gaming',
    'Frostbite', 'GameFi', 'NFT Game', 'Play to Earn', 'Crypto Gaming',
    'Avalanche NFT', 'C-Chain', 'DeFi Gaming', 'NFT Marketplace',
  ],
  authors: [{ name: 'Frostbite', url: 'https://frostbite.pro' }],
  creator: 'Frostbite',
  publisher: 'Frostbite',
  category: 'Gaming',
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
      'Mint cyber warriors, battle NFTs, and earn AVAX. Element-based PvP battles, quests, and marketplace on Avalanche.',
    type: 'website',
    url: 'https://frostbite.pro',
    siteName: 'Frostbite',
    locale: 'en_US',
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
    site: '@frostbiteprol1',
    creator: '@frostbiteprol1',
    title: 'Frostbite | NFT Battle Arena on Avalanche',
    description: 'Mint cyber warriors, battle NFTs, and earn AVAX. Element-based PvP battles on Avalanche.',
    images: ['https://frostbite.pro/og-image.jpg'],
  },
  metadataBase: new URL('https://frostbite.pro'),
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Frostbite',
  url: 'https://frostbite.pro',
  description: 'NFT Battle Arena on Avalanche — mint warriors, battle PvP, complete quests, and trade on the marketplace.',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  creator: {
    '@type': 'Organization',
    name: 'Frostbite',
    url: 'https://frostbite.pro',
    sameAs: ['https://x.com/frostbiteprol1'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${jetbrainsMono.variable} ${silkscreen.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider>
          <Web3Provider>
          <EventProvider>
            {/* Background layers */}
            <div className="mesh-bg" aria-hidden="true" />
            <ParticleBackground />
            <div className="scanlines" aria-hidden="true" />

            {/* App shell: sidebar + main + activity ticker */}
            <div className="mx-auto max-w-[1560px] w-full flex min-h-screen relative">
              <Sidebar />
              <div className="flex-1 min-w-0 flex flex-col min-h-screen xl:mr-[280px]">
                <MobileTopBar />
                <ChainGuard />
                <main className="relative flex-1 pb-4 px-3 sm:px-6 lg:px-8">{children}</main>
                <Footer />
              </div>
              <ActivityTicker />
            </div>
          </EventProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
