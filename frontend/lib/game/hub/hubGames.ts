// World Hub — kasaba binalarının tek doğruluk kaynağı.
// door = kapı tile'ı (interact: 'hub_<id>'); bina dikdörtgeni kapıdan türetilir:
// kapı alt duvar satırının ortasıdır (rect: rows [door.ty-size.h+1 .. door.ty],
// cols [door.tx-floor(w/2) .. door.tx+ceil(w/2)-1]).

export interface HubGame {
  id: string;
  name: string;     // tabela metni
  icon: string;     // tabela emojisi
  url: string;      // basePath'siz route ('/cardgame' gibi)
  accent: string;   // overlay başlık rengi (css)
  roof: string;     // bina çatı biome'u (mevcut tile biome'larından)
  size: { w: number; h: number };
  door: { tx: number; ty: number };
}

export const HUB_GAMES: HubGame[] = [
  { id: 'arena',        name: 'ARENA',         icon: '⚔️', url: '/battle',              accent: '#ed2f39', roof: 'roof_red',  size: { w: 5, h: 4 }, door: { tx: 26, ty: 15 } },
  { id: 'cardgame',     name: 'CAR(D) GAME',   icon: '🏎️', url: '/cardgame',            accent: '#f5c542', roof: 'wood',      size: { w: 5, h: 4 }, door: { tx: 20, ty: 15 } },
  { id: 'battleroyale', name: 'BATTLE ROYALE', icon: '👑', url: '/world/battle-royale', accent: '#c084fc', roof: 'roof_red',  size: { w: 4, h: 4 }, door: { tx: 15, ty: 5 }  },
  { id: 'expeditions',  name: 'EXPEDITIONS',   icon: '🎲', url: '/expeditions',         accent: '#a78bfa', roof: 'wood',      size: { w: 4, h: 3 }, door: { tx: 26, ty: 19 } },
  { id: 'adventures',   name: 'ADVENTURES',    icon: '🧭', url: '/world/adventures',    accent: '#6ee7a0', roof: 'wood',      size: { w: 4, h: 3 }, door: { tx: 12, ty: 19 } },
  { id: 'swap',         name: 'SWAP',          icon: '💱', url: '/swap',                accent: '#2dd4bf', roof: 'roof_red',  size: { w: 4, h: 3 }, door: { tx: 3,  ty: 14 } },
  { id: 'marketplace',  name: 'NFT MARKET',    icon: '🏪', url: '/marketplace',         accent: '#fb7185', roof: 'wood',      size: { w: 4, h: 3 }, door: { tx: 3,  ty: 18 } },
  { id: 'launchpad',    name: 'LAUNCHPAD',     icon: '🚀', url: '/launchpad',           accent: '#f97316', roof: 'roof_red',  size: { w: 4, h: 4 }, door: { tx: 9,  ty: 23 } },
  { id: 'nftscore',     name: 'NFT SCORE',     icon: '💎', url: '/nft-score',           accent: '#c084fc', roof: 'wood',      size: { w: 3, h: 3 }, door: { tx: 20, ty: 22 } },
];

export const HUB_INTERACT_PREFIX = 'hub_';
