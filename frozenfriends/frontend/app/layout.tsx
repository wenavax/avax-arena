import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FrozenFriends — Social AI Pets on Base',
  description: 'Your pet has a personality and a social life. While you sleep, it makes friends, gets in arguments, gives gifts. Read its diary every morning.',
  openGraph: {
    title: 'FrozenFriends — Social AI Pets on Base',
    description: 'Your pet has a personality and a social life. Read its daily diary.',
    siteName: 'FrozenFriends',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FrozenFriends',
    description: 'Social AI pets on Base.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
