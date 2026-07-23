// ─── On-Chain Integration for Avalanche World ───
// Handles: PlayerProgress save/load, Hero XP sync, Leaderboard updates

import type { InventoryItem, PlayerState } from '../PlayerState';

export const PROGRESS_CONTRACT = '0xDe4e38AE428ef4FA74FFe4ae5b9890B6eA6d0DFc' as const;
export const HERO_CONTRACT = '0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523' as const;
export const LEADERBOARD_CONTRACT = '0x9E61443C983cDd72e77946C2e4631eAe7bC6Da46' as const;

export const PROGRESS_ABI = [
  {
    inputs: [
      { name: 'level', type: 'uint16' }, { name: 'zone', type: 'uint8' },
      { name: 'xp', type: 'uint32' }, { name: 'gold', type: 'uint32' },
      { name: 'questFlags', type: 'uint16' }, { name: 'weaponTier', type: 'uint8' },
      { name: 'armorTier', type: 'uint8' }, { name: 'accessoryTier', type: 'uint8' },
      { name: 'ringTier', type: 'uint8' }, { name: 'totalKills', type: 'uint32' },
      { name: 'bossKills', type: 'uint16' }, { name: 'heroTokenId', type: 'uint16' },
    ],
    name: 'saveProgress', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'loadProgress',
    outputs: [{
      components: [
        { name: 'level', type: 'uint16' }, { name: 'zone', type: 'uint8' },
        { name: 'xp', type: 'uint32' }, { name: 'gold', type: 'uint32' },
        { name: 'questFlags', type: 'uint16' }, { name: 'weaponTier', type: 'uint8' },
        { name: 'armorTier', type: 'uint8' }, { name: 'accessoryTier', type: 'uint8' },
        { name: 'ringTier', type: 'uint8' }, { name: 'totalKills', type: 'uint32' },
        { name: 'bossKills', type: 'uint16' }, { name: 'lastSave', type: 'uint40' },
        { name: 'heroTokenId', type: 'uint16' },
      ],
      name: '', type: 'tuple',
    }],
    stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'player', type: 'address' }],
    name: 'hasProgress', outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view', type: 'function',
  },
] as const;

export const HERO_XP_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'amount', type: 'uint32' }],
    name: 'addXp', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'statChoice', type: 'uint8' }],
    name: 'levelUp', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getHero',
    outputs: [{
      components: [
        { name: 'element', type: 'uint8' }, { name: 'rarity', type: 'uint8' },
        { name: 'level', type: 'uint16' }, { name: 'xp', type: 'uint32' },
        { name: 'atk', type: 'uint16' }, { name: 'def', type: 'uint16' },
        { name: 'spd', type: 'uint16' }, { name: 'baseAtk', type: 'uint16' },
        { name: 'baseDef', type: 'uint16' }, { name: 'baseSpd', type: 'uint16' },
      ],
      name: '', type: 'tuple',
    }],
    stateMutability: 'view', type: 'function',
  },
] as const;

export const LEADERBOARD_ABI = [
  {
    inputs: [{ name: 'wallet', type: 'address' }, { name: 'score', type: 'uint256' }],
    name: 'updateScore', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
] as const;

// ── Zone index mapping ──
export const ZONE_INDEX: Record<string, number> = {
  Town: 0, IsoTownScene: 0,
  Forest: 1, IsoForestScene: 1,
  Dungeon: 2, IsoDungeonScene: 2,
  IceCave: 3, IsoIceCaveScene: 3,
  Volcano: 4, IsoVolcanoScene: 4,
};

// ── Quest flags bitmask ──
export function questsToBitmask(quests: { id: string; turnedIn: boolean }[]): number {
  const questIds = [
    'skeleton_hunt', 'dungeon_boss', 'spider_infestation', 'ghost_hunters',
    'dragon_revenge', 'ancient_artifact', 'supply_run', 'market_research',
  ];
  let mask = 0;
  for (let i = 0; i < questIds.length; i++) {
    const q = quests.find(x => x.id === questIds[i]);
    if (q?.turnedIn) mask |= (1 << i);
  }
  return mask;
}

// ── Equipment tier from item stats ──
export function equipTier(item: { stat?: { atk?: number; def?: number; spd?: number } } | null): number {
  if (!item) return 0;
  const total = (item.stat?.atk || 0) + (item.stat?.def || 0) + (item.stat?.spd || 0);
  if (total >= 16) return 5;
  if (total >= 11) return 4;
  if (total >= 7) return 3;
  if (total >= 4) return 2;
  if (total >= 1) return 1;
  return 0;
}

// ── Faz 6: ERC-1155 item NFT → PlayerState senkronu ──
// İzo IsoBaseScene.createPlayer içindeki import bloğunun saf/test-edilebilir hâli.
// İzo'dan iki fark: (1) dedup ekipman slotlarına da bakar — izo yalnız inventory'yi
// kontrol ettiğinden kuşanılmış NFT item sonraki login'de mükerrer import olurdu;
// (2) TD'de ekipman UI'ı olmadığından otomatik kuşanma yapılır (slot boşsa ya da
// NFT'nin toplam statı mevcut ekipmandan yüksekse).
export interface RawNftItem {
  tokenId: number;
  category: number; // 0=Weapon,1=Armor,2=Helmet,3=Shield,4=Ring
  element: number;
  rarity: number;
  atk: number;
  def: number;
  spd: number;
}

const NFT_CATEGORY_TYPES = ['weapon', 'armor', 'accessory', 'armor', 'ring'] as const; // helmet→accessory, shield→armor (izo paritesi)
const NFT_CATEGORY_LABELS = ['NFT Weapon', 'NFT Armor', 'NFT Helmet', 'NFT Shield', 'NFT Ring'];
const NFT_ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];
const NFT_RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const EQUIP_SLOTS = ['weapon', 'armor', 'accessory', 'ring'] as const;

export function nftItemToInventoryItem(item: RawNftItem): InventoryItem {
  const type = NFT_CATEGORY_TYPES[item.category] || 'accessory';
  return {
    id: `nft_item_${item.tokenId}`,
    name: `${NFT_RARITY_NAMES[item.rarity] || ''} ${NFT_ELEMENT_NAMES[item.element] || ''} ${NFT_CATEGORY_LABELS[item.category] || 'NFT Item'}`.trim(),
    sprite: type,
    type,
    stat: {
      ...(item.atk > 0 ? { atk: item.atk } : {}),
      ...(item.def > 0 ? { def: item.def } : {}),
      ...(item.spd > 0 ? { spd: item.spd } : {}),
    },
    stackable: false,
    count: 1,
  };
}

const statTotal = (i: InventoryItem | null | undefined): number =>
  i ? (i.stat?.atk || 0) + (i.stat?.def || 0) + (i.stat?.spd || 0) : -1;

export function syncNftItems(ps: PlayerState, raw: RawNftItem[] | undefined | null): { imported: number; equipped: string[] } {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return { imported: 0, equipped: [] };
  const owned = new Set(ps.inventory.map(i => i.id));
  for (const s of EQUIP_SLOTS) { if (ps.equipped[s]) owned.add(ps.equipped[s]!.id); }
  let imported = 0;
  for (const r of raw) {
    const it = nftItemToInventoryItem(r);
    if (owned.has(it.id)) continue;
    // İzo paritesi: doğrudan push (addItem'ın 12-slot tavanı NFT'leri düşürmemeli)
    ps.inventory.push(it);
    owned.add(it.id);
    imported++;
  }
  const equippedSlots: string[] = [];
  for (const s of EQUIP_SLOTS) {
    const candidates = ps.inventory.filter(i => i.id.startsWith('nft_item_') && i.type === s);
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) => (statTotal(b) > statTotal(a) ? b : a));
    if (statTotal(best) > statTotal(ps.equipped[s]) && ps.equip(best) === s) equippedSlots.push(s);
  }
  return { imported, equipped: equippedSlots };
}

// ── Faz 6: on-chain progress kaydı — izo HUDScene.saveToChain portu ──
// İzo'da tek zincir yazımı buydu (manuel buton; HERO addXp/levelUp ve LEADERBOARD
// updateScore ABI'ları tanımlı ama hiçbir yerden çağrılmıyordu) — TD de aynı sadelikte:
// kullanıcı tetikler, tek saveProgress tx'i. Cüzdansız/provider'sız çağrı graceful döner.
export async function saveProgressToChain(ps: PlayerState): Promise<{ ok: boolean; message: string }> {
  const w = window as unknown as { __frostbiteWallet?: { authenticated?: boolean }; ethereum?: unknown };
  if (!w.__frostbiteWallet?.authenticated) return { ok: false, message: 'Connect wallet first!' };
  if (!w.ethereum) return { ok: false, message: 'No wallet provider!' };
  try {
    const { ethers } = await import('ethers');
    const web3Provider = new ethers.BrowserProvider(w.ethereum as never);
    const signer = await web3Provider.getSigner();
    const contract = new ethers.Contract(PROGRESS_CONTRACT, PROGRESS_ABI as never, signer);

    const zoneIdx = ZONE_INDEX[ps.lastZone] || 0;
    const qFlags = questsToBitmask(ps.quests);
    const totalKills = Object.values(ps.killCounts).reduce((a, b) => a + b, 0);
    const bossKills = (ps.killCounts['boss_frost'] || 0) + (ps.killCounts['boss_frost_v2'] || 0) +
                      (ps.killCounts['crystal_wyrm'] || 0) + (ps.killCounts['infernal_dragon'] || 0);

    const tx = await contract.saveProgress(
      ps.level, zoneIdx, ps.xp, ps.gold,
      qFlags, equipTier(ps.equipped.weapon), equipTier(ps.equipped.armor),
      equipTier(ps.equipped.accessory), equipTier(ps.equipped.ring),
      totalKills, bossKills, ps.nftTokenId || 0
    );
    await tx.wait();
    return { ok: true, message: 'Saved on-chain! ⛓' };
  } catch (e) {
    const err = e as { shortMessage?: string; message?: string };
    return { ok: false, message: `Error: ${err.shortMessage || err.message?.slice(0, 40) || 'Failed'}` };
  }
}
