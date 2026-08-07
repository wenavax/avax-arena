// frontend/lib/game/td/quests.ts
// ─── Faz 7: görev sistemi (saf mantık) ───
// Phaser importu YOK, DOM'a tek dokunuş `pushQuestEvent`'teki korumalı dispatch —
// tdState.ts emsali: `npx tsx scripts/td-quest-test.ts` ile Node'da doğrudan koşar.
//
// Tasarım kararları (plan D1-D4):
//  · Quest DURUMU PlayerState.quests içinde (zaten serialize/rehydrate ediliyor, save v=1 sabit).
//  · Quest TANIMI burada statik — içerik migration'sız değişebilir.
//  · Olay anahtarları ad-alanlı (`kill:wolf`), PlayerState.addKill()'in çıplak tipiyle (`wolf`)
//    asla çakışmaz → çift sayım yapısal olarak imkânsız.

import { PlayerState, type QuestData } from '../PlayerState';

export type QuestKind = 'kill' | 'gather' | 'visit' | 'boss' | 'enter' | 'sell' | 'harvest';

/** Ödül olarak verilebilen eşya şablonu (PlayerState.InventoryItem ile yapısal uyumlu). */
export interface QuestItem {
  id: string;
  name: string;
  sprite: string;
  type: 'weapon' | 'armor' | 'accessory' | 'ring' | 'potion' | 'key' | 'quest';
  stat?: { atk?: number; def?: number; hp?: number; mp?: number; spd?: number };
  stackable: boolean;
  count: number;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  /** NpcDef.id — görevi veren ve teslim alınan NPC. */
  giver: string;
  kind: QuestKind;
  /** Ad-alansız hedef ('wolf', 'wood', 'arena', 'any'…). Kanonik anahtar = objectiveKey(kind, target). */
  target: string;
  /** Gereken sayı. */
  count: number;
  reward: { type: 'item' | 'gold' | 'xp'; id?: string; amount: number };
  /** Bu quest turnedIn olmadan teklif edilmez. */
  requires?: string;
  repeatable?: 'daily';
}

/** Günlük tekrarların sıfırlanma penceresi. */
export const DAILY_MS = 24 * 60 * 60 * 1000;

/** Tek kanonik olay/hedef anahtarı üreteci. */
export function objectiveKey(kind: QuestKind, target: string): string {
  return `${kind}:${target}`;
}

// ─── Görev tablosu (15 — 4'ü günlük). TÜM METİNLER İNGİLİZCE (ASCII) ───
export const QUESTS: QuestDef[] = [
  {
    id: 'q_first_steps', giver: 'elder', kind: 'gather', target: 'wood', count: 5,
    title: 'First Steps',
    description: 'The hearths are cold. Chop five loads of wood from the trees outside town.',
    reward: { type: 'gold', amount: 40 },
  },
  {
    id: 'q_wolf_cull', giver: 'elder', kind: 'kill', target: 'wolf', count: 5,
    title: 'Thin the Pack',
    description: 'Wolves have grown bold on the road. Cull five of them.',
    reward: { type: 'gold', amount: 60 }, requires: 'q_first_steps',
  },
  {
    id: 'q_hag_hunt', giver: 'elder', kind: 'boss', target: 'swamp_hag', count: 1,
    title: 'The Hag of the Marsh',
    description: 'Something older than the frost sits in the swamp. End it.',
    reward: { type: 'gold', amount: 250 }, requires: 'q_wolf_cull',
  },
  {
    id: 'q_tour_arena', giver: 'herald', kind: 'visit', target: 'arena', count: 1,
    title: 'Blood and Sand',
    description: 'Step inside the Arena and see how champions are made.',
    reward: { type: 'gold', amount: 30 },
  },
  {
    id: 'q_tour_cardgame', giver: 'herald', kind: 'visit', target: 'cardgame', count: 1,
    title: 'Cards and Engines',
    description: 'The racing hall never sleeps. Look in on a race.',
    reward: { type: 'gold', amount: 30 },
  },
  {
    id: 'q_grand_tour', giver: 'herald', kind: 'visit', target: 'any', count: 9,
    title: 'The Grand Tour',
    description: 'Nine doors, nine games. Visit every one of them.',
    reward: { type: 'xp', amount: 300 }, requires: 'q_tour_arena',
  },
  {
    id: 'q_ore_run', giver: 'blacksmith', kind: 'gather', target: 'ore', count: 8,
    title: 'Ore Run',
    description: 'My forge is starving. Bring me eight loads of ore.',
    reward: { type: 'item', id: 'potion_hp', amount: 2 },
  },
  {
    id: 'q_stone_haul', giver: 'blacksmith', kind: 'gather', target: 'stone', count: 15,
    title: 'Stone Haul',
    description: 'The walls crack a little more each night. Fifteen loads of stone, every day.',
    reward: { type: 'gold', amount: 80 }, repeatable: 'daily',
  },
  {
    id: 'q_market_day', giver: 'merchant', kind: 'sell', target: 'gold', count: 200,
    title: 'Market Day',
    description: 'Sell two hundred gold worth of goods at the marketplace. Learn what things are worth.',
    reward: { type: 'xp', amount: 80 },
  },
  {
    id: 'q_trade_route', giver: 'merchant', kind: 'sell', target: 'gold', count: 300,
    title: 'Trade Route',
    description: 'Keep the coin moving: three hundred gold of sales, every day.',
    reward: { type: 'gold', amount: 120 }, repeatable: 'daily',
  },
  {
    id: 'q_cold_catch', giver: 'fisher', kind: 'gather', target: 'fish', count: 6,
    title: 'Cold Catch',
    description: 'Six fish from the open water. Mind the ice.',
    reward: { type: 'xp', amount: 60 },
  },
  {
    id: 'q_daily_catch', giver: 'fisher', kind: 'gather', target: 'fish', count: 10,
    title: 'Daily Catch',
    description: 'Ten fish keeps the smokehouse running for a day.',
    reward: { type: 'gold', amount: 90 }, repeatable: 'daily',
  },
  {
    id: 'q_harvest_help', giver: 'farmer', kind: 'harvest', target: 'crop', count: 6,
    title: 'Harvest Help',
    description: 'Six plots need pulling before the frost takes them.',
    reward: { type: 'gold', amount: 70 },
  },
  {
    id: 'q_bounty', giver: 'hunter', kind: 'kill', target: 'any', count: 12,
    title: 'Standing Bounty',
    description: 'Twelve beasts, any kind. The bounty resets with the sun.',
    reward: { type: 'gold', amount: 100 }, repeatable: 'daily',
  },
  {
    id: 'q_deep_dark', giver: 'scholar', kind: 'enter', target: 'mines', count: 1,
    title: 'The Deep Dark',
    description: 'Walk into the mines and tell me what the carvings look like.',
    reward: { type: 'xp', amount: 120 },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export function questsForGiver(npcId: string): QuestDef[] {
  return QUESTS.filter((q) => q.giver === npcId);
}

/** Ödül eşya şablonları — `reward.id` buradan çözülür (PlayerState envanteriyle aynı şekil). */
export const REWARD_ITEMS: Record<string, QuestItem> = {
  potion_hp: { id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion', stat: { hp: 40 }, stackable: true, count: 1 },
};

// ─── Çalışma-zamanı satırları ───

/** QuestData satırı üret — 10 alanın hepsi dolu (PlayerState.save() olduğu gibi yazar). */
export function makeRow(def: QuestDef): QuestData {
  const row: QuestData = {
    id: def.id,
    title: def.title,
    description: def.description,
    objective: objectiveKey(def.kind, def.target),
    target: def.count,
    progress: 0,
    reward: { ...def.reward },
    completed: false,
    turnedIn: false,
  };
  if (def.repeatable) row.repeatable = def.repeatable;
  return row;
}

/**
 * Olay anahtarı bu satırı ilerletir mi? Tam eşleşme + üç joker kuralı:
 *  · `kill:elite_wolf` → `kill:wolf` hedefini de ilerletir (TERSİ GEÇMEZ)
 *  · `<kind>:any` hedefi aynı kind'daki her olayla ilerler
 *  · `visit:any` dedupe'u çağrı yerine ait (flags: `hub_seen_<id>`)
 */
export function matchEvent(row: { objective: string }, key: string): boolean {
  const obj = row.objective;
  if (obj === key) return true;

  const ci = key.indexOf(':');
  if (ci < 0) return false;
  const kind = key.slice(0, ci), target = key.slice(ci + 1);

  if (obj === `${kind}:any`) return true;
  if (kind === 'kill' && target.startsWith('elite_') && obj === `kill:${target.slice(6)}`) return true;
  return false;
}

/**
 * Eşleşen satırları ilerlet; YENİ tamamlananların id listesini döndür.
 * `turnedIn` ve zaten `completed` satırlara dokunmaz, `target`'ta kıskaçlar.
 */
export function advance(rows: QuestData[], key: string, amount = 1): string[] {
  if (amount <= 0) return [];
  const done: string[] = [];
  for (const r of rows) {
    if (r.turnedIn || r.completed) continue;
    if (!matchEvent(r, key)) continue;
    r.progress = Math.min(r.target, r.progress + amount);
    if (r.progress >= r.target) { r.completed = true; done.push(r.id); }
  }
  return done;
}

export type OfferState = 'locked' | 'available' | 'active' | 'ready' | 'done';

/** NPC diyaloğunun bu görev için göstereceği durum. */
export function offerState(rows: QuestData[], def: QuestDef): OfferState {
  const row = rows.find((r) => r.id === def.id);
  if (!row) {
    if (def.requires) {
      const pre = rows.find((r) => r.id === def.requires);
      if (!pre || !pre.turnedIn) return 'locked';
    }
    return 'available';
  }
  if (row.turnedIn) return 'done';
  return row.completed ? 'ready' : 'active';
}

/**
 * Günlük tekrarları sıfırla. `now` PARAMETRE — test determinizmi için.
 * Yalnız `repeatable:'daily'` + `turnedIn` + `resetAt <= now` satırlara dokunur.
 * Sıfırlanan id listesini döndürür.
 */
export function rolloverRepeatables(rows: QuestData[], now: number): string[] {
  const reset: string[] = [];
  for (const r of rows) {
    if (r.repeatable !== 'daily' || !r.turnedIn) continue;
    if (typeof r.resetAt !== 'number' || r.resetAt > now) continue;
    r.progress = 0;
    r.completed = false;
    r.turnedIn = false;
    delete r.resetAt;
    reset.push(r.id);
  }
  return reset;
}

/** grantReward'ın ihtiyaç duyduğu asgari yüzey (PlayerState yapısal olarak uyar). */
export interface RewardSink {
  gold: number;
  addXp(amount: number): boolean;
  addItem(item: QuestItem): boolean;
}

/**
 * Ödülü ver. Tek yan-etkili fonksiyon.
 * Çanta doluysa (cap 12) `false` döner ve HİÇBİR ŞEY mutasyona uğramaz — kısmi ödül yok.
 */
export function grantReward(ps: RewardSink, def: QuestDef): boolean {
  const rw = def.reward;
  if (rw.type === 'gold') { ps.gold += rw.amount; return true; }
  if (rw.type === 'xp') { ps.addXp(rw.amount); return true; }
  const tpl = rw.id ? REWARD_ITEMS[rw.id] : undefined;
  if (!tpl) return false;
  return ps.addItem({ ...tpl, count: rw.amount });
}

/**
 * Canlı olay girişi: PlayerState.quests üzerinde advance koşar, yeni tamamlananlar için
 * `td-quest-toast` yayınlar (emsal: `td-sell`, TdWorldScene.ts:462).
 * Save ÇAĞIRMAZ — çağrı yerleri zaten mevcut ps.save() kapılarının öncesinde durur.
 */
export function pushQuestEvent(key: string, amount = 1): string[] {
  const rows = PlayerState.get().quests;
  const done = advance(rows, key, amount);
  if (done.length && typeof window !== 'undefined') {
    for (const id of done) {
      const def = QUEST_BY_ID[id];
      window.dispatchEvent(new CustomEvent('td-quest-toast', {
        detail: { id, title: def?.title ?? id, giver: def?.giver ?? '' },
      }));
    }
  }
  return done;
}
