// frontend/lib/game/td/barks.ts
// ─── Faz 9A.6: canavar replikleri (aggro baloncuğu) ───
// `lore.ts`in 50 canavar tipi için yazılmış MOB_LINES tablosu hiç okunmuyordu:
// `getRandomMobLine` tüm kod tabanında SIFIR çağrı sitesine sahipti. Kovalamaya başlayan
// canavar artık bir kez konuşuyor — "Shattered Crown" anlatısı savaş ekranından çıkıp
// dünyaya yayılıyor.
//
// elemental.ts / killStats.ts / zoneMusic.ts ile aynı sözleşme: SAF modül (Phaser yok,
// window yok) → Node'da koşar. Baloncuğu ÇİZMEK sahnenin işi; burada yalnız "konuşsun mu,
// ne desin" kararı var.

import { getRandomMobLine } from '../lore';
import { baseMonsterType } from './elemental';

/** Baloncuğun tam görünür kaldığı süre (ms). */
export const BARK_HOLD_MS = 1800;

/**
 * Soluşma süresi (ms). 🔴 SONLU: `repeat: -1` tween'i `destroy()` ÖLDÜRMEZ (9A.1
 * review'ının yakaladığı sızıntı) ve TdWorldScene oturum boyunca hiç `stop()` edilmez
 * (dünya→zindan/hub `scene.pause()` ile gider) → sonsuz tween oturum sonuna kadar yaşardı.
 */
export const BARK_FADE_MS = 450;

/** Aynı anda ekrandaki en fazla baloncuk. Aşılırsa EN ESKİ düşer (yığılma olmaz). */
export const MAX_BARKS = 3;

/**
 * Kilidi taşıyan mob. `MonRef`/`DMonRef` bu alanı alır: bayrak mob nesnesiyle birlikte
 * yaşar ve onunla ölür (`dots?` ile aynı deyim) — ayrı bir Map/Set tutulsaydı despawn
 * olan mobların anahtarları oturum boyunca birikirdi.
 */
export interface BarkLock {
  /** true = bu mob için repliğe BİR KEZ bakıldı (konuşmuş olsun ya da olmasın). */
  barked?: boolean;
}

/**
 * Mob başına ÖMÜR BOYU tek deneme. Kilit başarıya değil DENEMEYE konur:
 * `getRandomMobLine` %70 ihtimalle null döndürür ve tablodaki 50 tipin dışındaki
 * canavarlar için HER ZAMAN null'dır — başarıya kilitlense, o mobların her kovalama
 * karesinde yeniden zar atılırdı (aggro dalı her karede koşuyor). Elit öneki soyulur:
 * `elite_wolf` MOB_LINES'ta yoktur, soymadan tüm elitler dilsiz kalırdı.
 *
 * `line` yalnız test için enjekte edilir; oyun kodu tek argümanlı yolu kullanır.
 */
export function rollBark(
  mob: BarkLock,
  type: string,
  line: (t: string) => string | null = getRandomMobLine,
): string | null {
  if (mob.barked) return null;
  mob.barked = true;
  return line(baseMonsterType(type));
}

/**
 * Ekranda duran baloncukların defteri. SAF: Phaser nesnesini TANIMAZ — sökme işini
 * `kill` geri çağrısı yapar (sahne orada `killTweensOf` + `destroy` çifti kurar). Defterin
 * kendisi burada olduğu için kapasite/temizlik kuralları Node'da DAVRANIŞ üstünden
 * sınanabiliyor ve iki sahne aynı kodu kopyalamıyor.
 *
 * `remove` İDEMPOTENT: `clear()` (shutdown) ile tween'in `onComplete`'i yarışabilir —
 * defterde olmayan hedef sessizce geçilir, ikinci bir `destroy()` atılmaz.
 */
export class BarkStack<T> {
  private items: T[] = [];

  constructor(private readonly kill: (t: T) => void, private readonly cap: number = MAX_BARKS) {}

  /** Yeni baloncuk. Kapasite aşılırsa EN ESKİ sökülür — yenisi asla kurban değil. */
  add(t: T): void {
    while (this.items.length >= this.cap) this.remove(this.items[0]);
    this.items.push(t);
  }

  /** Tek baloncuğu defterden düşür + söktür. Defterde yoksa hiçbir şey yapmaz. */
  remove(t: T): void {
    const i = this.items.indexOf(t);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.kill(t);
  }

  /** shutdown VE destroy: hepsini sök. */
  clear(): void {
    for (const t of this.items.slice()) this.remove(t);
  }

  get size(): number { return this.items.length; }
}
