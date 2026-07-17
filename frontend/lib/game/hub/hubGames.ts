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
  // Tema dekoru — kapıya göre ofset (dx,dy; negatif dy = kapının kuzeyi/bina yönü).
  // townTiles.ts sadece boş (interact'sız, mevcut data'sız) tile'lara uygular.
  decor?: { dx: number; dy: number; type: string }[];
}

// Kapıdan bina dikdörtgeni: kapı alt duvar satırının ortasıdır
export function buildingRect(g: HubGame): { r0: number; r1: number; c0: number; c1: number } {
  const r1 = g.door.ty;
  const r0 = r1 - g.size.h + 1;
  const c0 = g.door.tx - Math.floor(g.size.w / 2);
  return { r0, r1, c0, c1: c0 + g.size.w - 1 };
}

export const HUB_GAMES: HubGame[] = [
  // NOT (Task 5 code-review düzeltmesi): önceki konumlar mevcut yapılara (Elder Kulesi,
  // House B, plaza, doğu yolu) aşılanıyor ve duvar halkasında dekor delikleri bırakıyordu.
  // Yeni koordinatlar throwaway occupancy-dump + BFS doğrulayıcı script ile bulundu
  // (frontend/scripts/hub-town-check.ts artık hub-vs-eski-yapı + duvar bütünlüğü assertion'ları
  // içeriyor). arena+cardgame kuzeydoğu köşesinde dikey olarak istiflendi (bayrak gemisi
  // ikilisi bitişik); swap+marketplace kuzey şeridinde finans kümesi; battleroyale+adventures
  // batı-orta şeritte; nftscore batıda finans kümesine yakın; expeditions arena/cardgame'in
  // doğusunda; launchpad Tüccar Dükkanı'na yakın doğu cebinde (tüm binalar en az 3x3).
  {
    id: 'arena', name: 'ARENA', icon: '⚔️', url: '/battle', accent: '#ed2f39', roof: 'roof_red',
    size: { w: 4, h: 3 }, door: { tx: 20, ty: 4 },
    decor: [
      { dx: -2, dy: 0, type: 'torch' },
      { dx: 2, dy: 0, type: 'torch' },
      { dx: -1, dy: -1, type: 'banner' },
    ],
  },
  {
    id: 'cardgame', name: 'CAR(D) GAME', icon: '🏎️', url: '/cardgame', accent: '#f5c542', roof: 'wood',
    size: { w: 4, h: 3 }, door: { tx: 20, ty: 8 },
    decor: [
      { dx: -2, dy: 0, type: 'flag_checkered' },
      { dx: 2, dy: 0, type: 'flag_checkered' },
    ],
  },
  {
    id: 'battleroyale', name: 'BATTLE ROYALE', icon: '👑', url: '/world/battle-royale', accent: '#c084fc', roof: 'roof_red',
    size: { w: 3, h: 3 }, door: { tx: 6, ty: 14 },
    decor: [
      { dx: 0, dy: -1, type: 'banner' },
      { dx: -2, dy: 0, type: 'skull_post' },
    ],
  },
  {
    id: 'expeditions', name: 'EXPEDITIONS', icon: '🎲', url: '/expeditions', accent: '#a78bfa', roof: 'wood',
    size: { w: 3, h: 3 }, door: { tx: 23, ty: 11 },
    decor: [
      { dx: -1, dy: -1, type: 'crate' },
      { dx: 2, dy: 0, type: 'flag_checkered' },
    ],
  },
  {
    id: 'adventures', name: 'ADVENTURES', icon: '🧭', url: '/world/adventures', accent: '#6ee7a0', roof: 'wood',
    size: { w: 3, h: 3 }, door: { tx: 3, ty: 14 },
    decor: [
      { dx: -1, dy: -1, type: 'banner' },
      { dx: 2, dy: 0, type: 'barrel' },
    ],
  },
  {
    id: 'swap', name: 'SWAP', icon: '💱', url: '/swap', accent: '#2dd4bf', roof: 'roof_red',
    size: { w: 4, h: 3 }, door: { tx: 13, ty: 3 },
    decor: [
      { dx: -2, dy: 0, type: 'coins' },
      { dx: 2, dy: 0, type: 'barrel' },
    ],
  },
  {
    id: 'marketplace', name: 'NFT MARKET', icon: '🏪', url: '/marketplace', accent: '#fb7185', roof: 'wood',
    size: { w: 3, h: 3 }, door: { tx: 16, ty: 3 },
    decor: [
      { dx: -2, dy: 0, type: 'crate' },
      { dx: 2, dy: 0, type: 'crate' },
    ],
  },
  {
    id: 'launchpad', name: 'LAUNCHPAD', icon: '🚀', url: '/launchpad', accent: '#f97316', roof: 'roof_red',
    size: { w: 3, h: 3 }, door: { tx: 28, ty: 11 },
    decor: [
      { dx: -1, dy: -1, type: 'rocket' },
    ],
  },
  {
    id: 'nftscore', name: 'NFT SCORE', icon: '💎', url: '/nft-score', accent: '#c084fc', roof: 'wood',
    size: { w: 3, h: 3 }, door: { tx: 8, ty: 11 },
    decor: [
      { dx: 1, dy: -1, type: 'crystal' },
    ],
  },
];

export const HUB_INTERACT_PREFIX = 'hub_';
