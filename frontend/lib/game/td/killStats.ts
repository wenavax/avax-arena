// frontend/lib/game/td/killStats.ts
// ─── Faz 9A.5: dünya/zindan kill'lerinin achievement sayımı ───
// `achievements.ts` (324 satır, 30 başarım) bugüne dek YALNIZ TdBattleScene'den
// besleniyordu — oyun zamanının ~%2'si. Dünyada ve zindanda öldürülen canavarlar hiç
// sayılmıyordu: "100 canavar öldür" fiilen ulaşılamaz bir başarımdı. Burası eksik halka.
//
// elemental.ts / zoneMusic.ts / groundLoot.ts ile aynı sözleşme: SAF modül — Phaser yok,
// window yok ve `achievements.ts` bile İMPORT EDİLMEZ (o localStorage'a yazar). Yazan
// fonksiyonlar PARAMETRE olarak gelir (`KillStatDeps`) → sandbox kapısı Node'da DAVRANIŞ
// üstünden sınanabilir (scripts/td-bark-test.ts), kaynak taramasıyla değil.

import { baseMonsterType } from './elemental';

/** Sahnenin çalışma kipi (`registry.get('tdMode')`). Bilinmeyen her değer önizlemedir. */
export type TdMode = 'preview' | 'live';

/**
 * 🔴 SANDBOX KAPISI — Faz 3 review'ının yakaladığı Critical'in aynısı.
 * `frostbite_achievements` CANLI kullanıcı verisi (cüzdana değil tarayıcıya bağlı, geri
 * alınamaz): testnet/önizleme oynanışı oraya yazarsa gerçek başarımlar kirlenir ve
 * "ilk kan" gibi tek seferlikler sessizce yanar. Kapı BURADA, tek yerde; sahneler
 * `this.tdMode`'u olduğu gibi geçirir. Beyaz liste (`=== 'live'`), kara liste DEĞİL:
 * yarın yeni bir kip eklenirse varsayılan güvenli tarafta kalır.
 */
export function shouldCountStat(mode: string | null | undefined): boolean {
  return mode === 'live';
}

/** Tek bir istatistik artışı. `incrementStat(stat, amount)` imzasının veri hâli. */
export interface KillStatBump { stat: string; amount: number }

/** Bir ölümün sayım için gereken her şeyi: taban/elit tip + verilen altın. */
export interface KillStatInput {
  /** `m.entry.type` ya da `elite_<tip>` — önek burada soyulur. */
  type: string;
  /** `killRewards(...).gold` — 'totalGoldEarned' bunu ekler (0 ise satır basılmaz). */
  gold: number;
}

/**
 * Boss sayılan tipler — TdBattleScene:2075 satırının BİREBİR aynısı
 * (`includes('boss') || crystal_wyrm || infernal_dragon || dragon`). Kopya değil parite:
 * iki yol da aynı canavarı aynı şekilde saymalı, yoksa aynı yaratık haritada öldürülünce
 * "boss" olmuyor, TdBattle'da öldürülünce oluyor. td-bark-test.ts iki tarafı karşılaştırır.
 */
const BOSS_TYPES = new Set(['crystal_wyrm', 'infernal_dragon', 'dragon']);

/** Ejderha sayılan tipler — TdBattleScene:2082 (bone_dragon/undead_dragon KASTEN dışarıda). */
const DRAGON_TYPES = new Set(['dragon', 'frost_dragon', 'crystal_wyrm', 'infernal_dragon']);

/** Tipe özel sayaçlar — TdBattleScene:2079-2081. */
const TYPE_STATS: Record<string, string> = {
  skeleton: 'skeletonKills',
  spider: 'spiderKills',
  ghost: 'ghostKills',
};

/** `elite_frost_giant` → boss değil; önek soyulmazsa `includes('boss')` de yanılabilirdi. */
export function isBossType(type: string): boolean {
  const t = baseMonsterType(type);
  return t.includes('boss') || BOSS_TYPES.has(t);
}

export function isDragonType(type: string): boolean {
  return DRAGON_TYPES.has(baseMonsterType(type));
}

/**
 * Bir ölümün üreteceği artışlar — SAF: hiçbir şey yazmaz, yalnız listeler.
 * Krit/kaçınma/hasarsız-zafer sayaçları KASTEN yok: onlar TdBattleScene'in tur-tabanlı
 * savaş defterinden (`battleCrits`/`battleDodges`/`battleDamageTaken`) geliyor, gerçek
 * zamanlı sahnede "bir savaş" diye sınırlanmış bir pencere yok — uydurmak yerine boş
 * bırakıldı (yanlış sayan sayaç, saymayandan kötüdür).
 */
export function killStatBumps(kill: KillStatInput): KillStatBump[] {
  const t = baseMonsterType(kill.type);
  const bumps: KillStatBump[] = [{ stat: 'totalKills', amount: 1 }];
  if (kill.gold > 0) bumps.push({ stat: 'totalGoldEarned', amount: kill.gold });
  if (isBossType(t)) bumps.push({ stat: 'bossKills', amount: 1 });
  const perType = TYPE_STATS[t];
  if (perType) bumps.push({ stat: perType, amount: 1 });
  if (isDragonType(t)) bumps.push({ stat: 'dragonKills', amount: 1 });
  return bumps;
}

/** Sahnenin sağladığı yazma uçları — hepsi opsiyonel değil, hepsi ENJEKTE. */
export interface KillStatDeps {
  /** `incrementStat` (achievements.ts). Yalnız canlı kipte çağrılır. */
  inc: (stat: string, amount: number) => void;
  /**
   * `checkAndUnlock(buildStats(...))` sarmalı → yeni açılan başarımların başlıkları.
   * Sayım kapıdan geçmediyse HİÇ çağrılmaz (o da diske yazar).
   */
  unlock?: () => string[];
  /** Yeni açılan başarımın ekranda gösterimi (sıra numarası float'ları üst üste bindirmez). */
  toast?: (title: string, i: number) => void;
}

/**
 * 🔒 SAYIM BOĞAZI — sahnelerdeki TEK `incrementStat` yolu. Kapı, artış listesi ve unlock
 * denetimi tek yerde: sahneler `recordKillStats(this.tdMode, {...}, {...})` yazar, kip
 * kontrolünü KENDİ yapmaz (kopyalanan kapı, unutulan kapıdır).
 * Dönüş: gerçekten uygulanan artışlar (önizlemede boş dizi) — çağıran log/test için okur.
 */
export function recordKillStats(
  mode: string | null | undefined,
  kill: KillStatInput,
  deps: KillStatDeps,
): KillStatBump[] {
  if (!shouldCountStat(mode)) return [];
  const bumps = killStatBumps(kill);
  for (const b of bumps) deps.inc(b.stat, b.amount);
  const titles = deps.unlock?.() ?? [];
  titles.forEach((title, i) => deps.toast?.(title, i));
  return bumps;
}
