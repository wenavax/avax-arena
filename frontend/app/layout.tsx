import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono, Silkscreen, Anton } from 'next/font/google';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Web3Provider } from '@/providers/Web3Provider';
import { EventProvider } from '@/providers/EventProvider';
import { Sidebar, MobileTopBar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';
import { ActivityTicker } from '@/components/layout/ActivityTicker';
import { ChainGuard } from '@/components/ChainGuard';
import { EmbedMode } from '@/components/EmbedMode';
import dynamic from 'next/dynamic';

const MusicPlayer = dynamic(
  () => import('@/components/layout/MusicPlayer').then(mod => mod.MusicPlayer),
  { ssr: false }
);

const ParticleBackground = dynamic(
  () => import('@/components/layout/ParticleBackground').then(mod => mod.ParticleBackground),
  { ssr: false }
);

const GameplayDemo = dynamic(
  () => import('@/components/layout/GameplayDemo').then(mod => mod.GameplayDemo),
  { ssr: false }
);
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
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

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Frostbite | On-Chain Game Arcade on Avalanche',
    template: '%s | Frostbite',
  },
  description:
    'The on-chain arcade on Avalanche: PvP battle arena, card racing, an isometric RPG world, idle expeditions, token launchpad and more — one wallet, real stakes.',
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
    // basePath (/avalanche) Next metadata icon URL'lerine OTOMATİK eklenmez —
    // elle prefix'lemezsek tarayıcı root'tan ister ve 404 alır (favicon kaybolur).
    icon: [
      { url: '/avalanche/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/avalanche/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/avalanche/favicon.ico', sizes: 'any' },
    ],
    apple: '/avalanche/apple-touch-icon.png',
  },
  // Aynı basePath tuzağı: app/manifest.ts konvansiyonu link'i prefix'siz basıyordu
  // (/manifest.webmanifest → 404). Statik dosya + elle prefix'li link kullanıyoruz.
  manifest: '/avalanche/site.webmanifest',
  openGraph: {
    title: 'Frostbite | On-Chain Game Arcade on Avalanche',
    description:
      'PvP battle arena, card racing, an isometric RPG world, idle expeditions and a token launchpad — one wallet, real stakes on Avalanche.',
    type: 'website',
    url: 'https://frostbite.pro',
    siteName: 'Frostbite',
    locale: 'en_US',
    images: [
      {
        url: 'https://frostbite.pro/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Frostbite — On-Chain Game Arcade on Avalanche',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@frostbiteprol1',
    creator: '@frostbiteprol1',
    title: 'Frostbite | On-Chain Game Arcade on Avalanche',
    description: 'The on-chain arcade on Avalanche — battle arena, card racing, RPG world, expeditions, launchpad. One wallet, real stakes.',
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${silkscreen.variable} ${anton.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen" suppressHydrationWarning>
        <EmbedMode />
        {/* Pre-hydration: resolve collapsed-feed width before first paint (no margin slide) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=localStorage.getItem('frostbite_feed_collapsed')==='1';document.documentElement.style.setProperty('--feed-w',c?'48px':'280px');}catch(e){}if(location.search.indexOf('embed=1')>-1)document.body.classList.add('embed');})();`,
          }}
        />
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
              <div data-content-wrap="" className="flex-1 min-w-0 flex flex-col min-h-screen xl:[margin-right:var(--feed-w,280px)] transition-[margin] duration-300">
                <MobileTopBar />
                <ChainGuard />
                <main data-app-main="" className="relative flex-1 pb-4 px-3 sm:px-6 lg:px-8">{children}</main>
                <Footer />
              </div>
              <ActivityTicker />
            </div>
            <GameplayDemo />
          </EventProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
