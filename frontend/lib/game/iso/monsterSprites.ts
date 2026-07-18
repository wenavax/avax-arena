// frontend/lib/game/iso/monsterSprites.ts
// Tek doğruluk kaynağı: monster tipi → sprite arketipi → sheet frame'i.
// Eşlemesi null olan tip (boss'lar) prosedürel çizimde kalır.
// Frame index'leri kontakt sheet'lerden elle seçildi (index = row*cols+col):
//   /tmp/cs-kenney.png (+ bölgesel zoom'lar) — kenney-1bit.png, 49 sütun, 16px+1 spacing.
// Bütünlük testi: npx tsx scripts/monster-sprite-test.ts

export interface SheetSpec { cols: number; rows: number }
export const SHEET_SPECS: Record<string, SheetSpec> = {
  'tiles':        { cols: 49, rows: 22 },  // kenney-1bit, BootScene'de yüklü
  'tiny-dungeon': { cols: 12, rows: 11 },  // Task 3'te yüklenir
  'tiny-battle':  { cols: 18, rows: 11 },
};

export interface ArchetypeDef {
  sheet: keyof typeof SHEET_SPECS & string;
  frame: number;      // idle frame — kontakt sheet'ten
  frame2?: number;    // varsa 2-frame anim; yoksa bob tween
  scale?: number;     // varsayılan ~3
}

// Tüm arketipler kenney-1bit ('tiles') üzerinden: bej/krem çizimler tint ile
// mükemmel çalışıyor ve sheet zaten BootScene'de yüklü (ekstra yükleme yok).
// tiny-battle askeri araçlar (monster yok), tiny-dungeon renkli (tint bozar) —
// ikisi de kullanılmadı.
export const ARCHETYPES: Record<string, ArchetypeDef> = {
  skeleton:  { sheet: 'tiles', frame: 323 },              // kafatası + kaburga, klasik iskelet
  zombie:    { sheet: 'tiles', frame: 367 },              // blok gövdeli, kollar sarkık insansı
  ghost:     { sheet: 'tiles', frame: 321, frame2: 320 }, // dalgalı etek + kol hayalet; 320 = kuyruk pozu (2-frame)
  wraith:    { sheet: 'tiles', frame: 318 },              // kapüşonlu cüppeli silüet
  demon:     { sheet: 'tiles', frame: 422 },              // boynuzlu dişlek surat
  imp:       { sheet: 'tiles', frame: 319 },              // sivri kulaklı ufak yaratık
  beast:     { sheet: 'tiles', frame: 374 },              // köpek/kurt silüeti (yandan)
  rat:       { sheet: 'tiles', frame: 423 },              // kuyruklu fare (yandan)
  spider:    { sheet: 'tiles', frame: 273 },              // bacakları açık örümcek
  snake:     { sheet: 'tiles', frame: 420 },              // kıvrılmış yılan, baş yukarıda
  dragon:    { sheet: 'tiles', frame: 421 },              // açık çeneli sürüngen (en iyi reptil silüet)
  golem:     { sheet: 'tiles', frame: 324 },              // iri blok gövde, küçük kafa
  elemental: { sheet: 'tiles', frame: 567 },              // beyaz alev silüeti — tint ile her element
  knight:    { sheet: 'tiles', frame: 76 },               // miğferli zırhlı insansı
  mage:      { sheet: 'tiles', frame: 122 },              // uzun sakallı cüppeli büyücü
  bird:      { sheet: 'tiles', frame: 418 },              // kanatlı silüet (yarasa — sheet'te şahin yok)
  plant:     { sheet: 'tiles', frame: 312 },              // budaklı ağaç gövdesi (treant)
  blob:      { sheet: 'tiles', frame: 322 },              // kocaman ağızlı amorf yaratık
  insect:    { sheet: 'tiles', frame: 274 },              // tostoparlak böcek
  octopus:   { sheet: 'tiles', frame: 416, frame2: 417 }, // ahtapot — gerçek 2-frame çift (düz/kıvrık kollar)
};

export interface MonsterVisual { arch: keyof typeof ARCHETYPES & string; tint?: number }

// null = bilinçli prosedürel (dungeon boss'ları imza AI/çizimlerini korur).
export const MONSTER_VISUALS: Record<string, MonsterVisual | null> = {
  // ── Orman / başlangıç ─────────────────────────────────────────────
  skeleton:            { arch: 'skeleton' },
  skeleton_warrior:    { arch: 'skeleton', tint: 0xccddff },
  skeleton_lord:       { arch: 'skeleton', tint: 0xffcc66 },
  wolf:                { arch: 'beast',    tint: 0x8888aa },
  spider:              { arch: 'spider' },
  treant:              { arch: 'plant',    tint: 0x66aa44 },
  vine_crawler:        { arch: 'plant',    tint: 0x44cc66 },
  bat:                 { arch: 'bird',     tint: 0x9988aa },

  // ── Kript / Nekropol ──────────────────────────────────────────────
  ghost:               { arch: 'ghost',    tint: 0xaaddff },
  wraith:              { arch: 'wraith',   tint: 0x9988cc },
  plague_zombie:       { arch: 'zombie',   tint: 0x88aa55 },
  lich_acolyte:        { arch: 'mage',     tint: 0x66ffcc },
  soul_reaper:         { arch: 'wraith',   tint: 0x555577 },
  death_knight:        { arch: 'knight',   tint: 0x554466 },
  blood_knight:        { arch: 'knight',   tint: 0xcc3344 },
  necromancer:         { arch: 'mage',     tint: 0x77dd88 },
  bone_dragon:         { arch: 'dragon',   tint: 0xddddcc },
  dark_knight:         { arch: 'knight',   tint: 0x555577 },
  corrupted_scholar:   { arch: 'mage',     tint: 0x9988bb },

  // ── Bataklık ──────────────────────────────────────────────────────
  poison_toad:         { arch: 'blob',     tint: 0x66bb33 },
  swamp_wraith:        { arch: 'wraith',   tint: 0x448855 },
  witch_apprentice:    { arch: 'mage',     tint: 0xaa66cc },
  venomous_hydra:      { arch: 'snake',    tint: 0x44dd44 },
  bog_crawler:         { arch: 'insect',   tint: 0x669944 },
  fungal_beast:        { arch: 'plant',    tint: 0x99aa55 },

  // ── Madenler ──────────────────────────────────────────────────────
  mine_rat:            { arch: 'rat',      tint: 0x997755 },
  gem_beetle:          { arch: 'insect',   tint: 0x44ccdd },
  rock_golem:          { arch: 'golem',    tint: 0x998877 },
  stone_sentinel:      { arch: 'golem',    tint: 0xaaaabb },
  crystal_spider:      { arch: 'spider',   tint: 0x99eeff },
  gem_golem:           { arch: 'golem',    tint: 0x66ddcc },
  golden_golem:        { arch: 'golem',    tint: 0xffcc44 },
  cave_troll:          { arch: 'golem',    tint: 0x998866 },

  // ── Fırtına Hisarı / gökyüzü ─────────────────────────────────────
  cloud_wisp:          { arch: 'elemental', tint: 0xcceeff },
  wind_spirit:         { arch: 'elemental', tint: 0xaaffee },
  storm_hawk:          { arch: 'bird',      tint: 0x88aaff },
  lightning_elemental: { arch: 'elemental', tint: 0xffee44 },
  sky_sentinel:        { arch: 'knight',    tint: 0xbbccff },

  // ── Buz mağarası / Don Çorakları ─────────────────────────────────
  blizzard_wolf:       { arch: 'beast',     tint: 0xbbddff },
  frost_sprite:        { arch: 'elemental', tint: 0x99ddff },
  permafrost_wyrm:     { arch: 'snake',     tint: 0x77ccee },
  yeti:                { arch: 'golem',     tint: 0xeeffff },
  ice_golem:           { arch: 'golem',     tint: 0xaaeeff },
  glacier_golem:       { arch: 'golem',     tint: 0x99ccee },
  ice_wraith:          { arch: 'wraith',    tint: 0x99ccff },
  frost_giant:         { arch: 'golem',     tint: 0xaaddee },
  aurora_spirit:       { arch: 'elemental', tint: 0x88ffee },
  crystal_drake:       { arch: 'dragon',    tint: 0x66ddee },
  crystal_golem:       { arch: 'golem',     tint: 0x77ccee },
  crystal_sentinel:    { arch: 'knight',    tint: 0x88ddee },

  // ── Şeytan Kapısı / Volkan ───────────────────────────────────────
  hell_hound:          { arch: 'beast',     tint: 0xdd4422 },
  lesser_demon:        { arch: 'imp',       tint: 0xcc4433 },
  pit_fiend:           { arch: 'demon',     tint: 0xaa2211 },
  infernal_mage:       { arch: 'mage',      tint: 0xff6633 },
  succubus:            { arch: 'demon',     tint: 0xdd44aa },
  molten_giant:        { arch: 'golem',     tint: 0xff7733 },
  fire_drake:          { arch: 'dragon',    tint: 0xff6644 },
  fire_elemental:      { arch: 'elemental', tint: 0xff5522 },
  flame_archon:        { arch: 'knight',    tint: 0xff8833 },
  flame_sentry:        { arch: 'golem',     tint: 0xee7722 },
  flame_wraith:        { arch: 'wraith',    tint: 0xff7744 },
  lava_slime:          { arch: 'blob',      tint: 0xff6633 },
  lava_worm:           { arch: 'snake',     tint: 0xff5522 },
  magma_golem:         { arch: 'golem',     tint: 0xff5511 },
  magma_hound:         { arch: 'beast',     tint: 0xee5522 },
  infernal_bat:        { arch: 'bird',      tint: 0xdd4433 },
  phoenix:             { arch: 'bird',      tint: 0xffaa33 },

  // ── Demirhane ─────────────────────────────────────────────────────
  magma_smith:         { arch: 'knight',    tint: 0xcc6622 },
  forge_automaton:     { arch: 'golem',     tint: 0xffaa44 },
  hammer_sentinel:     { arch: 'knight',    tint: 0xbb8855 },
  steel_golem:         { arch: 'golem',     tint: 0xccccdd },
  eternal_flame:       { arch: 'elemental', tint: 0xff9922 },
  titan_guard:         { arch: 'knight',    tint: 0xddaa66 },
  forge_golem:         { arch: 'golem',     tint: 0xcc8844 },
  molten_smith:        { arch: 'knight',    tint: 0xdd7733 },
  obsidian_guard:      { arch: 'knight',    tint: 0x555566 },

  // ── Harabeler / Sığınak ──────────────────────────────────────────
  ruin_ghost:          { arch: 'ghost',     tint: 0xccbb99 },
  enchanted_armor:     { arch: 'knight',    tint: 0x99bbdd },
  wyrm_guardian:       { arch: 'snake',     tint: 0xbbaa77 },
  arcane_construct:    { arch: 'golem',     tint: 0x9977ee },
  arcane_wisp:         { arch: 'elemental', tint: 0xbb88ff },
  dragon_priest:       { arch: 'mage',      tint: 0xcc8855 },
  elder_wyrm:          { arch: 'dragon',    tint: 0x44aabb },
  undead_dragon:       { arch: 'dragon',    tint: 0x778866 },
  young_dragon:        { arch: 'dragon',    tint: 0x66cc55 },
  mimic:               { arch: 'blob',      tint: 0xbb8844 },
  mimic_lord:          { arch: 'blob',      tint: 0xffaa33 },

  // ── Abis / deniz ──────────────────────────────────────────────────
  sea_serpent:         { arch: 'snake',     tint: 0x3388cc },
  tidal_guardian:      { arch: 'golem',     tint: 0x44aacc },
  water_elemental:     { arch: 'elemental', tint: 0x55aaff },
  deep_horror:         { arch: 'octopus',   tint: 0x336677 },
  deep_lurker:         { arch: 'octopus',   tint: 0x225577 },
  deep_slime:          { arch: 'blob',      tint: 0x3399aa },
  jellyfish:           { arch: 'octopus',   tint: 0x88bbff },
  leviathan_spawn:     { arch: 'snake',     tint: 0x447799 },
  maelstrom_spirit:    { arch: 'elemental', tint: 0x55bbdd },

  // ── Boşluk / Ebedi ────────────────────────────────────────────────
  void_stalker:        { arch: 'beast',     tint: 0x6644aa },
  time_wraith:         { arch: 'wraith',    tint: 0x8866ff },
  chaos_sprite:        { arch: 'elemental', tint: 0xcc66ff },
  shadow_fiend:        { arch: 'demon',     tint: 0x443366 },
  shadow_assassin:     { arch: 'knight',    tint: 0x554477 },
  entropy_demon:       { arch: 'demon',     tint: 0x7755cc },
  nightmare_beast:     { arch: 'beast',     tint: 0x662288 },
  abyssal_terror:      { arch: 'demon',     tint: 0x224488 },
  primordial_beast:    { arch: 'beast',     tint: 0x886644 },
  dark_seraphim:       { arch: 'demon',     tint: 0x8855cc },
  doom_knight:         { arch: 'knight',    tint: 0x665544 },

  // ── Prosedürel kalanlar ───────────────────────────────────────────
  // Plan gereği null: Eternal elit spawn'ları prosedürel imza çizimlerini korur.
  world_eater:         null,
  dread_lord:          null,
  // Gerçek dungeon boss'ları (sahnelerde BOSS const + interact:'boss'):
  // 13 boss imza AI/prosedürel görselleri korunur.
  boss_frost:          null,  // IsoDungeon
  boss_frost_v2:       null,  // Frost Dungeon ikinci boss formu — prosedürel
  swamp_hag:           null,  // Swamp boss'u — prosedürel imza görsel (BOSS_DATA IsoSwampScene:11)
  shadow_lord:         null,  // IsoCrypt
  storm_titan:         null,  // IsoCitadel
  titan_forgemaster:   null,  // IsoForge
  void_sovereign:      null,  // IsoVoid
  demon_lord:          null,  // IsoDemonGate
  lich_king:           null,  // IsoNecropolis
  frost_emperor:       null,  // IsoFrostWastes
  crystal_wyrm:        null,  // IsoIceCave
  crystal_colossus:    null,  // IsoMines
  ancient_guardian:    null,  // IsoRuins
  ancient_dragon_king: null,  // IsoSanctum
  infernal_dragon:     null,  // IsoVolcano
  abyssal_leviathan:   null,  // IsoAbyss
  abyssal_overlord:    null,  // IsoEternal
};

const DEFAULT_SCALE = 3;

export function getMonsterVisual(type: string): (ArchetypeDef & { tint?: number; scale: number }) | null {
  const v = MONSTER_VISUALS[type];
  if (!v) return null;
  const a = ARCHETYPES[v.arch];
  if (!a) return null;
  return { ...a, tint: v.tint, scale: a.scale ?? DEFAULT_SCALE };
}
