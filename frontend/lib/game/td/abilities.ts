// frontend/lib/game/td/abilities.ts
// ─── Faz 9A.2: yetenekler + MP'nin gerçek-zamanlıya uyarlanması ───
// `skills.ts` TUR-TABANLI yazıldı (`hits`, `stunChance`, `selfBuff{turns}`, `dot{turns}`)
// ve TdBattleScene ile PAYLAŞILIYOR → o dosyaya DOKUNULMAZ. Tur→milisaniye dönüşümünün
// TEK evi burasıdır. combat.ts / groundLoot.ts gibi SAF: Phaser yok, window yok, Node'da koşar.

import { CLASS_SKILLS, CLASS_MP, type Skill } from '../skills';
import type { PlayerClass } from '../PlayerState';

/**
 * 1 tur ≈ 2 sn. Tur-tabanlı süreler (buff `turns`, dot `turns`, MP regen "tur başına")
 * bu tek sabitle gerçek zamana çevrilir. Değiştirilirse buff/dot/regen birlikte ölçeklenir.
 */
export const TURN_MS = 2000;

/** Yetenek de temel vuruşun salınım ritmini paylaşır — 4 yeteneği tek karede zincirlemeyi engeller. */
export const CAST_GCD_MS = 350;

/**
 * `skills.ts`'te cooldown alanı YOK (tur-tabanlıda gerekmiyordu — tur zaten kapı).
 * Gerçek-zamanlıda kapı budur. Record çapası: TdSkillId'ye eklenen her id burada
 * değer istemezse DERLEME hatası. Veriye (CLASS_SKILLS) eklenip buraya eklenmeyen id'yi
 * `td-abilities-test.ts` çift-yönlü kapsama testiyle yakalar.
 */
export type TdSkillId =
  | 'slash' | 'shield_bash' | 'power_strike' | 'fortify'
  | 'staff_hit' | 'fireball' | 'ice_shard' | 'arcane_barrier'
  | 'quick_shot' | 'double_shot' | 'poison_arrow' | 'evasion';

/** Temel vuruşlar (0 MP) 0 CD — onları zaten CAST_GCD_MS + ATTACK_CD_MS sınırlar. */
export const SKILL_CD_MS: Record<TdSkillId, number> = {
  // knight
  slash: 0,
  shield_bash: 6000,   // stun güçlü — uzun kapı
  power_strike: 4000,
  fortify: 12000,      // 4 sn buff / 12 sn CD = ~%33 uptime
  // mage
  staff_hit: 0,
  fireball: 5000,
  ice_shard: 3500,
  arcane_barrier: 12000,
  // archer
  quick_shot: 0,
  double_shot: 4000,
  poison_arrow: 6000,
  evasion: 12000,
};

/** Çok-vuruşlu yeteneklerde vuruşlar arası gecikme (TdBattleScene 250ms kullanıyor). */
export const MULTIHIT_DELAY_MS = 160;

/** Sınıfın yetenek listesi — bilinmeyen sınıf fallback'inin TEK yeri. */
export function tdSkills(cls: PlayerClass): Skill[] {
  return CLASS_SKILLS[cls] ?? CLASS_SKILLS.knight;
}

/** MP yenilenmesi: CLASS_MP.regen "tur başına" — saniyeye TURN_MS ile çevrilir. */
export function mpRegenPerSec(cls: PlayerClass): number {
  return (CLASS_MP[cls]?.regen ?? 3) / (TURN_MS / 1000);
}

/** Tur → ms (buff ve dot süreleri). */
export function turnsToMs(turns: number): number {
  return Math.max(0, Math.round(turns * TURN_MS));
}

export type CastBlock = 'ok' | 'mp' | 'cd' | 'gcd';

/**
 * Yetenek kullanılabilir mi? Sıra ÖNEMLİ: gcd < cd < mp. Oyuncuya en bilgilendirici
 * gerekçe dönsün diye "az kaldı" olan (gcd) değil, kalıcı engel (mp) en sonda —
 * gcd zaten 350ms, mesaj basmaya değmez (sahne 'gcd'de sessiz kalır).
 */
export function canCast(
  skill: Skill, mp: number, nowMs: number, cdUntilMs: number, gcdUntilMs: number,
): CastBlock {
  if (nowMs < gcdUntilMs) return 'gcd';
  if (nowMs < cdUntilMs) return 'cd';
  if (mp < skill.mpCost) return 'mp';
  return 'ok';
}

/** Bir yeteneğin CD'si (bilinmeyen id → 0: veri yeni yetenek eklemişse oyun kilitlenmesin). */
export function skillCdMs(id: string): number {
  return SKILL_CD_MS[id as TdSkillId] ?? 0;
}

/** Yetenek vuruşunun ATK'sı — `heroHit`'e geçirilir (combat.ts SAF kalır, çarpan parametre). */
export function skillAtk(baseAtk: number, skill: Skill): number {
  return Math.max(1, Math.round(baseAtk * skill.multiplier));
}

/** Hasarsız (yalnız buff) yetenek mi? TdBattleScene deseni: `selfBuff && hits === 0`. */
export function isBuffSkill(skill: Skill): boolean {
  return !!skill.selfBuff && skill.hits === 0;
}

/** DoT planı: tur-tabanlı `{turns, pctPerTurn}` → gerçek-zamanlı tik listesi. */
export function dotPlan(dot: NonNullable<Skill['dot']>): { ticks: number; everyMs: number; pct: number } {
  return { ticks: Math.max(1, dot.turns), everyMs: TURN_MS, pct: dot.pctPerTurn };
}

/** DoT tik hasarı — canavarın MAKS HP'sinin yüzdesi (TdBattleScene'deki `pctPerTurn` anlamı). */
export function dotTickDamage(maxHp: number, pct: number): number {
  return Math.max(1, Math.round(maxHp * pct));
}

/** `+%N DEF` buff'ı — TdBattleScene:1547 ile birebir (floor(def * (1 + n/100))). */
export function effectiveDef(def: number, defBuffPct: number): number {
  return Math.floor(def * (1 + Math.max(0, defBuffPct) / 100));
}

/**
 * Kaçınma şansı. Dünya savaşında TABAN kaçınma YOK (temas hasarı her zaman isabet
 * ederdi) — yalnız `evasion` buff'ı kaçınma verir. TdBattleScene'deki %20 tavan
 * korunur ki buff dünyada daha güçlü olmasın.
 */
export function dodgeChance(dodgeBuffPct: number): number {
  return Math.min(0.20, Math.max(0, dodgeBuffPct) / 100);
}

/** Stun süresi: tek tur (mob `downUntil` ile donar — dünyada zaten knockback için var). */
export const STUN_MS = TURN_MS;
