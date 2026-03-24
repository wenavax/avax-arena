import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Frostbite — NFT Battle Arena on Avalanche',
    short_name: 'Frostbite',
    description: 'Mint cyber warriors, battle NFTs, and earn AVAX on Avalanche C-Chain.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0c12',
    theme_color: '#ff2020',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
