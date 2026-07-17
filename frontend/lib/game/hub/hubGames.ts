// World Hub — kasaba binalarının tek doğruluk kaynağı.
// door = kapı tile'ı (interact: 'hub_<id>'); bina dikdörtgeni kapıdan türetilir — bkz. buildingRect().

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

// Kapıdan bina dikdörtgeni: kapı alt duvar satırının ortasıdır
export function buildingRect(g: HubGame): { r0: number; r1: number; c0: number; c1: number } {
  const r1 = g.door.ty;
  const r0 = r1 - g.size.h + 1;
  const c0 = g.door.tx - Math.floor(g.size.w / 2);
  return { r0, r1, c0, c1: c0 + g.size.w - 1 };
}

export const HUB_GAMES: HubGame[] = [
  // NOT: arena/swap/marketplace/launchpad kapıları hub-town-check.ts BFS erişilebilirlik
  // testinde orijinal konumlarında ulaşılamaz (mevcut ağaç/bina dokusu tarafından izole
  // edilmiş ceplere düşüyorlardı) — kuzey açık alanına taşındı, bkz. Task 5 raporu.
  { id: 'arena',        name: 'ARENA',         icon: '⚔️', url: '/battle',              accent: '#ed2f39', roof: 'roof_red',  size: { w: 5, h: 4 }, door: { tx: 19, ty: 10 } },
  { id: 'cardgame',     name: 'CAR(D) GAME',   icon: '🏎️', url: '/cardgame',            accent: '#f5c542', roof: 'wood',      size: { w: 5, h: 4 }, door: { tx: 20, ty: 15 } },
  { id: 'battleroyale', name: 'BATTLE ROYALE', icon: '👑', url: '/world/battle-royale', accent: '#c084fc', roof: 'roof_red',  size: { w: 4, h: 4 }, door: { tx: 15, ty: 5 }  },
  { id: 'expeditions',  name: 'EXPEDITIONS',   icon: '🎲', url: '/expeditions',         accent: '#a78bfa', roof: 'wood',      size: { w: 4, h: 3 }, door: { tx: 26, ty: 19 } },
  { id: 'adventures',   name: 'ADVENTURES',    icon: '🧭', url: '/world/adventures',    accent: '#6ee7a0', roof: 'wood',      size: { w: 4, h: 3 }, door: { tx: 12, ty: 19 } },
  { id: 'swap',         name: 'SWAP',          icon: '💱', url: '/swap',                accent: '#2dd4bf', roof: 'roof_red',  size: { w: 4, h: 3 }, door: { tx: 4,  ty: 8 }  },
  { id: 'marketplace',  name: 'NFT MARKET',    icon: '🏪', url: '/marketplace',         accent: '#fb7185', roof: 'wood',      size: { w: 4, h: 3 }, door: { tx: 9,  ty: 8 }  },
  { id: 'launchpad',    name: 'LAUNCHPAD',     icon: '🚀', url: '/launchpad',           accent: '#f97316', roof: 'roof_red',  size: { w: 4, h: 4 }, door: { tx: 19, ty: 5 }  },
  { id: 'nftscore',     name: 'NFT SCORE',     icon: '💎', url: '/nft-score',           accent: '#c084fc', roof: 'wood',      size: { w: 3, h: 3 }, door: { tx: 20, ty: 22 } },
];

export const HUB_INTERACT_PREFIX = 'hub_';
