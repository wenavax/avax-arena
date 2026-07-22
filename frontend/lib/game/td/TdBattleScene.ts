import * as Phaser from 'phaser';
import { TD_FONT } from './tdCore';
import { GAME_WIDTH, GAME_HEIGHT, SCALE, tileIndex } from '../config';
import { PlayerState } from '../PlayerState';
import { MonsterData } from '../Monster';
import { PLAYER_TINTS, getObjectTint } from '../tints';
import { Element, ELEMENT_COLORS, ELEMENT_ICONS, MONSTER_ELEMENTS, CLASS_ELEMENTS, getElementMultiplier, getEffectivenessText } from '../elements';
import { CLASS_SKILLS, CLASS_MP, Skill } from '../skills';
import { rollLoot, RARITY_COLORS, LootResult } from '../lootTables';
import { music } from '../musicSystem';
import { mp } from '../multiplayer/socket';
import { incrementStat } from '../achievements';
import { getRandomMobLine } from '../lore';
// TD reskin: BattleScene'in izo `drawBattleBackdrop` (ZONE_ATMOSPHERE) yerine
// bölge-paletli prosedürel backdrop (td/tiles + td/atmosphere).
import { biomeTopColor } from './tiles';
import { atmoForRegion } from './atmosphere';
import { mkMonsterChibi, monsterPlanFor } from './sprites/monsterChibi';
import { mkBattleHero } from './sprites/battleHero';
import type { Biome } from './worldMap';

interface BattleData { monster: MonsterData; returnScene: string; region?: string; sandbox?: boolean; }

// Bölge anahtarı (worldMap REGIONS `.key`) → Biome (tiles.ts paleti). 'town'/'grassE'/'grassS'
// hariç REGIONS key'leri zaten Biome literalleriyle birebir eşleşiyor.
const REGION_TO_BIOME: Record<string, Biome> = {
  town: 'town', forest: 'forest', grassE: 'forest', grassS: 'grass',
  swamp: 'swamp', mines: 'mines', ruins: 'ruins', citadel: 'citadel',
  sanctum: 'sanctum', crypt: 'crypt', frostwastes: 'frostwastes',
  necropolis: 'necropolis', volcano: 'volcano', abyss: 'abyss',
  forge: 'forge', demongate: 'demongate', voidrealm: 'voidrealm', eternal: 'eternal',
};

// ─── Color helpers ───
function darken(c: number, f: number): number {
  return (Math.max(0, Math.floor(((c >> 16) & 0xff) * f)) << 16) |
         (Math.max(0, Math.floor(((c >> 8) & 0xff) * f)) << 8) |
          Math.max(0, Math.floor((c & 0xff) * f));
}

const MONSTER_COLORS: Record<string, number> = {
  skeleton: 0xccccbb, ghost: 0x88bbdd, demon: 0xdd4444, spider: 0x55aa66,
  bat: 0x8866aa, slime: 0x66dd77, dragon: 0x55ccff, ogre: 0xdd8844,
  wolf: 0x888888, treant: 0x558833, frost_dragon: 0x55ccff,
  boss_frost: 0x55ccff, boss_frost_v2: 0xff2266,
  ice_golem: 0x88ccee, frost_sprite: 0xaaeeff, yeti: 0xddddff, crystal_wyrm: 0x44bbee,
  fire_elemental: 0xff6622, lava_slime: 0xff4400, magma_golem: 0xcc4400, infernal_dragon: 0xff3300,
  necromancer: 0x6633aa, mimic: 0xaa8844, phoenix: 0xff8800, crystal_golem: 0x99ddee,
  venomous_hydra: 0x33aa88, storm_hawk: 0xddcc22, shadow_assassin: 0x443366, lava_worm: 0xdd5500,
  // Crypt of Shadows
  wraith: 0x7744aa, skeleton_warrior: 0xbbbbaa, dark_knight: 0x555577, shadow_lord: 0x332255,
  // Abyssal Depths
  water_elemental: 0x4488cc, sea_serpent: 0x2277aa, deep_lurker: 0x335566, arcane_wisp: 0xbb88ff,
  deep_horror: 0x223344, crystal_sentinel: 0x77bbdd, tidal_guardian: 0x3366aa, abyssal_leviathan: 0x112244,
  // Dragon's Sanctum
  flame_sentry: 0xff5533, obsidian_guard: 0x444444, fire_drake: 0xff4422, forge_golem: 0xaa5522,
  dragon_priest: 0x884422, young_dragon: 0x66ddaa, mimic_lord: 0xcc9944, golden_golem: 0xddaa33,
  undead_dragon: 0x667788, death_knight: 0x556677, elder_wyrm: 0x3399aa, flame_archon: 0xff6633,
  // Haunted Swamp
  bog_crawler: 0x556633, poison_toad: 0x66aa44, swamp_wraith: 0x557744, fungal_beast: 0x887744,
  swamp_hag: 0x556622,
  // Crystal Mines
  mine_rat: 0x997755, rock_golem: 0x887766, gem_beetle: 0x55cc88, cave_troll: 0x778866,
  crystal_colossus: 0x66aacc,
  // Sky Citadel
  wind_spirit: 0xaaddff, lightning_elemental: 0xffdd44, sky_sentinel: 0x8899bb, storm_titan: 0x6677aa,
  // Necropolis
  skeleton_lord: 0xaaaa99, plague_zombie: 0x779955, bone_dragon: 0xbbbb99, soul_reaper: 0x664488,
  lich_king: 0x553388,
  // Frost Wastes
  frost_giant: 0x99bbdd, blizzard_wolf: 0xbbccee, glacier_golem: 0x77aacc, frost_emperor: 0x4488bb,
  // Demon's Gate
  hell_hound: 0xcc4422, lesser_demon: 0xbb3333, pit_fiend: 0xaa2222, demon_lord: 0x991111,
  // Ancient Ruins
  stone_sentinel: 0x998877, arcane_construct: 0x8877cc, enchanted_armor: 0x7788aa, ancient_guardian: 0x887766,
  // Void Realm
  void_stalker: 0x443355, shadow_fiend: 0x332244, nightmare_beast: 0x553344, void_sovereign: 0x221133,
  // Titan's Forge
  forge_automaton: 0x888899, molten_giant: 0xcc5500, steel_golem: 0x8899aa, titan_forgemaster: 0xaa6633,
  // Eternal Abyss
  abyssal_terror: 0x223344, dread_lord: 0x442233, doom_knight: 0x333344, world_eater: 0x111122,
  abyssal_overlord: 0x220011,
  // Extra scene monsters
  deep_slime: 0x338866, chaos_sprite: 0x9944cc, gem_golem: 0x66ccaa,
  ancient_dragon_king: 0xffcc22,
};

// ─── Monster category system ───
type MonsterCategory = 'humanoid' | 'beast' | 'dragon' | 'slime' | 'golem' | 'spirit' | 'insect' | 'demon' | 'boss';

const MONSTER_CATEGORY: Record<string, MonsterCategory> = {
  // Humanoid
  skeleton: 'humanoid', necromancer: 'humanoid', shadow_assassin: 'humanoid', dark_knight: 'humanoid',
  death_knight: 'humanoid', doom_knight: 'humanoid', skeleton_warrior: 'humanoid', skeleton_lord: 'humanoid',
  shadow_lord: 'humanoid', dragon_priest: 'humanoid', plague_zombie: 'humanoid', soul_reaper: 'humanoid',
  dread_lord: 'humanoid', flame_archon: 'humanoid', enchanted_armor: 'humanoid', ogre: 'humanoid',
  frost_giant: 'humanoid', molten_giant: 'humanoid', treant: 'humanoid',
  // Beast
  wolf: 'beast', yeti: 'beast', hell_hound: 'beast', blizzard_wolf: 'beast', fungal_beast: 'beast',
  nightmare_beast: 'beast', bog_crawler: 'beast', poison_toad: 'beast', deep_lurker: 'beast',
  sea_serpent: 'beast', venomous_hydra: 'beast', lava_worm: 'beast', world_eater: 'beast',
  // Dragon
  dragon: 'dragon', frost_dragon: 'dragon', fire_drake: 'dragon', infernal_dragon: 'dragon',
  crystal_wyrm: 'dragon', young_dragon: 'dragon', undead_dragon: 'dragon', elder_wyrm: 'dragon',
  ancient_dragon_king: 'dragon', bone_dragon: 'dragon', phoenix: 'dragon', storm_hawk: 'dragon',
  // Slime
  slime: 'slime', lava_slime: 'slime', deep_slime: 'slime',
  // Golem
  ice_golem: 'golem', magma_golem: 'golem', rock_golem: 'golem', crystal_golem: 'golem',
  forge_golem: 'golem', steel_golem: 'golem', golden_golem: 'golem', crystal_colossus: 'golem',
  crystal_sentinel: 'golem', gem_golem: 'golem', glacier_golem: 'golem', stone_sentinel: 'golem',
  obsidian_guard: 'golem', forge_automaton: 'golem', arcane_construct: 'golem', tidal_guardian: 'golem',
  // Spirit
  ghost: 'spirit', frost_sprite: 'spirit', wraith: 'spirit', swamp_wraith: 'spirit', void_stalker: 'spirit',
  shadow_fiend: 'spirit', chaos_sprite: 'spirit', wind_spirit: 'spirit', arcane_wisp: 'spirit',
  fire_elemental: 'spirit', water_elemental: 'spirit', lightning_elemental: 'spirit',
  deep_horror: 'spirit',
  // Insect
  spider: 'insect', bat: 'insect', cave_troll: 'insect', gem_beetle: 'insect', mine_rat: 'insect',
  mimic: 'insect', mimic_lord: 'insect',
  // Demon
  demon: 'demon', lesser_demon: 'demon', pit_fiend: 'demon', demon_lord: 'demon',
  flame_sentry: 'demon',
  // Boss
  boss_frost: 'boss', boss_frost_v2: 'boss', abyssal_leviathan: 'boss', void_sovereign: 'boss',
  titan_forgemaster: 'boss', abyssal_overlord: 'boss', lich_king: 'boss', storm_titan: 'boss',
  swamp_hag: 'boss', ancient_guardian: 'boss', frost_emperor: 'boss', abyssal_terror: 'boss',
  sky_sentinel: 'boss',
};

// ─── Status effect tracking ───
interface StatusEffect {
  type: 'burn' | 'poison' | 'stun' | 'freeze' | 'slow' | 'bleed';
  turns: number;
  pctPerTurn: number;  // % of maxHP per turn (for DOTs)
  spdReduction?: number; // for slow
}

export class TdBattleScene extends Phaser.Scene {
  private monster!: MonsterData;
  private region = 'forest';
  // Testnet önizleme koruması: canlı frostbite_save/achievements/on-chain XP'ye YAZMAZ (Faz 4 save-v2 gelene dek).
  private sandbox = true;
  // TD reskin: canavar Graphics yerine mkMonsterChibi 2-kare Image + flip tween'i.
  private monsterImg?: Phaser.GameObjects.Image;
  private monsterFlipTimer?: Phaser.Time.TimerEvent;
  private playerHp!: number;
  private playerMaxHp!: number;
  private playerDef!: number;
  private playerSpd!: number;
  private playerMp!: number;
  private playerMaxMp!: number;
  private playerMpRegen!: number;
  private defending = false;
  private battleOver = false;
  private turn: 'player' | 'enemy' = 'player';
  private busy = false;

  // Element
  private playerElement!: Element;
  private monsterElement!: Element;

  // Skills
  private skills!: Skill[];

  // Status effects
  private playerStatusEffects: StatusEffect[] = [];
  private monsterStatusEffects: StatusEffect[] = [];

  // Buffs
  private playerDefBuff = 0;
  private playerDefBuffTurns = 0;
  private playerDodgeBuff = 0;
  private playerDodgeBuffTurns = 0;
  private monsterStunned = false;
  private monsterDefBuff = 0;
  private monsterDefBuffTurns = 0;
  private extraTurnArmed = false;

  // Achievement tracking per battle
  private battleCrits = 0;
  private battleDodges = 0;
  private battleDamageTaken = 0;

  // Enemy AI state
  private enemyTurnCount = 0;

  // UI refs
  // Faz 5.3: oyuncu da Graphics vektör değil, mkBattleHero 2-kare pixel-art Image
  // (canavarla aynı dil; tween'ler .x/.y taşıdığından Image birebir uyumlu).
  private playerGfx!: Phaser.GameObjects.Image;
  private playerFlipTimer?: Phaser.Time.TimerEvent;
  // TD reskin: canavar artık Graphics silüeti değil, mkMonsterChibi 2-kare Image.
  private monsterGfx!: Phaser.GameObjects.Image;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private monsterHpBar!: Phaser.GameObjects.Rectangle;
  private playerHpGhost!: Phaser.GameObjects.Rectangle;
  private monsterHpGhost!: Phaser.GameObjects.Rectangle;
  private lowHpOverlay: Phaser.GameObjects.Rectangle | null = null;
  private playerHpText!: Phaser.GameObjects.Text;
  private monsterHpText!: Phaser.GameObjects.Text;
  private playerMpBar!: Phaser.GameObjects.Rectangle;
  private playerMpText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private turnIndicator!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private playerBaseX = 0;
  private monsterBaseX = 0;
  private stageY = 0;

  // Skill menu
  private skillMenuContainer: Phaser.GameObjects.Container | null = null;
  private btnGraphics: { gfx: Phaser.GameObjects.Graphics; hitArea: Phaser.GameObjects.Rectangle; color: number; x: number; btnW: number; btnY: number; btnH: number }[] = [];

  // Faz 5.2: 1280×720 mantıksal alanı viewport'a oturtan kesirli kamera fit-zoom'u
  // (zoom-punch gibi kamera efektleri buna göreli çalışır).
  private baseZoom = 1;

  /** Kamerayı 1280×720 mantıksal savaş alanına fit'ler (create + viewport RESIZE). */
  private applyFitZoom(): void {
    this.baseZoom = Math.min(this.scale.width / GAME_WIDTH, this.scale.height / GAME_HEIGHT);
    this.cameras.main.setZoom(this.baseZoom);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    // Letterbox bantlarında altta pauselu duran dünya/zindan görünmesin — opak kamera bg.
    this.cameras.main.setBackgroundColor('#0d1319');
  }

  constructor() { super({ key: 'TdBattle' }); }

  init(data: BattleData) {
    this.monster = { ...data.monster };
    this.region = data.region || 'forest';
    this.monsterImg = undefined;
    this.monsterFlipTimer?.remove();
    this.monsterFlipTimer = undefined;
    this.playerFlipTimer?.remove();
    this.playerFlipTimer = undefined;
    // Iso zone scenes hand-build monster payloads without reward/spd fields.
    // Without these defaults victory() does xp += undefined → NaN, which
    // serializes as null and wipes gold/xp on the next load.
    const lvl = this.monster.level || 1;
    if (this.monster.xpReward == null) {
      this.monster.xpReward = 10 + lvl * 5 + (this.monster.isElite ? lvl * 3 : 0);
    }
    if (this.monster.goldReward == null) {
      this.monster.goldReward = 2 + Math.floor(Math.random() * lvl * 3) + (this.monster.isElite ? lvl : 0);
    }
    if (this.monster.spd == null) this.monster.spd = 5 + Math.floor(lvl / 2);
    this.sandbox = data.sandbox !== false;
    const s = PlayerState.get();
    this.playerHp = s.hp;
    this.playerMaxHp = s.maxHp;
    this.playerDef = s.def;
    this.playerSpd = s.spd;
    this.playerMp = s.mp;
    this.playerMaxMp = s.maxMp;
    this.playerMpRegen = CLASS_MP[s.playerClass]?.regen || 3;
    this.defending = false;
    this.battleOver = false;
    this.busy = false;
    this.enemyTurnCount = 0;
    this.battleCrits = 0;
    this.battleDodges = 0;
    this.battleDamageTaken = 0;

    // Element
    this.playerElement = CLASS_ELEMENTS[s.playerClass] || 'earth';
    // Elites arrive as 'elite_<type>' — look up by base type or every elite
    // falls back to a generic earth humanoid
    const baseType = this.monster.type.startsWith('elite_') ? this.monster.type.slice(6) : this.monster.type;
    this.monsterElement = MONSTER_ELEMENTS[baseType] || MONSTER_ELEMENTS[this.monster.type] || 'earth';

    // Skills
    this.skills = CLASS_SKILLS[s.playerClass] || CLASS_SKILLS.knight;

    // Reset status
    this.playerStatusEffects = [];
    this.monsterStatusEffects = [];
    this.playerDefBuff = 0;
    this.playerDefBuffTurns = 0;
    this.playerDodgeBuff = 0;
    this.playerDodgeBuffTurns = 0;
    this.monsterStunned = false;
    this.monsterDefBuff = 0;
    this.monsterDefBuffTurns = 0;
    this.extraTurnArmed = false;
    this.lowHpOverlay = null; // scene objects die on shutdown; drop the stale ref
    this.skillMenuContainer = null;
    this.btnGraphics = [];

    // Determine first turn by SPD
    this.turn = s.spd >= (this.monster.spd || 5) ? 'player' : 'enemy';
  }

  create() {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const state = PlayerState.get();

    // TD reskin: BattleScene tüm düzenini GAME_WIDTH×GAME_HEIGHT (1280×720) mutlak
    // koordinatlarla çizer (screen-space HUD yok — setScrollFactor(0) hiç kullanılmıyor,
    // her şey world-space).
    // Faz 5.2 (Larvy paritesi): canvas hep TAM viewport çözünürlüğünde (Scale.RESIZE),
    // ScaleManager'a DOKUNULMAZ — bu sahnenin KAMERASI 1280×720 mantıksal alanı kesirli
    // fit-zoom'la viewport'a oturtur (letterbox kamera dışı = oyun bg rengi). Dünya
    // sahnesinin kamerası da kendine ait → savaş çıkışında restore dansı yok.
    this.applyFitZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyFitZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyFitZoom, this));

    // ── Background ──
    // TD reskin: izo'nun ZONE_ATMOSPHERE+silüet backdrop'u yerine bölge-paletli
    // prosedürel gradient + vinyet (data.region → biomeTopColor + atmoForRegion).
    this.drawTdBackdrop(W, H);

    const bg = this.add.graphics();
    // Backdrop görünsün diye ekran-dolusu koyu banyo yarı-saydam (eskiden 0.97 opaktı).
    bg.fillStyle(0x0a0e18, 0.55);
    bg.fillRect(0, 0, W, H);
    // Subtle gradient overlay: darker top to slightly lighter middle
    bg.fillStyle(0x000000, 0.22);
    bg.fillRect(0, 0, W, H * 0.15);
    bg.fillStyle(0x000000, 0.1);
    bg.fillRect(0, H * 0.15, W, H * 0.15);
    // Scatter star dots in top 30%
    for (let i = 0; i < 35; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H * 0.3;
      const sa = 0.1 + Math.random() * 0.2;
      bg.fillStyle(0xffffff, sa);
      bg.fillRect(sx, sy, 1, 1);
    }
    // Aren zemini — okunabilirlik için opak elipsler (karakterler bunun üstünde durur)
    bg.fillStyle(0x141a28, 1);
    bg.fillEllipse(W / 2, H * 0.42, W * 0.75, H * 0.25);
    bg.fillStyle(0x0f1420, 1);
    bg.fillEllipse(W / 2, H * 0.42, W * 0.65, H * 0.18);
    bg.lineStyle(1, 0x1a2030, 0.3);
    for (let i = -6; i <= 6; i++) {
      bg.lineBetween(W / 2 + i * 50, H * 0.3, W / 2 + i * 50, H * 0.54);
    }
    for (let i = 0; i < 6; i++) {
      bg.lineBetween(W * 0.15, H * 0.32 + i * 16, W * 0.85, H * 0.32 + i * 16);
    }
    // ── Faz 5.3: arena detayı — bölge-paletli kenar halkaları + zemin benekleri + dövüşçü padleri ──
    const arenaTint = Phaser.Display.Color.HexStringToColor(biomeTopColor(REGION_TO_BIOME[this.region] ?? 'forest')).color;
    bg.lineStyle(2, arenaTint, 0.20);
    bg.strokeEllipse(W / 2, H * 0.42, W * 0.65, H * 0.18);
    bg.lineStyle(1, 0xffffff, 0.05);
    bg.strokeEllipse(W / 2, H * 0.42, W * 0.55, H * 0.14);
    bg.fillStyle(arenaTint, 0.09);
    for (let i = 0; i < 26; i++) {                     // deterministik çakıl benekleri
      const a = ((i * 137) % 360) * Math.PI / 180;
      const rr = ((i * 71) % 100) / 100;
      bg.fillRect(W / 2 + Math.cos(a) * rr * W * 0.29, H * 0.42 + Math.sin(a) * rr * H * 0.075, 3, 2);
    }
    bg.fillStyle(arenaTint, 0.10);                     // dövüşçü ışık padleri
    bg.fillEllipse(W * 0.25, H * 0.38 + 46, 150, 34);
    bg.fillEllipse(W * 0.75, H * 0.38 + 46, 150, 34);

    // ── Title ──
    this.add.text(W / 2, 24, '⚔  BATTLE  ⚔', {
      fontSize: '22px', color: '#cc3333', fontFamily: TD_FONT, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Character positions ──
    this.playerBaseX = W * 0.25;
    this.monsterBaseX = W * 0.75;
    this.stageY = H * 0.38;

    // ── Draw characters ──
    // Faz 5.3: iki dövüşçü de pixel-art chibi, tutarlı ölçek + zemin gölgesi.
    this.add.ellipse(this.playerBaseX, this.stageY + 46, 108, 26, 0x000000, 0.32).setDepth(9);
    this.add.ellipse(this.monsterBaseX, this.stageY + 46, 108, 26, 0x000000, 0.32).setDepth(9);
    this.playerGfx = this.spawnPlayerChibi(this.playerBaseX, this.stageY + 46, state);
    // TD reskin: chibi canavar (2-kare flip) — izo'nun kategori-Graphics silüeti yerine.
    this.monsterGfx = this.spawnMonsterChibi(this.monsterBaseX, this.stageY + 46);

    // ── VS badge ──
    const vsBg = this.add.circle(W / 2, this.stageY - 10, 24, 0xcc2222, 1).setDepth(11);
    this.add.text(W / 2, this.stageY - 10, 'VS', {
      fontSize: '16px', color: '#ffffff', fontFamily: TD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: vsBg, scaleX: 1.15, scaleY: 1.15, duration: 600, yoyo: true, repeat: -1 });

    // ── Element badges ──
    const peIcon = ELEMENT_ICONS[this.playerElement];
    const meIcon = ELEMENT_ICONS[this.monsterElement];
    const peColor = ELEMENT_COLORS[this.playerElement];
    const meColor = ELEMENT_COLORS[this.monsterElement];
    this.add.text(this.playerBaseX, this.stageY + 50, `${peIcon} ${this.playerElement.toUpperCase()}`, {
      fontSize: '11px', color: `#${peColor.toString(16).padStart(6, '0')}`, fontFamily: TD_FONT, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);
    this.add.text(this.monsterBaseX, this.stageY + 50, `${meIcon} ${this.monsterElement.toUpperCase()}`, {
      fontSize: '11px', color: `#${meColor.toString(16).padStart(6, '0')}`, fontFamily: TD_FONT, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);

    // ── Player info panel (left) ──
    const panelY = H * 0.58;
    this.drawInfoPanel(40, panelY, W * 0.42, state.name, `Lv.${state.level}  ATK ${state.atk}  DEF ${state.def}  SPD ${state.spd}`,
      state.equipped.weapon?.name || 'Fists', state.equipped.armor?.name || 'None', '#00ccee');

    // Player HP bar
    this.add.rectangle(W * 0.25 + 20, panelY + 68, 202, 16, 0x222233).setDepth(11);
    this.playerHpGhost = this.add.rectangle(W * 0.25 + 20 - 100, panelY + 68, 200, 14, 0xffffff, 0.35).setOrigin(0, 0.5).setDepth(11);
    this.playerHpBar = this.add.rectangle(W * 0.25 + 20 - 100, panelY + 68, 200, 14, 0x00cc66).setOrigin(0, 0.5).setDepth(12);
    // Player HP gradient highlight + glass edge
    const pHpHighlight = this.add.graphics().setDepth(12);
    pHpHighlight.fillStyle(0x00ff88, 0.3);
    pHpHighlight.fillRect(W * 0.25 + 20 - 100, panelY + 68 - 7, 200, 5);
    pHpHighlight.fillStyle(0x44ffaa, 0.4);
    pHpHighlight.fillRect(W * 0.25 + 20 - 100, panelY + 68 - 7, 200, 1);
    this.playerHpText = this.add.text(W * 0.25 + 20, panelY + 68, '', {
      fontSize: '10px', color: '#ffffff', fontFamily: TD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(13);

    // Player MP bar
    this.add.rectangle(W * 0.25 + 20, panelY + 88, 202, 12, 0x222233).setDepth(11);
    this.playerMpBar = this.add.rectangle(W * 0.25 + 20 - 100, panelY + 88, 200, 10, 0x3366cc).setOrigin(0, 0.5).setDepth(12);
    // Player MP gradient highlight + glass edge
    const pMpHighlight = this.add.graphics().setDepth(12);
    pMpHighlight.fillStyle(0x5588ff, 0.3);
    pMpHighlight.fillRect(W * 0.25 + 20 - 100, panelY + 88 - 5, 200, 3);
    pMpHighlight.fillStyle(0x5588ff, 0.4);
    pMpHighlight.fillRect(W * 0.25 + 20 - 100, panelY + 88 - 5, 200, 1);
    this.playerMpText = this.add.text(W * 0.25 + 20, panelY + 88, '', {
      fontSize: '9px', color: '#aaccff', fontFamily: TD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(13);
    this.updatePlayerHp();
    this.updatePlayerMp();

    // ── Monster info panel (right) ──
    const mType = this.monster.type.charAt(0).toUpperCase() + this.monster.type.slice(1);
    this.drawInfoPanel(W * 0.55, panelY, W * 0.42, mType, `Lv.${this.monster.level}  ATK ${this.monster.atk}  DEF ${this.monster.def}  SPD ${this.monster.spd}`,
      '', '', '#cc4444');

    // Monster HP bar
    this.add.rectangle(W * 0.75 + 20, panelY + 68, 202, 16, 0x222233).setDepth(11);
    this.monsterHpGhost = this.add.rectangle(W * 0.75 + 20 - 100, panelY + 68, 200, 14, 0xffffff, 0.35).setOrigin(0, 0.5).setDepth(11);
    this.monsterHpBar = this.add.rectangle(W * 0.75 + 20 - 100, panelY + 68, 200, 14, 0xcc3333).setOrigin(0, 0.5).setDepth(12);
    // Monster HP gradient highlight + glass edge
    const mHpHighlight = this.add.graphics().setDepth(12);
    mHpHighlight.fillStyle(0xff5544, 0.3);
    mHpHighlight.fillRect(W * 0.75 + 20 - 100, panelY + 68 - 7, 200, 5);
    mHpHighlight.fillStyle(0xff7766, 0.4);
    mHpHighlight.fillRect(W * 0.75 + 20 - 100, panelY + 68 - 7, 200, 1);
    this.monsterHpText = this.add.text(W * 0.75 + 20, panelY + 68, '', {
      fontSize: '10px', color: '#ffffff', fontFamily: TD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(13);
    this.updateMonsterHp();

    // ── Status effects display ──
    this.statusText = this.add.text(W / 2, H * 0.71, '', {
      fontSize: '11px', color: '#aaaaaa', fontFamily: TD_FONT, align: 'center',
    }).setOrigin(0.5).setDepth(11);

    // ── Battle log ──
    const logBg = this.add.graphics().setDepth(10);
    logBg.fillStyle(0x0a0e18, 0.7);
    logBg.fillRoundedRect(W / 2 - W * 0.4, H * 0.77 - 20, W * 0.8, 40, 8);
    logBg.lineStyle(1, 0x222840, 0.4);
    logBg.strokeRoundedRect(W / 2 - W * 0.4, H * 0.77 - 20, W * 0.8, 40, 8);
    this.logText = this.add.text(W / 2, H * 0.77, 'A wild enemy appears!', {
      fontSize: '13px', color: '#aabbcc', fontFamily: TD_FONT, align: 'center',
    }).setOrigin(0.5).setDepth(11);

    // ── Turn indicator ──
    const turnBg = this.add.graphics().setDepth(10);
    turnBg.fillStyle(0x1a1a2a, 0.6);
    turnBg.fillRoundedRect(W / 2 - 140, H * 0.84 - 14, 280, 28, 6);
    // Pulse animation on the turn indicator background
    this.tweens.add({
      targets: turnBg, alpha: 0.4, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.turnIndicator = this.add.text(W / 2, H * 0.84, '', {
      fontSize: '13px', color: '#00ccee', fontFamily: TD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11);

    // ── Music ──
    const isBoss = this.monster.type.includes('boss') || this.monster.type.includes('dragon') || this.monster.type.includes('wyrm');
    music.play(isBoss ? 'boss' : 'battle');

    // ── Monster encounter line (30% chance, lore hint) ──
    const mobLine = getRandomMobLine(this.monster.type);
    if (mobLine) {
      const bubble = this.add.graphics().setDepth(30);
      const bubbleX = this.monsterBaseX;
      const bubbleY = this.stageY - 80;
      const lineText = this.add.text(bubbleX, bubbleY, `"${mobLine}"`, {
        fontSize: '11px', color: '#ddccaa', fontFamily: TD_FONT, fontStyle: 'italic',
        wordWrap: { width: 200 }, align: 'center',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(31);
      const tw = lineText.width + 16;
      const th = lineText.height + 10;
      bubble.fillStyle(0x1a1420, 0.9);
      bubble.fillRoundedRect(bubbleX - tw / 2, bubbleY - th / 2, tw, th, 6);
      bubble.lineStyle(1, 0x665544, 0.5);
      bubble.strokeRoundedRect(bubbleX - tw / 2, bubbleY - th / 2, tw, th, 6);
      // Fade out after 3s
      this.tweens.add({
        targets: [bubble, lineText], alpha: 0, duration: 800, delay: 3000,
        onComplete: () => { bubble.destroy(); lineText.destroy(); },
      });
    }

    // ── Action buttons ──
    this.createButtons();
    this.sfx('metal-click');

    // If enemy goes first
    if (this.turn === 'enemy') {
      this.busy = true;
      this.turnIndicator.setText('— ENEMY TURN —').setColor('#cc4444');
      this.setButtonsEnabled(false);
      this.time.delayedCall(800, () => this.enemyTurn());
    } else {
      this.turnIndicator.setText('— YOUR TURN —').setColor('#00ccee');
    }
  }

  // ── Info panel ──
  private drawInfoPanel(x: number, y: number, w: number, name: string, stats: string, weapon: string, armor: string, accent: string): void {
    const accentColor = parseInt(accent.replace('#', ''), 16);
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x141a28, 0.9);
    g.fillRoundedRect(x, y, w, 100, 10);
    g.lineStyle(1, accentColor, 0.4);
    g.strokeRoundedRect(x, y, w, 100, 10);
    g.fillStyle(accentColor, 1);
    g.fillRect(x + 12, y, w - 24, 2);

    // Name+level background panel
    const nameBg = this.add.graphics().setDepth(10);
    nameBg.fillStyle(0x141a28, 0.8);
    nameBg.fillRoundedRect(x + 8, y + 6, w - 16, 48, 6);
    nameBg.lineStyle(1, 0x2a3a4a, 0.5);
    nameBg.strokeRoundedRect(x + 8, y + 6, w - 16, 48, 6);

    this.add.text(x + 16, y + 10, name, {
      fontSize: '16px', color: accent, fontFamily: TD_FONT, fontStyle: 'bold',
    }).setDepth(11);
    this.add.text(x + 16, y + 32, stats, {
      fontSize: '11px', color: '#667788', fontFamily: TD_FONT,
    }).setDepth(11);
    if (weapon) {
      this.add.text(x + 16, y + 50, `⚔ ${weapon}   🛡 ${armor}`, {
        fontSize: '10px', color: '#556677', fontFamily: TD_FONT,
      }).setDepth(11);
    }
  }

  // ── Draw player character ──
  // ── Vektör oyuncu çizimi — TD'de KULLANILMIYOR (Faz 5.3: spawnPlayerChibi/mkBattleHero'ya taşındı) ──
  private drawPlayerChar(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, ps: PlayerState): void {
    const S = 2.5;
    const bodyColor = { knight: 0x4488cc, mage: 0x9944cc, archer: 0x44aa44 }[ps.playerClass] || 0x4488cc;
    const skinColor = ps.skinColor || 0xffddbb;
    const hairColor = ps.hairColor || 0x443322;

    gfx.fillStyle(0x000000, 0.3);
    gfx.fillEllipse(cx, cy + 18 * S, 18 * S, 6 * S);
    gfx.fillStyle(darken(bodyColor, 0.65), 1);
    gfx.fillRect(cx - 3 * S, cy - 1 * S, 3 * S, 7 * S);
    gfx.fillRect(cx + 0 * S, cy - 1 * S, 3 * S, 7 * S);
    gfx.fillStyle(darken(bodyColor, 0.45), 1);
    gfx.fillRect(cx - 3.5 * S, cy + 5 * S, 4 * S, 2.5 * S);
    gfx.fillRect(cx - 0.5 * S, cy + 5 * S, 4 * S, 2.5 * S);
    gfx.fillStyle(bodyColor, 1);
    gfx.fillRoundedRect(cx - 5 * S, cy - 14 * S, 10 * S, 13 * S, 2 * S);
    gfx.fillStyle(darken(bodyColor, 0.5), 1);
    gfx.fillRect(cx - 5 * S, cy - 2 * S, 10 * S, 2 * S);
    gfx.fillStyle(0xccaa44, 1);
    gfx.fillRect(cx - 1 * S, cy - 2 * S, 2 * S, 2 * S);
    gfx.fillStyle(darken(bodyColor, 0.85), 1);
    gfx.fillRoundedRect(cx + 4 * S, cy - 12 * S, 3 * S, 10 * S, S);
    gfx.fillStyle(skinColor, 1);
    gfx.fillCircle(cx + 5.5 * S, cy - 2 * S, 1.8 * S);

    const wid = ps.equipped.weapon?.id || '';
    if (wid) {
      const bc = wid.includes('flame') ? 0xff6622 : wid.includes('ice') ? 0x66ddff : wid.includes('shadow') ? 0x9944cc : wid.includes('steel') ? 0xddeeff : 0xaabbcc;
      gfx.fillStyle(bc, 1);
      gfx.fillRect(cx + 5 * S, cy - 14 * S, 1.5 * S, -10 * S);
      gfx.fillStyle(0x886644, 1);
      gfx.fillRect(cx + 3.5 * S, cy - 13.5 * S, 4.5 * S, 1.5 * S);
    }

    gfx.fillStyle(skinColor, 1);
    gfx.fillCircle(cx, cy - 18 * S, 5.5 * S);
    gfx.fillStyle(hairColor, 1);
    gfx.beginPath();
    gfx.arc(cx, cy - 19.5 * S, 5.5 * S, Math.PI, 0, false);
    gfx.closePath();
    gfx.fillPath();
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(cx + 2 * S, cy - 18.5 * S, 1.5 * S);
    gfx.fillCircle(cx + 5 * S, cy - 18.5 * S, 1.5 * S);
    gfx.fillStyle(0x222222, 1);
    gfx.fillCircle(cx + 2.5 * S, cy - 18.5 * S, 0.8 * S);
    gfx.fillCircle(cx + 5.5 * S, cy - 18.5 * S, 0.8 * S);

    if (ps.playerClass === 'knight') {
      gfx.fillStyle(0x88aacc, 1);
      gfx.fillRoundedRect(cx - 4 * S, cy - 24 * S, 8 * S, 3 * S, S);
    } else if (ps.playerClass === 'mage') {
      gfx.fillStyle(bodyColor, 1);
      gfx.fillTriangle(cx, cy - 32 * S, cx - 5 * S, cy - 21 * S, cx + 5 * S, cy - 21 * S);
      gfx.fillStyle(0xffdd44, 0.9);
      gfx.fillCircle(cx, cy - 31 * S, 1.5 * S);
    } else if (ps.playerClass === 'archer') {
      gfx.fillStyle(darken(bodyColor, 0.7), 1);
      gfx.beginPath();
      gfx.arc(cx, cy - 20 * S, 6.5 * S, Math.PI + 0.2, -0.2, false);
      gfx.closePath();
      gfx.fillPath();
    }
  }

  // ── TD reskin: bölge-paletli prosedürel backdrop ──
  // İzo'nun ZONE_ATMOSPHERE+silüet backdrop'unun yerini alır. data.region yoksa 'forest'.
  // Faz 5.3 detay katmanları: sis bantları + çift silüet (uzak tepe/yakın sırt) + biyom
  // dekoru (çam/kristal/sütun/diken/kıymık) + dövüşçü ışık hüzmeleri + süzülen mote'lar.
  private drawTdBackdrop(w: number, h: number): void {
    const atmo = atmoForRegion(this.region);
    const biome = REGION_TO_BIOME[this.region] ?? 'forest';
    const topColor = Phaser.Display.Color.HexStringToColor(biomeTopColor(biome)).color;
    const horizon = h * 0.62;
    const g = this.add.graphics().setDepth(-10);

    // ── Gökyüzü gradyanı: bölge zemin rengi (üst) → atmo fog rengi (ufuk) ──
    g.fillGradientStyle(topColor, topColor, atmo.fogColor, atmo.fogColor, 0.5, 0.5, 0.9, 0.9);
    g.fillRect(0, 0, w, horizon);

    // ── Sis bantları (yatay haze) ──
    for (let i = 0; i < 4; i++) {
      g.fillStyle(atmo.fogColor, 0.06 + (i % 2) * 0.03);
      g.fillRect(0, horizon * 0.3 + i * horizon * 0.15 + ((i * 29) % 14), w, 8 + ((i * 13) % 12));
    }

    // ── Uzak silüet: yumuşak tepeler (düşük alpha) ──
    g.fillStyle(atmo.fogColor, 0.3);
    for (let i = 0; i < 9; i++) {
      const bx = (i / 9) * w + ((i * 61) % 40) - 20;
      const bw = w / 6 + ((i * 37) % 70);
      const bh = horizon * 0.10 + ((i * 23) % 26);
      g.fillEllipse(bx + bw / 2, horizon - 4, bw, bh * 2);
    }

    // ── Yakın silüet: sırtlar (mevcut üçgen dili) ──
    g.fillStyle(atmo.fogColor, 0.55);
    for (let i = 0; i < 7; i++) {
      const bx = (i / 7) * w + ((i * 97) % 60) - 30;
      const bw = w / 6 + ((i * 53) % 50);
      const bh = horizon * 0.22 + ((i * 31) % 45);
      g.fillTriangle(bx, horizon, bx + bw / 2, horizon - bh * 1.3, bx + bw, horizon);
    }
    this.drawBiomeDeco(g, w, horizon, atmo.fogColor);

    // ── Zemin: atmo fog → siyaha gradyan ──
    g.fillGradientStyle(atmo.fogColor, atmo.fogColor, 0x0a0e1a, 0x0a0e1a, 0.7, 0.7, 0.95, 0.95);
    g.fillRect(0, horizon, w, h - horizon);

    // ── Dövüşçü arkalarına soluk ışık hüzmeleri ──
    const shaft = this.add.graphics().setDepth(-9);
    for (const x of [w * 0.25, w * 0.75]) {
      shaft.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.055, 0.055, 0, 0);
      shaft.fillRect(x - 78, h * 0.05, 156, h * 0.4);
      shaft.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.035, 0.035, 0, 0);
      shaft.fillRect(x - 110, h * 0.05, 220, h * 0.34);
    }

    // ── Vinyet (kenar koyulaştırma) ──
    const vg = this.add.graphics().setDepth(-9);
    vg.fillStyle(0x000000, atmo.tintAlpha * 2.2);
    vg.fillRect(0, 0, w, h * 0.08);
    vg.fillRect(0, h - h * 0.1, w, h * 0.1);
    vg.fillStyle(0x000000, atmo.tintAlpha * 1.6);
    vg.fillRect(0, 0, w * 0.06, h);
    vg.fillRect(w - w * 0.06, 0, w * 0.06, h);

    this.spawnAmbientMotes(w, h, atmo.tint);
  }

  /** Faz 5.3: ufuk çizgisine biyom-imzalı silüet dekoru (deterministik, alpha-katmanlı). */
  private drawBiomeDeco(g: Phaser.GameObjects.Graphics, w: number, horizon: number, fog: number): void {
    const biome = REGION_TO_BIOME[this.region] ?? 'forest';
    g.fillStyle(fog, 0.7);
    if (['forest', 'grass', 'town', 'swamp'].includes(biome)) {
      for (let i = 0; i < 12; i++) {                   // çam sırası
        const x = (i / 12) * w + ((i * 47) % 46);
        const th = 26 + ((i * 19) % 30);
        g.fillTriangle(x, horizon, x + 11, horizon - th, x + 22, horizon);
        g.fillRect(x + 9, horizon - 4, 4, 4);
      }
    } else if (['frostwastes', 'citadel', 'sanctum', 'eternal'].includes(biome)) {
      for (let i = 0; i < 9; i++) {                    // buz/ışık kristalleri
        const x = (i / 9) * w + ((i * 83) % 60);
        const th = 30 + ((i * 41) % 44);
        g.fillTriangle(x, horizon, x + 6, horizon - th, x + 12, horizon);
      }
      g.fillStyle(0xffffff, 0.18);
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * w + ((i * 83) % 60);
        const th = 30 + ((i * 41) % 44);
        g.fillTriangle(x + 4, horizon - th + 8, x + 6, horizon - th, x + 8, horizon - th + 8);
      }
    } else if (['mines', 'crypt', 'ruins', 'necropolis'].includes(biome)) {
      for (let i = 0; i < 8; i++) {                    // kırık sütunlar
        const x = (i / 8) * w + ((i * 73) % 70) + 10;
        const th = 24 + ((i * 29) % 34);
        g.fillRect(x, horizon - th, 12, th);
        g.fillRect(x - 2, horizon - th, 16, 4);
        if (i % 3 !== 0) g.fillRect(x + 2, horizon - th - 6, 8, 6); // kimi sütun kırık
      }
    } else if (['volcano', 'demongate', 'forge', 'abyss', 'voidrealm'].includes(biome)) {
      for (let i = 0; i < 10; i++) {                   // sivri diken kayalar
        const x = (i / 10) * w + ((i * 59) % 56);
        const th = 28 + ((i * 43) % 48);
        g.fillTriangle(x, horizon, x + 7 + ((i * 11) % 6), horizon - th, x + 18, horizon);
      }
      g.fillStyle(this.region === 'abyss' || this.region === 'voidrealm' ? 0x66aaff : 0xff6633, 0.25);
      for (let i = 0; i < 7; i++) {                    // kor/dip parıltı noktaları
        g.fillRect((i / 7) * w + ((i * 101) % 80), horizon - 6 - ((i * 17) % 24), 3, 3);
      }
    }
  }

  /** Faz 5.3: bölge-tonlu süzülen ambient mote'lar (tween loop; deterministik yerleşim). */
  private spawnAmbientMotes(w: number, h: number, tint: number): void {
    for (let i = 0; i < 14; i++) {
      const x = ((i * 173 + 40) % w);
      const y = h * 0.15 + ((i * 97) % Math.floor(h * 0.55));
      const size = 2 + (i % 3);
      const m = this.add.rectangle(x, y, size, size, tint, 0.28).setDepth(-8);
      this.tweens.add({
        targets: m, y: y - 34 - (i % 4) * 8, alpha: 0.05,
        duration: 2600 + i * 217, repeat: -1, yoyo: true, ease: 'Sine.easeInOut',
        delay: i * 130,
      });
    }
  }

  // ── Faz 5.3: detaylı pixel-art kahraman (mkBattleHero) — 2-kare idle nefes, ×4 ──
  private spawnPlayerChibi(cx: number, footY: number, ps: PlayerState): Phaser.GameObjects.Image {
    const bodyColor = { knight: 0x4488cc, mage: 0x9944cc, archer: 0x44aa44 }[ps.playerClass] || 0x4488cc;
    const wid = ps.equipped.weapon?.id || '';
    const weaponTint = wid
      ? (wid.includes('flame') ? 0xff6622 : wid.includes('ice') ? 0x66ddff : wid.includes('shadow') ? 0x9944cc : wid.includes('steel') ? 0xddeeff : 0xaabbcc)
      : undefined;
    const key = `td-bhero-${ps.playerClass}-${ps.skinColor}-${ps.hairColor}-${weaponTint ?? 'x'}`;
    if (!this.textures.exists(`${key}-0`)) {
      const { frames } = mkBattleHero({ cls: ps.playerClass, skin: ps.skinColor, hair: ps.hairColor, body: bodyColor, weaponTint });
      this.textures.addCanvas(`${key}-0`, frames[0]);
      this.textures.addCanvas(`${key}-1`, frames[1]);
    }
    const img = this.add.image(cx, footY, `${key}-0`).setOrigin(0.5, 1).setScale(4).setDepth(10);
    let frame = 0;
    this.playerFlipTimer = this.time.addEvent({
      delay: 600, startAt: 300, loop: true, // canavarla yarım-faz kaymalı — sahne daha canlı
      callback: () => { frame = frame === 0 ? 1 : 0; img.setTexture(frame === 0 ? `${key}-0` : `${key}-1`); },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.playerFlipTimer?.remove());
    return img;
  }

  // ── TD reskin: chibi canavar — mkMonsterChibi(type, big=true) 2-kare Image + 600ms flip ──
  // Faz 5.3: ×3 ölçek (boss ×2.6) — eski doğal boy 720p sahnede ~36px kalıyordu,
  // dövüşçüler arası ölçek dengesi için oyuncu (×4, 144px) ile aynı banda çekildi.
  private spawnMonsterChibi(cx: number, cy: number): Phaser.GameObjects.Image {
    const baseType = this.monster.type.startsWith('elite_') ? this.monster.type.slice(6) : this.monster.type;
    const keyA = `td-bmon-${baseType}-0`;
    const keyB = `td-bmon-${baseType}-1`;
    if (!this.textures.exists(keyA)) {
      const { frames } = mkMonsterChibi(baseType, true);
      this.textures.addCanvas(keyA, frames[0]);
      this.textures.addCanvas(keyB, frames[1]);
    }
    const scale = monsterPlanFor(baseType) === 'boss' ? 2.6 : 3;
    // flipX: beast/serpent planları başı SAĞDA çizer — sağ köşedeki canavar oyuncuya baksın.
    const img = this.add.image(cx, cy, keyA).setOrigin(0.5, 0.96).setScale(scale).setDepth(10).setFlipX(true);
    let frame = 0;
    this.monsterFlipTimer = this.time.addEvent({
      delay: 600, loop: true,
      callback: () => { frame = frame === 0 ? 1 : 0; img.setTexture(frame === 0 ? keyA : keyB); },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.monsterFlipTimer?.remove());
    return img;
  }

  // ── Draw monster (category-based silhouettes) — TD'de KULLANILMIYOR (spawnMonsterChibi'ye taşındı) ──
  private drawMonster(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const S = 2.8;
    const baseType = this.monster.type.startsWith('elite_') ? this.monster.type.slice(6) : this.monster.type;
    const color = MONSTER_COLORS[baseType] || MONSTER_COLORS[this.monster.type] || 0xcc3333;
    const category = MONSTER_CATEGORY[baseType] || MONSTER_CATEGORY[this.monster.type] || 'humanoid';
    const isBoss = category === 'boss';
    const scale = isBoss ? 1.3 : 1.0;

    // Shadow
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillEllipse(cx, cy + 16 * S * scale, 20 * S * scale, 6 * S * scale);

    // Boss aura glow
    if (isBoss) {
      gfx.fillStyle(color, 0.06);
      gfx.fillCircle(cx, cy - 4 * S, 22 * S);
      gfx.fillStyle(color, 0.04);
      gfx.fillCircle(cx, cy - 4 * S, 28 * S);
    }

    switch (category) {
      case 'humanoid':
        this.drawHumanoid(gfx, cx, cy, S, color, scale);
        break;
      case 'beast':
        this.drawBeast(gfx, cx, cy, S, color, scale);
        break;
      case 'dragon':
        this.drawDragon(gfx, cx, cy, S, color, scale);
        break;
      case 'slime':
        this.drawSlime(gfx, cx, cy, S, color, scale);
        break;
      case 'golem':
        this.drawGolem(gfx, cx, cy, S, color, scale);
        break;
      case 'spirit':
        this.drawSpirit(gfx, cx, cy, S, color, scale);
        break;
      case 'insect':
        this.drawInsect(gfx, cx, cy, S, color, scale);
        break;
      case 'demon':
        this.drawDemon(gfx, cx, cy, S, color, scale);
        break;
      case 'boss':
        this.drawBoss(gfx, cx, cy, S, color, scale);
        break;
    }
  }

  // ── Humanoid: upright body, arms, legs, weapon ──
  private drawHumanoid(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Legs
    gfx.fillStyle(darken(color, 0.5), 1);
    gfx.fillRect(cx - 4 * S * sc, cy + 2 * S * sc, 3 * S * sc, 8 * S * sc);
    gfx.fillRect(cx + 1 * S * sc, cy + 2 * S * sc, 3 * S * sc, 8 * S * sc);
    // Boots
    gfx.fillStyle(darken(color, 0.35), 1);
    gfx.fillRect(cx - 5 * S * sc, cy + 9 * S * sc, 4.5 * S * sc, 2 * S * sc);
    gfx.fillRect(cx + 0.5 * S * sc, cy + 9 * S * sc, 4.5 * S * sc, 2 * S * sc);
    // Torso
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(cx - 5.5 * S * sc, cy - 10 * S * sc, 11 * S * sc, 13 * S * sc, 2 * S * sc);
    // Belt
    gfx.fillStyle(darken(color, 0.4), 1);
    gfx.fillRect(cx - 5.5 * S * sc, cy + 1 * S * sc, 11 * S * sc, 2 * S * sc);
    // Arms
    gfx.fillStyle(darken(color, 0.7), 1);
    gfx.fillRoundedRect(cx - 8 * S * sc, cy - 8 * S * sc, 3 * S * sc, 10 * S * sc, S * sc);
    gfx.fillRoundedRect(cx + 5 * S * sc, cy - 8 * S * sc, 3 * S * sc, 10 * S * sc, S * sc);
    // Head
    gfx.fillStyle(darken(color, 0.85), 1);
    gfx.fillCircle(cx, cy - 14 * S * sc, 5 * S * sc);
    // Eyes
    gfx.fillStyle(0xff2222, 1);
    gfx.fillCircle(cx - 2 * S * sc, cy - 15 * S * sc, 1.2 * S * sc);
    gfx.fillCircle(cx + 2 * S * sc, cy - 15 * S * sc, 1.2 * S * sc);
    // Weapon (sword in right hand)
    gfx.fillStyle(0xaabbcc, 1);
    gfx.fillRect(cx + 6 * S * sc, cy - 12 * S * sc, 1.5 * S * sc, -10 * S * sc);
    gfx.fillStyle(0x886644, 1);
    gfx.fillRect(cx + 4.5 * S * sc, cy - 11 * S * sc, 4.5 * S * sc, 1.5 * S * sc);
  }

  // ── Beast: four-legged, pointed ears, tail ──
  private drawBeast(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Body (horizontal oval)
    gfx.fillStyle(color, 1);
    gfx.fillEllipse(cx, cy - 2 * S * sc, 18 * S * sc, 10 * S * sc);
    // Belly
    gfx.fillStyle(darken(color, 0.8), 1);
    gfx.fillEllipse(cx, cy + 1 * S * sc, 14 * S * sc, 5 * S * sc);
    // Front legs
    gfx.fillStyle(darken(color, 0.6), 1);
    gfx.fillRect(cx - 6 * S * sc, cy + 2 * S * sc, 2.5 * S * sc, 8 * S * sc);
    gfx.fillRect(cx - 3 * S * sc, cy + 2 * S * sc, 2.5 * S * sc, 8 * S * sc);
    // Back legs
    gfx.fillRect(cx + 3 * S * sc, cy + 2 * S * sc, 2.5 * S * sc, 8 * S * sc);
    gfx.fillRect(cx + 6 * S * sc, cy + 2 * S * sc, 2.5 * S * sc, 8 * S * sc);
    // Paws
    gfx.fillStyle(darken(color, 0.4), 1);
    gfx.fillEllipse(cx - 5 * S * sc, cy + 10.5 * S * sc, 4 * S * sc, 2 * S * sc);
    gfx.fillEllipse(cx + 5 * S * sc, cy + 10.5 * S * sc, 4 * S * sc, 2 * S * sc);
    // Head
    gfx.fillStyle(color, 1);
    gfx.fillCircle(cx - 8 * S * sc, cy - 6 * S * sc, 4.5 * S * sc);
    // Snout
    gfx.fillStyle(darken(color, 0.7), 1);
    gfx.fillEllipse(cx - 12 * S * sc, cy - 5 * S * sc, 4 * S * sc, 3 * S * sc);
    // Ears (pointed)
    gfx.fillStyle(darken(color, 0.6), 1);
    gfx.fillTriangle(
      cx - 10 * S * sc, cy - 9 * S * sc,
      cx - 11 * S * sc, cy - 15 * S * sc,
      cx - 8 * S * sc, cy - 9 * S * sc
    );
    gfx.fillTriangle(
      cx - 7 * S * sc, cy - 9 * S * sc,
      cx - 7 * S * sc, cy - 14 * S * sc,
      cx - 5 * S * sc, cy - 9 * S * sc
    );
    // Eyes
    gfx.fillStyle(0xffff44, 1);
    gfx.fillCircle(cx - 9 * S * sc, cy - 7 * S * sc, 1.2 * S * sc);
    gfx.fillCircle(cx - 6.5 * S * sc, cy - 7 * S * sc, 1.2 * S * sc);
    // Tail
    gfx.lineStyle(2.5 * S * sc, darken(color, 0.65), 1);
    gfx.beginPath();
    gfx.arc(cx + 12 * S * sc, cy - 6 * S * sc, 5 * S * sc, Math.PI * 0.5, Math.PI * 1.5, false);
    gfx.strokePath();
  }

  // ── Dragon: wings, long neck, tail, horns ──
  private drawDragon(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Tail
    gfx.lineStyle(3 * S * sc, darken(color, 0.55), 1);
    gfx.beginPath();
    gfx.arc(cx + 10 * S * sc, cy + 2 * S * sc, 8 * S * sc, Math.PI * 0.8, Math.PI * 1.8, false);
    gfx.strokePath();
    // Tail spike
    gfx.fillStyle(darken(color, 0.4), 1);
    gfx.fillTriangle(
      cx + 17 * S * sc, cy - 3 * S * sc,
      cx + 20 * S * sc, cy - 6 * S * sc,
      cx + 18 * S * sc, cy + 0 * S * sc
    );
    // Body
    gfx.fillStyle(color, 1);
    gfx.fillEllipse(cx, cy, 14 * S * sc, 12 * S * sc);
    // Belly
    gfx.fillStyle(darken(color, 0.8), 1);
    gfx.fillEllipse(cx, cy + 2 * S * sc, 10 * S * sc, 7 * S * sc);
    // Wings (left)
    gfx.fillStyle(darken(color, 0.6), 0.8);
    gfx.fillTriangle(
      cx - 3 * S * sc, cy - 5 * S * sc,
      cx - 18 * S * sc, cy - 22 * S * sc,
      cx - 14 * S * sc, cy + 2 * S * sc
    );
    gfx.fillTriangle(
      cx - 14 * S * sc, cy + 2 * S * sc,
      cx - 18 * S * sc, cy - 22 * S * sc,
      cx - 22 * S * sc, cy - 5 * S * sc
    );
    // Wings (right)
    gfx.fillTriangle(
      cx + 3 * S * sc, cy - 5 * S * sc,
      cx + 18 * S * sc, cy - 22 * S * sc,
      cx + 14 * S * sc, cy + 2 * S * sc
    );
    gfx.fillTriangle(
      cx + 14 * S * sc, cy + 2 * S * sc,
      cx + 18 * S * sc, cy - 22 * S * sc,
      cx + 22 * S * sc, cy - 5 * S * sc
    );
    // Wing membrane lines
    gfx.lineStyle(1 * S * sc, darken(color, 0.45), 0.5);
    gfx.lineBetween(cx - 5 * S * sc, cy - 3 * S * sc, cx - 17 * S * sc, cy - 18 * S * sc);
    gfx.lineBetween(cx + 5 * S * sc, cy - 3 * S * sc, cx + 17 * S * sc, cy - 18 * S * sc);
    // Neck
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(cx - 2.5 * S * sc, cy - 12 * S * sc, 5 * S * sc, 8 * S * sc, 2 * S * sc);
    // Head
    gfx.fillCircle(cx, cy - 15 * S * sc, 4.5 * S * sc);
    // Horns
    gfx.fillStyle(darken(color, 0.4), 1);
    gfx.fillTriangle(
      cx - 3 * S * sc, cy - 18 * S * sc,
      cx - 5 * S * sc, cy - 24 * S * sc,
      cx - 1 * S * sc, cy - 18 * S * sc
    );
    gfx.fillTriangle(
      cx + 3 * S * sc, cy - 18 * S * sc,
      cx + 5 * S * sc, cy - 24 * S * sc,
      cx + 1 * S * sc, cy - 18 * S * sc
    );
    // Eyes
    gfx.fillStyle(0xff4422, 1);
    gfx.fillCircle(cx - 2 * S * sc, cy - 16 * S * sc, 1.5 * S * sc);
    gfx.fillCircle(cx + 2 * S * sc, cy - 16 * S * sc, 1.5 * S * sc);
    gfx.fillStyle(0xffff44, 1);
    gfx.fillCircle(cx - 2 * S * sc, cy - 16 * S * sc, 0.7 * S * sc);
    gfx.fillCircle(cx + 2 * S * sc, cy - 16 * S * sc, 0.7 * S * sc);
    // Legs
    gfx.fillStyle(darken(color, 0.55), 1);
    gfx.fillRect(cx - 5 * S * sc, cy + 4 * S * sc, 3 * S * sc, 6 * S * sc);
    gfx.fillRect(cx + 2 * S * sc, cy + 4 * S * sc, 3 * S * sc, 6 * S * sc);
    // Claws
    gfx.fillStyle(darken(color, 0.3), 1);
    for (let i = 0; i < 3; i++) {
      gfx.fillTriangle(
        cx - 5 * S * sc + i * 1.5 * S * sc, cy + 10 * S * sc,
        cx - 5.5 * S * sc + i * 1.5 * S * sc, cy + 12 * S * sc,
        cx - 4 * S * sc + i * 1.5 * S * sc, cy + 10 * S * sc
      );
    }
  }

  // ── Slime: blobby, bouncy, dripping ──
  private drawSlime(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Main blob body
    gfx.fillStyle(color, 0.85);
    gfx.fillEllipse(cx, cy + 2 * S * sc, 16 * S * sc, 12 * S * sc);
    // Top dome
    gfx.fillStyle(color, 0.9);
    gfx.fillEllipse(cx, cy - 4 * S * sc, 12 * S * sc, 10 * S * sc);
    // Highlight / shine
    gfx.fillStyle(0xffffff, 0.25);
    gfx.fillEllipse(cx - 2 * S * sc, cy - 7 * S * sc, 4 * S * sc, 3 * S * sc);
    // Darker underside
    gfx.fillStyle(darken(color, 0.6), 0.6);
    gfx.fillEllipse(cx, cy + 5 * S * sc, 14 * S * sc, 6 * S * sc);
    // Drips
    gfx.fillStyle(color, 0.7);
    gfx.fillEllipse(cx - 5 * S * sc, cy + 9 * S * sc, 3 * S * sc, 4 * S * sc);
    gfx.fillEllipse(cx + 4 * S * sc, cy + 10 * S * sc, 2.5 * S * sc, 3.5 * S * sc);
    gfx.fillEllipse(cx + 7 * S * sc, cy + 8 * S * sc, 2 * S * sc, 3 * S * sc);
    // Eyes (big, cute)
    gfx.fillStyle(0xffffff, 0.9);
    gfx.fillCircle(cx - 3 * S * sc, cy - 4 * S * sc, 3 * S * sc);
    gfx.fillCircle(cx + 3 * S * sc, cy - 4 * S * sc, 3 * S * sc);
    gfx.fillStyle(0x111111, 1);
    gfx.fillCircle(cx - 2.5 * S * sc, cy - 3.5 * S * sc, 1.5 * S * sc);
    gfx.fillCircle(cx + 3.5 * S * sc, cy - 3.5 * S * sc, 1.5 * S * sc);
    // Mouth
    gfx.lineStyle(1.5 * S * sc, darken(color, 0.4), 0.8);
    gfx.beginPath();
    gfx.arc(cx, cy + 1 * S * sc, 3 * S * sc, 0.2, Math.PI - 0.2, false);
    gfx.strokePath();
  }

  // ── Golem: blocky, angular, heavy ──
  private drawGolem(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Legs (thick blocks)
    gfx.fillStyle(darken(color, 0.5), 1);
    gfx.fillRect(cx - 6 * S * sc, cy + 2 * S * sc, 5 * S * sc, 9 * S * sc);
    gfx.fillRect(cx + 1 * S * sc, cy + 2 * S * sc, 5 * S * sc, 9 * S * sc);
    // Torso (large blocky)
    gfx.fillStyle(color, 1);
    gfx.fillRect(cx - 7 * S * sc, cy - 10 * S * sc, 14 * S * sc, 14 * S * sc);
    // Chest crack lines
    gfx.lineStyle(1 * S * sc, darken(color, 0.3), 0.5);
    gfx.lineBetween(cx - 2 * S * sc, cy - 8 * S * sc, cx + 1 * S * sc, cy - 2 * S * sc);
    gfx.lineBetween(cx + 3 * S * sc, cy - 7 * S * sc, cx + 1 * S * sc, cy - 2 * S * sc);
    // Inner glow (crystal/lava core)
    gfx.fillStyle(0xffffff, 0.15);
    gfx.fillRect(cx - 2 * S * sc, cy - 5 * S * sc, 4 * S * sc, 4 * S * sc);
    // Shoulders (angular)
    gfx.fillStyle(darken(color, 0.7), 1);
    gfx.fillRect(cx - 10 * S * sc, cy - 10 * S * sc, 4 * S * sc, 6 * S * sc);
    gfx.fillRect(cx + 6 * S * sc, cy - 10 * S * sc, 4 * S * sc, 6 * S * sc);
    // Arms (thick blocks)
    gfx.fillStyle(darken(color, 0.6), 1);
    gfx.fillRect(cx - 10 * S * sc, cy - 4 * S * sc, 3.5 * S * sc, 10 * S * sc);
    gfx.fillRect(cx + 6.5 * S * sc, cy - 4 * S * sc, 3.5 * S * sc, 10 * S * sc);
    // Fists
    gfx.fillStyle(darken(color, 0.45), 1);
    gfx.fillRect(cx - 11 * S * sc, cy + 5 * S * sc, 5 * S * sc, 4 * S * sc);
    gfx.fillRect(cx + 6 * S * sc, cy + 5 * S * sc, 5 * S * sc, 4 * S * sc);
    // Head (smaller block on top)
    gfx.fillStyle(color, 1);
    gfx.fillRect(cx - 4 * S * sc, cy - 17 * S * sc, 8 * S * sc, 8 * S * sc);
    // Eyes (glowing slits)
    gfx.fillStyle(0xff6622, 0.9);
    gfx.fillRect(cx - 3 * S * sc, cy - 14 * S * sc, 2.5 * S * sc, 1.5 * S * sc);
    gfx.fillRect(cx + 0.5 * S * sc, cy - 14 * S * sc, 2.5 * S * sc, 1.5 * S * sc);
  }

  // ── Spirit: wispy, transparent, floating ──
  private drawSpirit(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Wispy tail (multiple fading circles going down)
    gfx.fillStyle(color, 0.15);
    gfx.fillEllipse(cx, cy + 8 * S * sc, 8 * S * sc, 6 * S * sc);
    gfx.fillStyle(color, 0.1);
    gfx.fillEllipse(cx - 2 * S * sc, cy + 12 * S * sc, 5 * S * sc, 4 * S * sc);
    gfx.fillEllipse(cx + 3 * S * sc, cy + 11 * S * sc, 4 * S * sc, 3 * S * sc);
    // Wispy tendrils
    gfx.fillStyle(color, 0.08);
    gfx.fillEllipse(cx - 4 * S * sc, cy + 14 * S * sc, 3 * S * sc, 5 * S * sc);
    gfx.fillEllipse(cx + 2 * S * sc, cy + 15 * S * sc, 2.5 * S * sc, 4 * S * sc);
    gfx.fillEllipse(cx + 5 * S * sc, cy + 13 * S * sc, 2 * S * sc, 4 * S * sc);
    // Main body (transparent orb)
    gfx.fillStyle(color, 0.35);
    gfx.fillCircle(cx, cy - 2 * S * sc, 8 * S * sc);
    // Inner glow
    gfx.fillStyle(color, 0.5);
    gfx.fillCircle(cx, cy - 3 * S * sc, 5 * S * sc);
    // Core bright spot
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(cx - 1 * S * sc, cy - 5 * S * sc, 2.5 * S * sc);
    // Eyes (ethereal)
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillCircle(cx - 2.5 * S * sc, cy - 4 * S * sc, 2 * S * sc);
    gfx.fillCircle(cx + 2.5 * S * sc, cy - 4 * S * sc, 2 * S * sc);
    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(cx - 2.5 * S * sc, cy - 4 * S * sc, 1 * S * sc);
    gfx.fillCircle(cx + 2.5 * S * sc, cy - 4 * S * sc, 1 * S * sc);
    // Outer wispy aura
    gfx.lineStyle(1.5 * S * sc, color, 0.15);
    gfx.strokeCircle(cx, cy - 2 * S * sc, 10 * S * sc);
    gfx.lineStyle(1 * S * sc, color, 0.08);
    gfx.strokeCircle(cx, cy - 2 * S * sc, 13 * S * sc);
  }

  // ── Insect: multiple legs/wings, small eyes ──
  private drawInsect(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Abdomen (back section)
    gfx.fillStyle(darken(color, 0.7), 1);
    gfx.fillEllipse(cx + 4 * S * sc, cy + 2 * S * sc, 10 * S * sc, 8 * S * sc);
    // Thorax (middle section)
    gfx.fillStyle(color, 1);
    gfx.fillEllipse(cx - 2 * S * sc, cy, 8 * S * sc, 7 * S * sc);
    // Head
    gfx.fillStyle(darken(color, 0.8), 1);
    gfx.fillCircle(cx - 7 * S * sc, cy - 1 * S * sc, 4 * S * sc);
    // Multiple eyes (cluster)
    gfx.fillStyle(0xff2222, 0.9);
    gfx.fillCircle(cx - 9 * S * sc, cy - 2.5 * S * sc, 1.2 * S * sc);
    gfx.fillCircle(cx - 7.5 * S * sc, cy - 3.5 * S * sc, 1 * S * sc);
    gfx.fillCircle(cx - 6 * S * sc, cy - 2.5 * S * sc, 1.2 * S * sc);
    gfx.fillStyle(0xff4444, 0.7);
    gfx.fillCircle(cx - 8.5 * S * sc, cy - 0.5 * S * sc, 0.8 * S * sc);
    gfx.fillCircle(cx - 6 * S * sc, cy - 0.5 * S * sc, 0.8 * S * sc);
    // Mandibles
    gfx.fillStyle(darken(color, 0.3), 1);
    gfx.fillTriangle(
      cx - 10 * S * sc, cy + 1 * S * sc,
      cx - 13 * S * sc, cy + 3 * S * sc,
      cx - 10 * S * sc, cy + 3 * S * sc
    );
    gfx.fillTriangle(
      cx - 10 * S * sc, cy + 1 * S * sc,
      cx - 13 * S * sc, cy - 1 * S * sc,
      cx - 10 * S * sc, cy - 1 * S * sc
    );
    // Legs (6 legs, 3 per side)
    gfx.lineStyle(1.5 * S * sc, darken(color, 0.5), 1);
    for (let i = 0; i < 3; i++) {
      const lx = cx - 4 * S * sc + i * 4 * S * sc;
      // Top legs
      gfx.lineBetween(lx, cy - 3 * S * sc, lx - 3 * S * sc, cy - 8 * S * sc);
      gfx.lineBetween(lx - 3 * S * sc, cy - 8 * S * sc, lx - 5 * S * sc, cy - 5 * S * sc);
      // Bottom legs
      gfx.lineBetween(lx, cy + 3 * S * sc, lx - 3 * S * sc, cy + 8 * S * sc);
      gfx.lineBetween(lx - 3 * S * sc, cy + 8 * S * sc, lx - 5 * S * sc, cy + 10 * S * sc);
    }
    // Stripe pattern on abdomen
    gfx.lineStyle(1 * S * sc, darken(color, 0.45), 0.6);
    for (let i = 0; i < 3; i++) {
      const sx = cx + 2 * S * sc + i * 2.5 * S * sc;
      gfx.lineBetween(sx, cy - 2 * S * sc, sx, cy + 4 * S * sc);
    }
  }

  // ── Demon: horns, wings, muscular, fiery ──
  private drawDemon(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Fire aura
    gfx.fillStyle(0xff4400, 0.06);
    gfx.fillCircle(cx, cy - 4 * S * sc, 16 * S * sc);
    // Legs
    gfx.fillStyle(darken(color, 0.5), 1);
    gfx.fillRect(cx - 5 * S * sc, cy + 2 * S * sc, 4 * S * sc, 9 * S * sc);
    gfx.fillRect(cx + 1 * S * sc, cy + 2 * S * sc, 4 * S * sc, 9 * S * sc);
    // Hooves
    gfx.fillStyle(darken(color, 0.3), 1);
    gfx.fillTriangle(
      cx - 6 * S * sc, cy + 11 * S * sc,
      cx - 1 * S * sc, cy + 11 * S * sc,
      cx - 3.5 * S * sc, cy + 13 * S * sc
    );
    gfx.fillTriangle(
      cx + 0.5 * S * sc, cy + 11 * S * sc,
      cx + 5.5 * S * sc, cy + 11 * S * sc,
      cx + 3 * S * sc, cy + 13 * S * sc
    );
    // Muscular torso
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(cx - 7 * S * sc, cy - 12 * S * sc, 14 * S * sc, 16 * S * sc, 3 * S * sc);
    // Chest definition
    gfx.fillStyle(darken(color, 0.8), 0.4);
    gfx.lineBetween(cx, cy - 10 * S * sc, cx, cy + 0 * S * sc);
    // Arms (thick)
    gfx.fillStyle(darken(color, 0.65), 1);
    gfx.fillRoundedRect(cx - 10 * S * sc, cy - 10 * S * sc, 3.5 * S * sc, 12 * S * sc, S * sc);
    gfx.fillRoundedRect(cx + 6.5 * S * sc, cy - 10 * S * sc, 3.5 * S * sc, 12 * S * sc, S * sc);
    // Small bat wings
    gfx.fillStyle(darken(color, 0.4), 0.7);
    gfx.fillTriangle(
      cx - 7 * S * sc, cy - 8 * S * sc,
      cx - 16 * S * sc, cy - 18 * S * sc,
      cx - 12 * S * sc, cy - 2 * S * sc
    );
    gfx.fillTriangle(
      cx + 7 * S * sc, cy - 8 * S * sc,
      cx + 16 * S * sc, cy - 18 * S * sc,
      cx + 12 * S * sc, cy - 2 * S * sc
    );
    // Head
    gfx.fillStyle(color, 1);
    gfx.fillCircle(cx, cy - 15 * S * sc, 5 * S * sc);
    // Horns (large, curved)
    gfx.fillStyle(0x332211, 1);
    gfx.fillTriangle(
      cx - 4 * S * sc, cy - 18 * S * sc,
      cx - 8 * S * sc, cy - 26 * S * sc,
      cx - 2 * S * sc, cy - 18 * S * sc
    );
    gfx.fillTriangle(
      cx + 4 * S * sc, cy - 18 * S * sc,
      cx + 8 * S * sc, cy - 26 * S * sc,
      cx + 2 * S * sc, cy - 18 * S * sc
    );
    // Eyes (fiery)
    gfx.fillStyle(0xff4400, 1);
    gfx.fillCircle(cx - 2.5 * S * sc, cy - 16 * S * sc, 1.8 * S * sc);
    gfx.fillCircle(cx + 2.5 * S * sc, cy - 16 * S * sc, 1.8 * S * sc);
    gfx.fillStyle(0xffff00, 1);
    gfx.fillCircle(cx - 2.5 * S * sc, cy - 16 * S * sc, 0.8 * S * sc);
    gfx.fillCircle(cx + 2.5 * S * sc, cy - 16 * S * sc, 0.8 * S * sc);
    // Mouth (jagged teeth)
    gfx.fillStyle(0x220000, 0.8);
    gfx.fillRoundedRect(cx - 3 * S * sc, cy - 13 * S * sc, 6 * S * sc, 2 * S * sc, S * sc * 0.5);
    gfx.fillStyle(0xeeeeee, 1);
    for (let i = -2; i <= 2; i++) {
      gfx.fillTriangle(
        cx + i * 1.5 * S * sc, cy - 13 * S * sc,
        cx + i * 1.5 * S * sc - 0.5 * S * sc, cy - 11.5 * S * sc,
        cx + i * 1.5 * S * sc + 0.5 * S * sc, cy - 11.5 * S * sc
      );
    }
  }

  // ── Boss: extra large, crown/aura, intimidating (uses dragon base + extras) ──
  private drawBoss(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    // Draw a large dragon-like body as base
    this.drawDragon(gfx, cx, cy, S, color, sc);

    // Crown / spiky crest on top
    gfx.fillStyle(0xffcc22, 0.9);
    const crownY = cy - 20 * S * sc;
    for (let i = -2; i <= 2; i++) {
      gfx.fillTriangle(
        cx + i * 3 * S * sc, crownY,
        cx + i * 3 * S * sc - 1.5 * S * sc, crownY + 3 * S * sc,
        cx + i * 3 * S * sc + 1.5 * S * sc, crownY + 3 * S * sc
      );
    }
    // Crown band
    gfx.fillStyle(0xffcc22, 0.8);
    gfx.fillRect(cx - 8 * S * sc, crownY + 2 * S * sc, 16 * S * sc, 2 * S * sc);
    // Jewel
    gfx.fillStyle(0xff2244, 0.9);
    gfx.fillCircle(cx, crownY + 3 * S * sc, 1.5 * S * sc);

    // Pulsing aura ring
    gfx.lineStyle(2 * S * sc, color, 0.12);
    gfx.strokeCircle(cx, cy - 2 * S * sc, 20 * S * sc);
    gfx.lineStyle(1 * S * sc, 0xffffff, 0.06);
    gfx.strokeCircle(cx, cy - 2 * S * sc, 24 * S * sc);

    // ── Boss imza aksanları (tip-bazlı) ──
    this.drawBossSignature(gfx, cx, cy, S, color, sc);
  }

  // Her boss'a kimlik veren 2-3 vurgu. Jenerik ejder+taç tabanın üstüne katmanlanır;
  // eşleşmeyen boss tipi jenerik kalır.
  private drawBossSignature(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, S: number, color: number, sc: number): void {
    const type = this.monster.type.startsWith('elite_') ? this.monster.type.slice(6) : this.monster.type;
    switch (type) {
      case 'titan_forgemaster': {
        // Örs-çekiç silüeti + turuncu damar çizgileri
        gfx.fillStyle(0x33261a, 1);
        gfx.fillRect(cx + 8 * S * sc, cy - 2 * S * sc, 10 * S * sc, 3 * S * sc); // örs gövdesi
        gfx.fillRect(cx + 11 * S * sc, cy + 1 * S * sc, 4 * S * sc, 4 * S * sc); // örs ayağı
        gfx.fillStyle(0x4a3524, 1);
        gfx.fillRect(cx + 12 * S * sc, cy - 10 * S * sc, 2 * S * sc, 8 * S * sc); // çekiç sapı
        gfx.fillRect(cx + 9 * S * sc, cy - 12 * S * sc, 8 * S * sc, 3 * S * sc); // çekiç başı
        gfx.lineStyle(1.2 * S * sc, 0xff7722, 0.85); // turuncu ergimiş damarlar
        gfx.lineBetween(cx - 5 * S * sc, cy - 6 * S * sc, cx - 2 * S * sc, cy + 2 * S * sc);
        gfx.lineBetween(cx + 1 * S * sc, cy - 4 * S * sc, cx + 4 * S * sc, cy + 4 * S * sc);
        break;
      }
      case 'void_sovereign':
      case 'abyssal_overlord': {
        // Etrafında dönen 3 mor parça (orbit deseni)
        const orbitColor = type === 'void_sovereign' ? 0x9b3cff : 0x3c7bff;
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const ox = cx + Math.cos(ang) * 22 * S * sc;
          const oy = cy - 4 * S * sc + Math.sin(ang) * 12 * S * sc;
          gfx.fillStyle(orbitColor, 0.9);
          gfx.fillTriangle(ox, oy - 2.5 * S * sc, ox - 2 * S * sc, oy + 2 * S * sc, ox + 2 * S * sc, oy + 2 * S * sc);
          gfx.fillStyle(0xffffff, 0.4);
          gfx.fillCircle(ox, oy, 0.9 * S * sc);
        }
        break;
      }
      case 'lich_king': {
        // Soluk taç yerine buz-mor iskelet halesi + göz alevi
        gfx.fillStyle(0x66ffcc, 0.9);
        gfx.fillCircle(cx - 2 * S * sc, cy - 16 * S * sc, 1.6 * S * sc);
        gfx.fillCircle(cx + 2 * S * sc, cy - 16 * S * sc, 1.6 * S * sc);
        gfx.lineStyle(1.5 * S * sc, 0x88ffdd, 0.5);
        gfx.strokeCircle(cx, cy - 2 * S * sc, 27 * S * sc); // hayaletsi hale
        break;
      }
      case 'frost_emperor':
      case 'boss_frost':
      case 'boss_frost_v2': {
        // Buz kristal dikenleri (omuzlarda) + soğuk göz parıltısı
        const spikeColor = type === 'boss_frost_v2' ? 0xff88aa : 0xaadfff;
        gfx.fillStyle(spikeColor, 0.9);
        for (const dir of [-1, 1]) {
          gfx.fillTriangle(
            cx + dir * 7 * S * sc, cy - 8 * S * sc,
            cx + dir * 10 * S * sc, cy - 18 * S * sc,
            cx + dir * 4 * S * sc, cy - 8 * S * sc,
          );
        }
        gfx.fillStyle(0xffffff, 0.8);
        gfx.fillCircle(cx - 2 * S * sc, cy - 16 * S * sc, 1.2 * S * sc);
        gfx.fillCircle(cx + 2 * S * sc, cy - 16 * S * sc, 1.2 * S * sc);
        break;
      }
      case 'storm_titan':
      case 'sky_sentinel': {
        // Şimşek çentikleri + sarı göz kıvılcımı
        gfx.lineStyle(1.6 * S * sc, 0xffee44, 0.9);
        gfx.beginPath();
        gfx.moveTo(cx - 14 * S * sc, cy - 20 * S * sc);
        gfx.lineTo(cx - 10 * S * sc, cy - 12 * S * sc);
        gfx.lineTo(cx - 13 * S * sc, cy - 11 * S * sc);
        gfx.lineTo(cx - 8 * S * sc, cy - 2 * S * sc);
        gfx.strokePath();
        gfx.fillStyle(0xffff88, 0.9);
        gfx.fillCircle(cx - 2 * S * sc, cy - 16 * S * sc, 1.3 * S * sc);
        gfx.fillCircle(cx + 2 * S * sc, cy - 16 * S * sc, 1.3 * S * sc);
        break;
      }
      case 'abyssal_leviathan':
      case 'abyssal_terror': {
        // Deniz dokunaçları (alt gövdeden kıvrılan) + biyolüminesan noktalar
        gfx.lineStyle(2.5 * S * sc, darken(color, 0.7), 0.9);
        for (const dir of [-1, 1]) {
          gfx.beginPath();
          gfx.arc(cx + dir * 8 * S * sc, cy + 8 * S * sc, 6 * S * sc, 0, Math.PI, dir < 0);
          gfx.strokePath();
        }
        gfx.fillStyle(0x44ffee, 0.85);
        gfx.fillCircle(cx - 6 * S * sc, cy + 2 * S * sc, 0.9 * S * sc);
        gfx.fillCircle(cx + 6 * S * sc, cy + 4 * S * sc, 0.9 * S * sc);
        gfx.fillCircle(cx, cy - 6 * S * sc, 0.9 * S * sc);
        break;
      }
      case 'ancient_guardian': {
        // Taş kalkan + kadim rün parıltısı
        gfx.fillStyle(darken(color, 0.5), 1);
        gfx.fillRoundedRect(cx - 20 * S * sc, cy - 6 * S * sc, 6 * S * sc, 12 * S * sc, 2 * S * sc);
        gfx.lineStyle(1 * S * sc, 0x66ddff, 0.8);
        gfx.strokeCircle(cx - 17 * S * sc, cy, 2 * S * sc); // rün
        break;
      }
      case 'swamp_hag': {
        // Yeşil pençe + kaynayan kazan buharı (nokta bulut)
        gfx.fillStyle(0x88cc44, 0.8);
        for (let i = 0; i < 5; i++) {
          gfx.fillCircle(cx + (i - 2) * 3 * S * sc, cy - 22 * S * sc - (i % 2) * 2 * S * sc, 1.4 * S * sc);
        }
        break;
      }
    }
  }

  // ── Buttons ──
  private createButtons(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const isMobileView = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.innerWidth < 768);
    const btnH = isMobileView ? 52 : 48; // minimum 52px touch target on mobile
    const btnY = H * 0.92;
    const actions: { label: string; key: string; action: string; color: number; icon: string }[] = [
      { label: 'Attack', key: '1', action: 'attack', color: 0xcc3333, icon: '⚔' },
      { label: 'Defend', key: '2', action: 'defend', color: 0x3366cc, icon: '🛡' },
      { label: 'Skills', key: '3', action: 'skills', color: 0xcc8800, icon: '✦' },
      { label: 'Potion', key: '4', action: 'potion', color: 0x33aa55, icon: '♥' },
    ];
    // Responsive button sizing — fit within canvas width, more gap on mobile
    const maxBtnW = 140;
    const gap = isMobileView ? Math.min(20, W * 0.02) : Math.min(16, W * 0.012);
    const availW = W * 0.92; // 92% of canvas width
    const btnW = Math.min(maxBtnW, (availW - gap * (actions.length - 1)) / actions.length);
    const totalW = actions.length * btnW + (actions.length - 1) * gap;
    const startX = (W - totalW) / 2 + btnW / 2;
    const labelFontSize = isMobileView ? '16px' : '14px';
    const keyFontSize = isMobileView ? '11px' : '10px';

    this.btnGraphics = [];

    actions.forEach((a, i) => {
      const x = startX + i * (btnW + gap);
      const btn = this.add.graphics().setDepth(20);
      btn.fillStyle(a.color, 0.85);
      btn.fillRoundedRect(x - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
      btn.lineStyle(1, 0xffffff, 0.2);
      btn.strokeRoundedRect(x - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);

      this.add.text(x, btnY - 6, `${a.icon} ${a.label}`, {
        fontSize: labelFontSize, color: '#ffffff', fontFamily: TD_FONT, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(21);
      this.add.text(x, btnY + 12, `[${a.key}]`, {
        fontSize: keyFontSize, color: 'rgba(255,255,255,0.5)', fontFamily: TD_FONT,
      }).setOrigin(0.5).setDepth(21);

      const hitArea = this.add.rectangle(x, btnY, btnW, btnH).setAlpha(0.001).setDepth(22)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => this.doAction(a.action));
      hitArea.on('pointerover', () => { btn.clear(); btn.fillStyle(a.color, 1); btn.fillRoundedRect(x - btnW / 2, btnY - btnH / 2, btnW, btnH, 8); btn.lineStyle(1.5, 0xffffff, 0.4); btn.strokeRoundedRect(x - btnW / 2, btnY - btnH / 2, btnW, btnH, 8); });
      hitArea.on('pointerout', () => { btn.clear(); btn.fillStyle(a.color, 0.85); btn.fillRoundedRect(x - btnW / 2, btnY - btnH / 2, btnW, btnH, 8); btn.lineStyle(1, 0xffffff, 0.2); btn.strokeRoundedRect(x - btnW / 2, btnY - btnH / 2, btnW, btnH, 8); });

      this.btnGraphics.push({ gfx: btn, hitArea, color: a.color, x, btnW, btnY, btnH });
    });

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ONE', () => this.doAction('attack'));
      this.input.keyboard.on('keydown-TWO', () => this.doAction('defend'));
      this.input.keyboard.on('keydown-THREE', () => this.doAction('skills'));
      this.input.keyboard.on('keydown-FOUR', () => this.doAction('potion'));
    }
  }

  private setButtonsEnabled(enabled: boolean): void {
    for (const b of this.btnGraphics) {
      b.hitArea.setVisible(enabled);
      const alpha = enabled ? 0.85 : 0.35;
      b.gfx.clear();
      b.gfx.fillStyle(b.color, alpha);
      b.gfx.fillRoundedRect(b.x - b.btnW / 2, b.btnY - b.btnH / 2, b.btnW, b.btnH, 8);
    }
  }

  // ── Skill submenu ──
  private showSkillMenu(): void {
    if (this.skillMenuContainer) { this.closeSkillMenu(); return; }

    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    this.skillMenuContainer = this.add.container(0, 0).setDepth(30);

    // Backdrop
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.3);
    backdrop.setInteractive();
    backdrop.on('pointerdown', () => this.closeSkillMenu());
    this.skillMenuContainer.add(backdrop);

    const panelW = 500;
    const panelH = 180;
    const panelX = (W - panelW) / 2;
    const panelY = H * 0.42;

    const pg = this.add.graphics();
    pg.fillStyle(0x0f1420, 0.95);
    pg.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    pg.lineStyle(1, 0x334466, 0.6);
    pg.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    this.skillMenuContainer.add(pg);

    const title = this.add.text(W / 2, panelY + 16, 'SKILLS', {
      fontSize: '14px', color: '#cc8800', fontFamily: TD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.skillMenuContainer.add(title);

    const mpInfo = this.add.text(W / 2, panelY + 34, `MP: ${this.playerMp}/${this.playerMaxMp}`, {
      fontSize: '11px', color: '#6688cc', fontFamily: TD_FONT,
    }).setOrigin(0.5);
    this.skillMenuContainer.add(mpInfo);

    this.skills.forEach((skill, i) => {
      const sx = panelX + 20 + (i % 2) * (panelW / 2);
      const sy = panelY + 55 + Math.floor(i / 2) * 55;
      const canUse = this.playerMp >= skill.mpCost;

      const sbg = this.add.graphics();
      sbg.fillStyle(canUse ? 0x1a2840 : 0x111111, 0.9);
      sbg.fillRoundedRect(sx, sy, panelW / 2 - 30, 45, 6);
      if (canUse) {
        sbg.lineStyle(1, 0x334466, 0.5);
        sbg.strokeRoundedRect(sx, sy, panelW / 2 - 30, 45, 6);
      }
      this.skillMenuContainer!.add(sbg);

      const nameColor = canUse ? '#ffffff' : '#555555';
      const costColor = skill.mpCost === 0 ? '#44aa44' : canUse ? '#6688cc' : '#553333';
      const sName = this.add.text(sx + 8, sy + 8, `${skill.icon} ${skill.name}`, {
        fontSize: '12px', color: nameColor, fontFamily: TD_FONT, fontStyle: 'bold',
      });
      const sDesc = this.add.text(sx + 8, sy + 26, `${skill.description}  [${skill.mpCost} MP]`, {
        fontSize: '9px', color: costColor, fontFamily: TD_FONT,
      });
      this.skillMenuContainer!.add(sName);
      this.skillMenuContainer!.add(sDesc);

      if (canUse) {
        const sHit = this.add.rectangle(sx + (panelW / 2 - 30) / 2, sy + 22, panelW / 2 - 30, 45)
          .setAlpha(0.001).setInteractive({ useHandCursor: true });
        sHit.on('pointerdown', () => { this.closeSkillMenu(); this.useSkill(skill); });
        sHit.on('pointerover', () => { sbg.clear(); sbg.fillStyle(0x223355, 1); sbg.fillRoundedRect(sx, sy, panelW / 2 - 30, 45, 6); });
        sHit.on('pointerout', () => { sbg.clear(); sbg.fillStyle(0x1a2840, 0.9); sbg.fillRoundedRect(sx, sy, panelW / 2 - 30, 45, 6); });
        this.skillMenuContainer!.add(sHit);
      }
    });
  }

  private closeSkillMenu(): void {
    if (this.skillMenuContainer) {
      this.skillMenuContainer.destroy(true);
      this.skillMenuContainer = null;
    }
  }

  // ── Player action ──
  private doAction(action: string): void {
    if (this.turn !== 'player' || this.battleOver || this.busy) return;

    if (action === 'skills') {
      this.showSkillMenu();
      return;
    }

    this.busy = true;
    this.closeSkillMenu();
    const state = PlayerState.get();

    switch (action) {
      case 'attack': {
        // Use first skill (basic attack, 0 MP)
        this.useSkill(this.skills[0]);
        return;
      }
      case 'defend':
        this.defending = true;
        this.showBuff(this.playerBaseX, this.stageY - 40, '🛡 DEF x2');
        this.sfx('metal-click');
        this.log('You brace for impact. Defense doubled this turn!');
        this.time.delayedCall(400, () => this.endPlayerTurn());
        break;
      case 'potion': {
        // Try HP potion first, then MP potion
        const hpPotion = state.inventory.find(i => i.id === 'potion_hp' || i.id === 'potion_hp_large');
        const mpPotion = state.inventory.find(i => i.id === 'potion_mp');
        if (hpPotion && hpPotion.count > 0 && this.playerHp < this.playerMaxHp) {
          const heal = hpPotion.stat?.hp || 40;
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal);
          state.removeItem(hpPotion.id);
          this.updatePlayerHp();
          this.showBuff(this.playerBaseX, this.stageY - 40, `+${heal} HP`, '#44dd66');
          this.sfx('coins');
          this.log(`Used ${hpPotion.name}!  +${heal} HP`);
        } else if (mpPotion && mpPotion.count > 0) {
          const restore = mpPotion.stat?.mp || 20;
          this.playerMp = Math.min(this.playerMaxMp, this.playerMp + restore);
          state.removeItem(mpPotion.id);
          this.updatePlayerMp();
          this.showBuff(this.playerBaseX, this.stageY - 40, `+${restore} MP`, '#4488ff');
          this.sfx('coins');
          this.log(`Used ${mpPotion.name}!  +${restore} MP`);
        } else {
          this.log('No potions left!');
          this.busy = false;
          return;
        }
        this.defending = false;
        this.time.delayedCall(400, () => this.endPlayerTurn());
        break;
      }
    }
  }

  // ── Use a skill ──
  private useSkill(skill: Skill): void {
    if (this.playerMp < skill.mpCost) {
      this.log('Not enough MP!');
      this.busy = false;
      return;
    }
    this.busy = true;

    this.playerMp -= skill.mpCost;
    this.updatePlayerMp();
    const state = PlayerState.get();

    // Self-buff skill (no damage)
    if (skill.selfBuff && skill.hits === 0) {
      if (skill.selfBuff.stat === 'def') {
        this.playerDefBuff = skill.selfBuff.amount;
        this.playerDefBuffTurns = skill.selfBuff.turns;
      } else if (skill.selfBuff.stat === 'dodge') {
        this.playerDodgeBuff = skill.selfBuff.amount;
        this.playerDodgeBuffTurns = skill.selfBuff.turns;
      }
      this.showBuff(this.playerBaseX, this.stageY - 40, `${skill.icon} ${skill.name}!`, '#44aaff');
      this.sfx('metal-click');
      this.log(`${skill.name}! Buff active for ${skill.selfBuff.turns} turns.`);
      this.defending = false;
      this.time.delayedCall(400, () => this.endPlayerTurn());
      return;
    }

    // Damage skill — handle multiple hits
    let totalDmg = 0;
    let hitIndex = 0;

    const doHit = () => {
      const atkElement = skill.element || this.playerElement;
      const elemMult = getElementMultiplier(atkElement, this.monsterElement);
      const raw = Math.max(1, Math.floor(state.atk * skill.multiplier) - this.monster.def + Phaser.Math.Between(-3, 3));
      const afterElem = Math.floor(raw * elemMult);

      // Crit check: base 10% + (SPD diff * 2%), max 30%
      const spdDiff = Math.max(0, this.effectivePlayerSpd() - (this.monster.spd || 5));
      const critChance = Math.min(0.30, 0.10 + spdDiff * 0.02);
      const crit = Math.random() < critChance;
      const dmg = crit ? Math.floor(afterElem * 1.75) : afterElem;
      if (crit) this.battleCrits++;

      // Bleed on critical hit (3 turns, 6% maxHP/turn)
      if (crit && hitIndex === 0) {
        this.monsterStatusEffects.push({ type: 'bleed', turns: 3, pctPerTurn: 0.06 });
        this.showBuff(this.monsterBaseX, this.stageY - 80, '🩸 Bleed!', '#cc2222');
      }

      totalDmg += dmg;
      this.monster.hp = Math.max(0, this.monster.hp - dmg);

      this.animateAttack('player', () => {
        this.updateMonsterHp();
        const elemText = getEffectivenessText(elemMult);
        const dmgColor = elemMult > 1 ? '#ffdd00' : elemMult < 1 ? '#888888' : '#ffffff';
        this.showDamage(this.monsterBaseX + Phaser.Math.Between(-20, 20), this.stageY - 30 - hitIndex * 20, dmg, crit, dmgColor);
        this.shakeSprite(this.monsterGfx);
        this.sfx(crit ? 'hit-heavy1' : 'slash1');

        // Skill element visual effect
        const skillElem = skill.element || this.playerElement;
        if (skill.mpCost > 0) {
          this.playSkillEffect(skillElem, this.monsterBaseX, this.stageY, this.playerBaseX);
        }

        // Critical hit enhanced effect
        if (crit) {
          this.playCriticalEffect(this.monsterBaseX, this.stageY);
        }

        // Show element effectiveness
        if (elemText) {
          this.showBuff(this.monsterBaseX, this.stageY + 30, elemText, elemMult > 1 ? '#ffdd00' : '#888888');
        }

        // Apply DOT
        if (skill.dot && hitIndex === 0) {
          this.monsterStatusEffects.push({ type: skill.dot.type as 'burn' | 'poison', turns: skill.dot.turns, pctPerTurn: skill.dot.pctPerTurn });
          this.showBuff(this.monsterBaseX, this.stageY - 60, `${skill.dot.type === 'burn' ? '🔥 Burn!' : '☠️ Poison!'}`, '#ff6644');
        }

        // Stun check
        if (skill.stunChance && Math.random() < skill.stunChance) {
          this.monsterStunned = true;
          this.showBuff(this.monsterBaseX, this.stageY - 75, '💫 Stunned!', '#ffdd00');
        }

        hitIndex++;
        if (hitIndex < skill.hits && this.monster.hp > 0) {
          this.time.delayedCall(250, doHit);
        } else {
          let logMsg = `${skill.name}!  ${totalDmg} damage!`;
          if (crit) logMsg += '  CRITICAL!';
          if (elemText) logMsg += `  ${elemText}`;
          this.log(logMsg);
          this.defending = false;
          this.afterPlayerTurn();
        }
      });
    };

    doHit();
  }

  private endPlayerTurn(): void {
    this.afterPlayerTurn();
  }

  // Player SPD after active slow effects (spdReduction is a % cut). Feeds
  // crit, dodge and double-strike checks so "slow" actually bites.
  private effectivePlayerSpd(): number {
    let spd = this.playerSpd;
    for (const eff of this.playerStatusEffects) {
      if (eff.type === 'slow' && eff.spdReduction) {
        spd = Math.floor(spd * (1 - eff.spdReduction / 100));
      }
    }
    return Math.max(1, spd);
  }

  private afterPlayerTurn(): void {
    // Tick down player buffs here — every player action funnels through this
    // method; the old tick in endPlayerTurn was skipped by the attack/skill
    // path, making "+DEF for 2 turns" effectively permanent while attacking.
    if (this.playerDefBuffTurns > 0) {
      this.playerDefBuffTurns--;
      if (this.playerDefBuffTurns === 0) this.playerDefBuff = 0;
    }
    if (this.playerDodgeBuffTurns > 0) {
      this.playerDodgeBuffTurns--;
      if (this.playerDodgeBuffTurns === 0) this.playerDodgeBuff = 0;
    }
    if (this.monster.hp <= 0) { this.victory(); return; }

    // MP regen
    this.playerMp = Math.min(this.playerMaxMp, this.playerMp + this.playerMpRegen);
    this.updatePlayerMp();

    this.turn = 'enemy';
    this.turnIndicator.setText('— ENEMY TURN —').setColor('#cc4444');
    this.setButtonsEnabled(false);
    this.updateStatusDisplay();

    // Apply DOT on monster
    let dotDelay = 0;
    const dotsToRemove: number[] = [];
    this.monsterStatusEffects.forEach((eff, idx) => {
      if (eff.turns > 0) {
        // DOT effects (burn, poison, bleed)
        if (eff.pctPerTurn > 0) {
          const dotDmg = Math.max(1, Math.floor(this.monster.maxHp * eff.pctPerTurn));
          this.time.delayedCall(dotDelay, () => {
            this.monster.hp = Math.max(0, this.monster.hp - dotDmg);
            this.updateMonsterHp();
            const icons: Record<string, string> = { burn: '🔥', poison: '☠️', bleed: '🩸' };
            const colors: Record<string, string> = { burn: '#ff6622', poison: '#66cc44', bleed: '#cc2222' };
            this.showDamage(this.monsterBaseX, this.stageY - 40, dotDmg, false, colors[eff.type] || '#ff6622');
            this.log(`${icons[eff.type] || '💥'} ${eff.type} deals ${dotDmg}!`);
          });
          dotDelay += 400;
        }
        // Non-DOT effects just tick down
        eff.turns--;
        if (eff.turns <= 0) dotsToRemove.push(idx);
      }
    });
    for (let i = dotsToRemove.length - 1; i >= 0; i--) {
      this.monsterStatusEffects.splice(dotsToRemove[i], 1);
    }

    this.time.delayedCall(700 + dotDelay, () => {
      if (this.monster.hp <= 0) { this.victory(); return; }
      // Double strike: consume the armed extra turn — enemy turn skipped once
      if (this.extraTurnArmed) {
        this.extraTurnArmed = false;
        this.log('⚡ Extra turn! Strike again!');
        this.turn = 'player';
        this.busy = false;
        this.turnIndicator.setText('— EXTRA TURN —').setColor('#ffdd00');
        this.setButtonsEnabled(true);
        this.updateStatusDisplay();
        return;
      }
      if (this.monsterStunned) {
        this.monsterStunned = false;
        this.log(`Enemy is stunned! Skips turn.`);
        this.showBuff(this.monsterBaseX, this.stageY - 40, '💫 Stunned!', '#ffdd00');
        this.time.delayedCall(800, () => this.afterEnemyTurn());
        return;
      }
      this.enemyTurn();
    });
  }

  // ── Enemy turn with AI variety ──
  private enemyTurn(): void {
    if (this.battleOver) return;
    this.enemyTurnCount++;

    const mType = this.monster.type;
    const mHpPct = this.monster.hp / this.monster.maxHp;
    let dmgMult = 1.0;
    let skipTurn = false;
    let specialMsg = '';
    let applyDot: StatusEffect | null = null;

    // ── Monster AI ──
    switch (mType) {
      case 'skeleton':
        // HP < 30% → 40% dodge chance
        if (mHpPct < 0.3 && Math.random() < 0.4) {
          specialMsg = 'Skeleton tries to flee!';
          skipTurn = true;
        }
        break;
      case 'slime':
        // Every 3rd turn: heal 15% HP
        if (this.enemyTurnCount % 3 === 0) {
          const healAmt = Math.floor(this.monster.maxHp * 0.15);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + healAmt);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${healAmt} HP`, '#44dd66');
          specialMsg = `Slime regenerates ${healAmt} HP!`;
          skipTurn = true;
        }
        break;
      case 'bat':
        // 20% dodge chance (high SPD)
        break; // Normal attack but with high SPD on monster
      case 'spider':
        // First turn: Poison Bite
        if (this.enemyTurnCount === 1) {
          applyDot = { type: 'poison', turns: 3, pctPerTurn: 0.05 };
          specialMsg = 'Spider uses Poison Bite!';
        }
        break;
      case 'ghost':
        // Every 4th turn: Curse (slow)
        if (this.enemyTurnCount % 4 === 0) {
          applyDot = { type: 'slow', turns: 2, pctPerTurn: 0, spdReduction: 50 };
          specialMsg = 'Ghost uses Curse!';
          dmgMult = 0.5;
        }
        break;
      case 'demon':
        // Every 3rd turn: Fireball (1.5x + burn)
        if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.5;
          applyDot = { type: 'burn', turns: 3, pctPerTurn: 0.08 };
          specialMsg = 'Demon casts Fireball!';
        }
        break;
      case 'ogre':
        // HP < 50% → Rage (+30% ATK)
        if (mHpPct < 0.5) {
          dmgMult = 1.3;
          specialMsg = 'Ogre rages! Attack powered up!';
        }
        break;
      case 'dragon':
      case 'frost_dragon':
        // Cycle: Frost Breath → attack → attack → Ice Storm
        const cycle = this.enemyTurnCount % 4;
        if (cycle === 1) {
          dmgMult = 1.8;
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Dragon uses Frost Breath!';
        } else if (cycle === 0) {
          dmgMult = 1.5;
          applyDot = { type: 'slow', turns: 2, pctPerTurn: 0, spdReduction: 50 };
          specialMsg = 'Dragon unleashes Ice Storm!';
        }
        break;

      // ── New Monster AI ──
      case 'necromancer':
        // Every 3rd turn: Dark Drain (heal self 10% + damage)
        if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.3;
          const healAmt = Math.floor(this.monster.maxHp * 0.10);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + healAmt);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${healAmt} HP`, '#aa44ff');
          specialMsg = 'Necromancer drains your life force!';
        }
        // Every 5th turn: summon (stun player)
        if (this.enemyTurnCount % 5 === 0) {
          applyDot = { type: 'stun', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Necromancer summons a skeleton to block you!';
          dmgMult = 0.5;
        }
        break;
      case 'mimic':
        // First turn: surprise attack 2x damage
        if (this.enemyTurnCount === 1) {
          dmgMult = 2.0;
          specialMsg = 'Mimic springs open! Surprise attack!';
        }
        // HP < 40%: try to flee (skip turn 30%)
        if (mHpPct < 0.4 && Math.random() < 0.3) {
          specialMsg = 'Mimic tries to close its lid!';
          skipTurn = true;
        }
        break;
      case 'phoenix':
        // Every 3rd turn: flame burst (burn DOT)
        if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.4;
          applyDot = { type: 'burn', turns: 3, pctPerTurn: 0.07 };
          specialMsg = 'Phoenix unleashes Flame Burst!';
        }
        break;
      case 'crystal_golem':
        // Very high DEF, slow but powerful
        // Every 4th turn: Crystal Smash (2x but skip next turn)
        if (this.enemyTurnCount % 4 === 0) {
          dmgMult = 2.0;
          specialMsg = 'Crystal Golem uses Crystal Smash!';
        }
        // HP < 30%: crystallize (boost DEF temporarily)
        if (mHpPct < 0.3 && this.enemyTurnCount % 3 === 0) {
          this.monster.def = Math.floor(this.monster.def * 1.3);
          specialMsg = 'Crystal Golem hardens! DEF increased!';
          skipTurn = true;
        }
        break;
      case 'venomous_hydra':
        // Multi-hit: hits twice at 0.7x each
        if (this.enemyTurnCount % 2 === 0) {
          dmgMult = 0.7;
          applyDot = { type: 'poison', turns: 4, pctPerTurn: 0.06 };
          specialMsg = 'Hydra strikes with both heads! Venomous bite!';
        }
        // Every 5th turn: regenerate head
        if (this.enemyTurnCount % 5 === 0) {
          const heal = Math.floor(this.monster.maxHp * 0.12);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + heal);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${heal} HP`, '#44dd66');
        }
        break;
      case 'storm_hawk':
        // Very fast — double strike every other turn
        if (this.enemyTurnCount % 2 === 1) {
          dmgMult = 0.6;
          specialMsg = 'Storm Hawk strikes twice!';
          // Second hit after delay
          this.time.delayedCall(300, () => {
            if (this.battleOver) return;
            const def2 = this.defending ? this.playerDef * 2 : this.playerDef;
            const dmg2 = Math.max(1, Math.floor(this.monster.atk * 0.6) - def2 + Phaser.Math.Between(-2, 2));
            this.playerHp = Math.max(0, this.playerHp - dmg2);
            this.updatePlayerHp();
            this.showDamage(this.playerBaseX + 15, this.stageY - 45, dmg2, false, '#ffdd22');
          });
        }
        break;
      case 'shadow_assassin':
        // High crit chance, stealth every 4th turn
        if (this.enemyTurnCount % 4 === 0) {
          specialMsg = 'Shadow Assassin vanishes into shadows!';
          skipTurn = true; // skip but next attack 2.5x
        } else if (this.enemyTurnCount % 4 === 1) {
          dmgMult = 2.5;
          specialMsg = 'Shadow Assassin strikes from the shadows! Backstab!';
        }
        break;
      case 'lava_worm':
        // Constant burn, burrow every 3rd turn
        applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.05 };
        if (this.enemyTurnCount % 3 === 0) {
          specialMsg = 'Lava Worm burrows underground!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 1) {
          dmgMult = 1.6;
          specialMsg = 'Lava Worm erupts from below!';
        }
        break;

      // ── Ice Cavern Monsters ──
      case 'ice_golem':
        // Slow but heavy hitter, crystallize at low HP: one-shot +50% DEF for
        // 3 turns (was a compounding permanent 1.2x that re-hardened — and
        // skipped — every turn below 30% HP, so the golem never attacked again)
        if (mHpPct < 0.3 && this.monsterDefBuffTurns === 0 && this.monsterDefBuff === 0) {
          this.monsterDefBuff = Math.floor(this.monster.def * 0.5);
          this.monster.def += this.monsterDefBuff;
          this.monsterDefBuffTurns = 3;
          this.showBuff(this.monsterBaseX, this.stageY - 60, '🧊 DEF UP!', '#55ccff');
          specialMsg = 'Ice Golem hardens its shell! DEF up for 3 turns!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.8;
          specialMsg = 'Ice Golem slams with frozen fist!';
        }
        break;
      case 'frost_sprite':
        // Fast, applies slow
        if (this.enemyTurnCount % 3 === 0) {
          applyDot = { type: 'slow', turns: 2, pctPerTurn: 0, spdReduction: 40 };
          specialMsg = 'Frost Sprite chills the air!';
          dmgMult = 0.7;
        }
        break;
      case 'yeti':
        // Powerful, rage at low HP, freeze attacks
        if (mHpPct < 0.4) {
          dmgMult = 1.5;
          specialMsg = 'Yeti goes berserk!';
        } else if (this.enemyTurnCount % 4 === 0) {
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          dmgMult = 1.3;
          specialMsg = 'Yeti unleashes a freezing roar!';
        }
        break;
      case 'crystal_wyrm':
        // Boss: Frost Breath cycle + Ice Storm + Freeze
        const wyrmCycle = this.enemyTurnCount % 5;
        if (wyrmCycle === 1) {
          dmgMult = 2.0;
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Crystal Wyrm uses Frost Breath!';
        } else if (wyrmCycle === 3) {
          dmgMult = 1.5;
          applyDot = { type: 'slow', turns: 2, pctPerTurn: 0, spdReduction: 50 };
          specialMsg = 'Crystal Wyrm summons Ice Storm!';
        } else if (wyrmCycle === 0) {
          const heal = Math.floor(this.monster.maxHp * 0.08);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + heal);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${heal} HP`, '#88ddff');
          specialMsg = 'Crystal Wyrm absorbs ice energy!';
        }
        break;

      // ── Volcano Monsters ──
      case 'fire_elemental':
        // Burns constantly, occasional fire burst
        applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.04 };
        if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.5;
          specialMsg = 'Fire Elemental erupts!';
        }
        break;
      case 'lava_slime':
        // Splits: heals when low HP
        if (mHpPct < 0.3 && this.enemyTurnCount % 4 === 0) {
          const heal = Math.floor(this.monster.maxHp * 0.2);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + heal);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${heal} HP`, '#ff6644');
          specialMsg = 'Lava Slime reforms!';
          skipTurn = true;
        }
        applyDot = { type: 'burn', turns: 1, pctPerTurn: 0.03 };
        break;
      case 'magma_golem':
        // Heavy hitter, every 4th turn power slam
        if (this.enemyTurnCount % 4 === 0) {
          dmgMult = 2.2;
          specialMsg = 'Magma Golem uses Power Slam!';
        }
        applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.05 };
        break;
      case 'infernal_dragon':
        // Boss: Magma Breath → attack → Magma Rain → attack cycle
        const infCycle = this.enemyTurnCount % 4;
        if (infCycle === 1) {
          dmgMult = 2.0;
          applyDot = { type: 'burn', turns: 3, pctPerTurn: 0.08 };
          specialMsg = 'Infernal Dragon uses Magma Breath!';
        } else if (infCycle === 3) {
          dmgMult = 1.8;
          specialMsg = 'Infernal Dragon rains magma!';
        }
        break;
      case 'boss_frost_v2':
        // Empowered dragon: faster cycle, more damage
        const v2Cycle = this.enemyTurnCount % 3;
        if (v2Cycle === 1) {
          dmgMult = 2.0;
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Empowered Dragon uses Frost Breath!';
        } else if (v2Cycle === 0) {
          dmgMult = 1.8;
          applyDot = { type: 'bleed', turns: 3, pctPerTurn: 0.06 };
          specialMsg = 'Empowered Dragon slashes with icy claws!';
        }
        break;

      // ── Misc Monsters ──
      case 'wolf':
        // Fast attacker, pack howl every 4th turn
        if (this.enemyTurnCount % 4 === 0) {
          dmgMult = 1.4;
          specialMsg = 'Wolf lunges with ferocity!';
        }
        break;
      case 'treant':
        // Slow, heals every 4th turn
        if (this.enemyTurnCount % 4 === 0) {
          const heal = Math.floor(this.monster.maxHp * 0.12);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + heal);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${heal} HP`, '#44aa44');
          specialMsg = 'Treant regenerates!';
          skipTurn = true;
        }
        break;

      // ── Dungeon bosses — signature cycles (all 13 hit generically before) ──
      case 'shadow_lord':
        // Crypt: vanish, then backstab with bleed
        if (this.enemyTurnCount % 3 === 0) {
          specialMsg = 'Shadow Lord melts into the darkness...';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 1) {
          dmgMult = 2.4;
          applyDot = { type: 'bleed', turns: 2, pctPerTurn: 0.05 };
          specialMsg = 'Shadow Lord strikes from behind! Backstab!';
        }
        break;
      case 'swamp_hag':
        // Swamp: poison brews + self-heal
        if (this.enemyTurnCount % 4 === 0) {
          const hagHeal = Math.floor(this.monster.maxHp * 0.12);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + hagHeal);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${hagHeal} HP`, '#44aa44');
          specialMsg = 'Swamp Hag drinks a foul brew!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 4 === 2) {
          dmgMult = 1.5;
          applyDot = { type: 'poison', turns: 3, pctPerTurn: 0.05 };
          specialMsg = 'Swamp Hag hurls a venom flask!';
        }
        break;
      case 'crystal_colossus':
        // Mines: crystallize (one-shot DEF wall), then shattering slam
        if (mHpPct < 0.4 && this.monsterDefBuffTurns === 0 && this.monsterDefBuff === 0) {
          this.monsterDefBuff = Math.floor(this.monster.def * 0.6);
          this.monster.def += this.monsterDefBuff;
          this.monsterDefBuffTurns = 3;
          this.showBuff(this.monsterBaseX, this.stageY - 60, '💎 DEF UP!', '#88ddff');
          specialMsg = 'Crystal Colossus crystallizes!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.9;
          specialMsg = 'Crystal Colossus slams with crystal fists!';
        }
        break;
      case 'sky_sentinel':
      case 'storm_titan':
        // Citadel: lightning cycle, occasional stunning bolt
        if (this.enemyTurnCount % 4 === 0) {
          dmgMult = 1.4;
          applyDot = { type: 'stun', turns: 1, pctPerTurn: 0 };
          specialMsg = `${mType === 'storm_titan' ? 'Storm Titan' : 'Sky Sentinel'} hurls a stunning bolt!`;
        } else if (this.enemyTurnCount % 4 === 2) {
          dmgMult = 2.0;
          specialMsg = 'Lightning crashes down!';
        }
        break;
      case 'lich_king':
        // Necropolis: life drain — heals for part of the hit
        if (this.enemyTurnCount % 3 === 1) {
          dmgMult = 1.6;
          const drain = Math.floor(this.monster.maxHp * 0.08);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + drain);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${drain} HP`, '#aa66ff');
          specialMsg = 'Lich King drains your life force!';
        } else if (this.enemyTurnCount % 3 === 0) {
          applyDot = { type: 'poison', turns: 3, pctPerTurn: 0.06 };
          dmgMult = 1.2;
          specialMsg = 'Lich King unleashes a plague curse!';
        }
        break;
      case 'frost_emperor':
        // Frost Wastes: freezing cycle + glacial crush
        if (this.enemyTurnCount % 4 === 1) {
          dmgMult = 1.5;
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Frost Emperor breathes absolute cold!';
        } else if (this.enemyTurnCount % 4 === 3) {
          dmgMult = 2.2;
          specialMsg = 'Frost Emperor crushes with a glacier!';
        }
        break;
      case 'demon_lord':
        // Demon's Gate: burning strikes, enrages below 40% HP
        if (mHpPct < 0.4) {
          dmgMult = 1.7;
          applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.06 };
          specialMsg = 'Demon Lord burns with fury!';
        } else if (this.enemyTurnCount % 3 === 0) {
          dmgMult = 1.6;
          applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.05 };
          specialMsg = 'Demon Lord lashes with hellfire!';
        }
        break;
      case 'ancient_guardian':
        // Ruins: stone ward (one-shot DEF), then seismic slam
        if (mHpPct < 0.5 && this.monsterDefBuffTurns === 0 && this.monsterDefBuff === 0) {
          this.monsterDefBuff = Math.floor(this.monster.def * 0.5);
          this.monster.def += this.monsterDefBuff;
          this.monsterDefBuffTurns = 3;
          this.showBuff(this.monsterBaseX, this.stageY - 60, '🛡 DEF UP!', '#ccaa66');
          specialMsg = 'Ancient Guardian raises a stone ward!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 2) {
          dmgMult = 2.0;
          specialMsg = 'Ancient Guardian slams the earth!';
        }
        break;
      case 'void_sovereign':
        // Void: phases out, then reality-tearing strike with slow
        if (this.enemyTurnCount % 3 === 0) {
          specialMsg = 'Void Sovereign phases out of reality...';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 1) {
          dmgMult = 2.6;
          applyDot = { type: 'slow', turns: 2, pctPerTurn: 0, spdReduction: 40 };
          specialMsg = 'Void Sovereign tears through reality!';
        }
        break;
      case 'titan_forgemaster':
        // Forge: molten hammer + one-shot forged armor
        if (mHpPct < 0.5 && this.monsterDefBuffTurns === 0 && this.monsterDefBuff === 0) {
          this.monsterDefBuff = Math.floor(this.monster.def * 0.5);
          this.monster.def += this.monsterDefBuff;
          this.monsterDefBuffTurns = 3;
          this.showBuff(this.monsterBaseX, this.stageY - 60, '⚒ DEF UP!', '#ffaa44');
          specialMsg = 'Titan Forgemaster forges molten armor!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 3 === 1) {
          dmgMult = 2.2;
          applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.05 };
          specialMsg = 'Titan Forgemaster swings the molten hammer!';
        }
        break;
      case 'abyssal_leviathan':
        // Abyss: tidal wave with slow, deep-heal every 5th turn
        if (this.enemyTurnCount % 5 === 0) {
          const levHeal = Math.floor(this.monster.maxHp * 0.10);
          this.monster.hp = Math.min(this.monster.maxHp, this.monster.hp + levHeal);
          this.updateMonsterHp();
          this.showBuff(this.monsterBaseX, this.stageY - 40, `+${levHeal} HP`, '#44aacc');
          specialMsg = 'Abyssal Leviathan dives into the deep!';
          skipTurn = true;
        } else if (this.enemyTurnCount % 5 === 2) {
          dmgMult = 2.0;
          applyDot = { type: 'slow', turns: 2, pctPerTurn: 0, spdReduction: 40 };
          specialMsg = 'Abyssal Leviathan summons a tidal wave!';
        }
        break;
      case 'boss_frost':
        // Original dungeon boss: frost breath cycle
        if (this.enemyTurnCount % 3 === 1) {
          dmgMult = 1.8;
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Frost Boss breathes freezing wind!';
        }
        break;
      case 'abyssal_overlord':
        // Eternal Abyss final boss: 5-turn mixed onslaught
        if (this.enemyTurnCount % 5 === 1) {
          dmgMult = 1.6;
          applyDot = { type: 'burn', turns: 2, pctPerTurn: 0.06 };
          specialMsg = 'Abyssal Overlord ignites the abyss!';
        } else if (this.enemyTurnCount % 5 === 3) {
          dmgMult = 1.6;
          applyDot = { type: 'freeze', turns: 1, pctPerTurn: 0 };
          specialMsg = 'Abyssal Overlord freezes your soul!';
        } else if (this.enemyTurnCount % 5 === 0) {
          dmgMult = 2.4;
          specialMsg = 'Abyssal Overlord unleashes annihilation!';
        }
        break;
    }

    if (skipTurn) {
      this.log(specialMsg);
      this.time.delayedCall(800, () => this.afterEnemyTurn());
      return;
    }

    // Dodge check (player SPD vs monster SPD, slow effects included)
    const spdDiff = Math.max(0, this.effectivePlayerSpd() - (this.monster.spd || 5));
    const baseDodge = spdDiff * 0.03;
    const dodgeChance = Math.min(0.20, baseDodge) + (this.playerDodgeBuff / 100);

    if (Math.random() < dodgeChance) {
      this.battleDodges++;
      this.showBuff(this.playerBaseX, this.stageY - 40, '💨 DODGE!', '#44ddff');
      this.log(`You dodged the attack!${specialMsg ? '  ' + specialMsg : ''}`);
      this.sfx('metal-click');
      this.time.delayedCall(600, () => this.afterEnemyTurn());
      return;
    }

    const effectiveDef = this.defending
      ? this.playerDef * 2
      : Math.floor(this.playerDef * (1 + this.playerDefBuff / 100));

    const rawDmg = Math.max(1, Math.floor(this.monster.atk * dmgMult) - effectiveDef + Phaser.Math.Between(-2, 2));

    // Element multiplier for monster attack
    const mElemMult = getElementMultiplier(this.monsterElement, this.playerElement);
    const dmg = Math.max(1, Math.floor(rawDmg * mElemMult));

    this.animateAttack('enemy', () => {
      this.playerHp = Math.max(0, this.playerHp - dmg);
      this.battleDamageTaken += dmg;
      this.updatePlayerHp();
      this.showDamage(this.playerBaseX, this.stageY - 30, dmg, false, '#ff4444');
      this.shakeSprite(this.playerGfx);
      this.sfx('hit-light1');

      // Element-based attack effect for special moves
      if (dmgMult > 1.0 || applyDot) {
        const atkElem = applyDot?.type === 'burn' ? 'fire'
          : applyDot?.type === 'freeze' || applyDot?.type === 'slow' ? 'ice'
          : applyDot?.type === 'poison' ? 'shadow'
          : this.monsterElement;
        this.playSkillEffect(atkElem, this.playerBaseX, this.stageY, this.monsterBaseX);
      }

      // Heavy hits get bigger shake
      if (dmgMult >= 1.5) {
        this.cameras.main.shake(100, 0.01);
      }

      const elemText = getEffectivenessText(mElemMult);
      let logMsg = specialMsg || `${this.monster.type} attacks for ${dmg}!`;
      if (!specialMsg) logMsg = `${this.monster.type} attacks for ${dmg}!`;
      else logMsg += `  ${dmg} damage!`;
      if (this.defending) logMsg += '  (Blocked!)';
      if (elemText) logMsg += `  ${elemText}`;
      this.log(logMsg);

      // Apply DOT from monster
      if (applyDot) {
        this.playerStatusEffects.push(applyDot);
        const icon = applyDot.type === 'burn' ? '🔥' : '☠️';
        this.showBuff(this.playerBaseX, this.stageY - 60, `${icon} ${applyDot.type}!`, '#ff6644');
      }

      if (this.playerHp <= 0) { this.defeat(); return; }
      this.time.delayedCall(500, () => this.afterEnemyTurn());
    });
  }

  private afterEnemyTurn(): void {
    // Tick down monster DEF buff (ice golem harden etc.)
    if (this.monsterDefBuffTurns > 0) {
      this.monsterDefBuffTurns--;
      if (this.monsterDefBuffTurns === 0 && this.monsterDefBuff > 0) {
        this.monster.def = Math.max(1, this.monster.def - this.monsterDefBuff);
        this.monsterDefBuff = 0;
        this.showBuff(this.monsterBaseX, this.stageY - 60, '🧊 Shell cracks!', '#8899aa');
      }
    }

    // Apply DOT on player
    let dotDelay = 0;
    let skipReason: 'freeze' | 'stun' | null = null;
    const dotsToRemove: number[] = [];
    this.playerStatusEffects.forEach((eff, idx) => {
      if (eff.turns > 0) {
        if (eff.pctPerTurn > 0) {
          const dotDmg = Math.max(1, Math.floor(this.playerMaxHp * eff.pctPerTurn));
          this.time.delayedCall(dotDelay, () => {
            this.playerHp = Math.max(0, this.playerHp - dotDmg);
            this.updatePlayerHp();
            const icons: Record<string, string> = { burn: '🔥', poison: '☠️', bleed: '🩸' };
            const colors: Record<string, string> = { burn: '#ff6622', poison: '#66cc44', bleed: '#cc2222' };
            this.showDamage(this.playerBaseX, this.stageY - 40, dotDmg, false, colors[eff.type] || '#ff6622');
            if (this.playerHp <= 0) { this.defeat(); return; }
          });
          dotDelay += 300;
        }
        // Freeze: 30% chance to skip player's next turn
        if (eff.type === 'freeze' && Math.random() < 0.30) {
          skipReason = 'freeze';
          this.time.delayedCall(dotDelay, () => {
            this.showBuff(this.playerBaseX, this.stageY - 50, '❄️ Frozen!', '#55ccff');
            this.log('You are frozen! Turn skipped!');
          });
          dotDelay += 400;
        }
        // Stun: guaranteed skip of player's next turn
        if (eff.type === 'stun') {
          skipReason = skipReason || 'stun';
          this.time.delayedCall(dotDelay, () => {
            this.showBuff(this.playerBaseX, this.stageY - 50, '💫 Stunned!', '#ffdd00');
            this.log('You are stunned! Turn skipped!');
          });
          dotDelay += 400;
        }
        // Slow needs no per-turn handling: effectivePlayerSpd() reads active
        // slow effects inside the crit/dodge/double-strike checks.
        eff.turns--;
        if (eff.turns <= 0) dotsToRemove.push(idx);
      }
    });
    for (let i = dotsToRemove.length - 1; i >= 0; i--) {
      this.playerStatusEffects.splice(dotsToRemove[i], 1);
    }

    this.time.delayedCall(dotDelay + 200, () => {
      if (this.playerHp <= 0) { this.defeat(); return; }
      if (this.battleOver) return;

      // Freeze/stun: the player loses this action — the enemy acts again
      if (skipReason) {
        this.defending = false;
        this.turn = 'enemy';
        this.turnIndicator
          .setText(skipReason === 'freeze' ? '— FROZEN —' : '— STUNNED —')
          .setColor(skipReason === 'freeze' ? '#55ccff' : '#ffdd00');
        this.setButtonsEnabled(false);
        this.updateStatusDisplay();
        this.time.delayedCall(800, () => { if (!this.battleOver) this.enemyTurn(); });
        return;
      }

      // Double strike check: SPD >= 2x monster → 15% chance the player acts
      // twice before the next enemy turn (armed here, consumed in
      // afterPlayerTurn where the enemy turn gets skipped once)
      const doubleStrikeChance = this.effectivePlayerSpd() >= (this.monster.spd || 5) * 2 ? 0.15 : 0;
      if (doubleStrikeChance > 0 && Math.random() < doubleStrikeChance) {
        this.extraTurnArmed = true;
        this.showBuff(this.playerBaseX, this.stageY - 50, '⚡ DOUBLE STRIKE!', '#ffdd00');
        this.log('Your speed grants an extra turn!');
      }

      this.defending = false;
      this.turn = 'player';
      this.busy = false;
      this.turnIndicator.setText('— YOUR TURN —').setColor('#00ccee');
      this.setButtonsEnabled(true);
      this.updateStatusDisplay();
    });
  }

  // ── Update status display ──
  private updateStatusDisplay(): void {
    const statusIcons: Record<string, string> = {
      burn: '🔥', poison: '☠️', stun: '💫', freeze: '❄️', slow: '🐌', bleed: '🩸',
    };
    const parts: string[] = [];
    for (const eff of this.playerStatusEffects) {
      const icon = statusIcons[eff.type] || '💥';
      parts.push(`${icon}${eff.type}(${eff.turns}t)`);
    }
    if (this.playerDefBuff > 0) parts.push(`🛡DEF+${this.playerDefBuff}%(${this.playerDefBuffTurns}t)`);
    if (this.playerDodgeBuff > 0) parts.push(`💨Dodge+${this.playerDodgeBuff}%(${this.playerDodgeBuffTurns}t)`);

    const mParts: string[] = [];
    for (const eff of this.monsterStatusEffects) {
      const icon = statusIcons[eff.type] || '💥';
      mParts.push(`${icon}${eff.type}(${eff.turns}t)`);
    }

    let display = '';
    if (parts.length) display += `You: ${parts.join(' ')}`;
    if (mParts.length) display += `${display ? '  |  ' : ''}Enemy: ${mParts.join(' ')}`;
    this.statusText.setText(display);
  }

  // ── Attack animation ──
  private animateAttack(who: 'player' | 'enemy', onHit: () => void): void {
    const gfx = who === 'player' ? this.playerGfx : this.monsterGfx;
    const dir = who === 'player' ? 1 : -1;
    const dist = 60;

    this.tweens.add({
      targets: gfx,
      x: gfx.x + dist * dir,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        onHit();

        // Camera shake on hit
        this.cameras.main.shake(50, 0.005);

        // Visual hit effect depending on attacker
        if (who === 'player') {
          this.playSlashEffect(this.monsterBaseX, this.stageY);
        } else {
          this.playImpactFlash(this.playerBaseX, this.stageY);
        }

        this.tweens.add({
          targets: gfx,
          x: gfx.x - dist * dir,
          duration: 200,
          ease: 'Back.easeOut',
        });
      },
    });
  }

  // ── Slash effect: 3 diagonal lines flash at target ──
  private playSlashEffect(x: number, y: number): void {
    const slash = this.add.graphics().setDepth(40);
    const offsets = [
      { x1: -18, y1: -25, x2: 18, y2: 25 },
      { x1: -12, y1: -28, x2: 22, y2: 20 },
      { x1: -22, y1: -18, x2: 14, y2: 28 },
    ];
    slash.lineStyle(3, 0xffffff, 1);
    for (const o of offsets) {
      slash.lineBetween(x + o.x1, y + o.y1, x + o.x2, y + o.y2);
    }
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 250,
      ease: 'Power2',
      onComplete: () => slash.destroy(),
    });
  }

  // ── Impact flash: red expanding circle at target ──
  private playImpactFlash(x: number, y: number): void {
    const circle = this.add.circle(x, y, 8, 0xff3333, 0.7).setDepth(40);
    this.tweens.add({
      targets: circle,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => circle.destroy(),
    });
  }

  // ── Skill element effects ──
  private playSkillEffect(element: string, targetX: number, targetY: number, casterX: number): void {
    switch (element) {
      case 'fire': {
        // Orange/red particle burst at target
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12;
          const color = Math.random() > 0.5 ? 0xff6622 : 0xff3300;
          const particle = this.add.circle(targetX, targetY, Phaser.Math.Between(2, 5), color, 0.9).setDepth(40);
          const dist = Phaser.Math.Between(25, 55);
          this.tweens.add({
            targets: particle,
            x: targetX + Math.cos(angle) * dist,
            y: targetY + Math.sin(angle) * dist,
            alpha: 0,
            scaleX: 0.2,
            scaleY: 0.2,
            duration: Phaser.Math.Between(300, 500),
            ease: 'Power2',
            onComplete: () => particle.destroy(),
          });
        }
        break;
      }
      case 'ice': {
        // Blue crystal shards fly from caster to target
        for (let i = 0; i < 6; i++) {
          const shard = this.add.graphics().setDepth(40);
          shard.fillStyle(Phaser.Math.Between(0, 1) ? 0x55ccff : 0xaaeeff, 0.9);
          // Diamond shape
          shard.fillTriangle(0, -6, 4, 0, 0, 6);
          shard.fillTriangle(0, -6, -4, 0, 0, 6);
          shard.setPosition(casterX, targetY + Phaser.Math.Between(-20, 20));
          const delay = i * 60;
          this.time.delayedCall(delay, () => {
            this.tweens.add({
              targets: shard,
              x: targetX + Phaser.Math.Between(-15, 15),
              y: targetY + Phaser.Math.Between(-15, 15),
              angle: Phaser.Math.Between(-180, 180),
              duration: 250,
              ease: 'Power2',
              onComplete: () => {
                this.tweens.add({
                  targets: shard,
                  alpha: 0,
                  duration: 150,
                  onComplete: () => shard.destroy(),
                });
              },
            });
          });
        }
        break;
      }
      case 'shadow':
      case 'dark': {
        // Dark pulse ring expands from target
        const ring = this.add.graphics().setDepth(40);
        ring.lineStyle(3, 0x6633aa, 0.8);
        ring.strokeCircle(targetX, targetY, 10);
        ring.setAlpha(0.9);
        this.tweens.add({
          targets: ring,
          scaleX: 5,
          scaleY: 5,
          alpha: 0,
          duration: 450,
          ease: 'Power1',
          onComplete: () => ring.destroy(),
        });
        // Inner dark fill
        const darkFill = this.add.circle(targetX, targetY, 20, 0x220033, 0.4).setDepth(39);
        this.tweens.add({
          targets: darkFill,
          scaleX: 2.5,
          scaleY: 2.5,
          alpha: 0,
          duration: 400,
          ease: 'Power2',
          onComplete: () => darkFill.destroy(),
        });
        break;
      }
      default: {
        // White flash at target
        const flash = this.add.circle(targetX, targetY, 15, 0xffffff, 0.6).setDepth(40);
        this.tweens.add({
          targets: flash,
          scaleX: 3,
          scaleY: 3,
          alpha: 0,
          duration: 250,
          ease: 'Power2',
          onComplete: () => flash.destroy(),
        });
        break;
      }
    }
  }

  // ── Critical hit enhanced effect ──
  private playCriticalEffect(x: number, y: number): void {
    // Larger camera shake + quick zoom punch (impact weight). Direct tween
    // with yoyo — a nested zoomTo(1) gets ignored while the first zoom
    // effect is active and left the camera stuck at 1.05.
    // Faz 5.2: taban artık kesirli fit-zoom (baseZoom) — punch ona göreli.
    this.cameras.main.shake(120, 0.012);
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.zoom = this.baseZoom;
    this.tweens.add({
      targets: this.cameras.main, zoom: this.baseZoom * 1.05, duration: 90, yoyo: true, ease: 'Power2',
      onComplete: () => { this.cameras.main.zoom = this.baseZoom; },
    });

    // "CRITICAL!" text bounces
    const critText = this.add.text(x, y - 60, 'CRITICAL!', {
      fontSize: '26px', color: '#ffdd00',
      fontFamily: TD_FONT, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(35).setScale(0.3);

    this.tweens.add({
      targets: critText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: critText,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
          onComplete: () => {
            this.tweens.add({
              targets: critText,
              y: y - 100,
              alpha: 0,
              duration: 800,
              ease: 'Power1',
              onComplete: () => critText.destroy(),
            });
          },
        });
      },
    });
  }

  // ── Victory confetti burst (from the fallen monster) ──
  private playVictoryConfetti(): void {
    const colors = [0xffdd00, 0x00ccee, 0xff4466, 0x44dd66, 0xcc44ff];
    for (let i = 0; i < 26; i++) {
      const piece = this.add.rectangle(
        this.monsterBaseX + Phaser.Math.Between(-20, 20),
        this.stageY - 40,
        Phaser.Math.Between(4, 7), Phaser.Math.Between(6, 10),
        colors[i % colors.length],
      ).setDepth(40).setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: piece,
        x: piece.x + Phaser.Math.Between(-120, 120),
        y: piece.y + Phaser.Math.Between(60, 200),
        angle: piece.angle + Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1300),
        delay: Phaser.Math.Between(0, 150),
        ease: 'Cubic.easeIn',
        onComplete: () => piece.destroy(),
      });
    }
  }

  // ── Monster death animation ──
  private playMonsterDeathAnimation(): void {
    // Flash red 3 times then fade out
    let flashCount = 0;
    const doFlash = () => {
      if (flashCount >= 3) {
        // Final fade to transparent
        this.tweens.add({
          targets: this.monsterGfx,
          alpha: 0,
          duration: 500,
          ease: 'Power2',
        });
        return;
      }
      this.tweens.add({
        targets: this.monsterGfx,
        alpha: 0.2,
        duration: 100,
        yoyo: true,
        onComplete: () => {
          flashCount++;
          doFlash();
        },
      });
    };
    // Tint effect via red overlay
    const tint = this.add.rectangle(this.monsterBaseX, this.stageY, 60, 60, 0xff0000, 0.3).setDepth(11);
    this.tweens.add({
      targets: tint,
      alpha: 0,
      duration: 200,
      yoyo: true,
      repeat: 2,
      onComplete: () => tint.destroy(),
    });
    doFlash();
  }

  // ── Floating damage number ──
  private showDamage(x: number, y: number, amount: number, crit: boolean, color = '#ffffff'): void {
    const size = crit ? '30px' : '22px';
    const txt = this.add.text(x, y, `${crit ? 'CRIT ' : ''}${amount}`, {
      fontSize: size, color: crit ? '#ffdd00' : color,
      fontFamily: TD_FONT, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30).setScale(0.4).setAngle(crit ? Phaser.Math.Between(-8, 8) : 0);

    // Pop in with overshoot, then float up and fade
    this.tweens.add({
      targets: txt, scale: crit ? 1.25 : 1, duration: crit ? 180 : 140, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          y: y - (crit ? 65 : 50),
          alpha: 0,
          scale: 1,
          duration: crit ? 1050 : 1000,
          ease: 'Power1',
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  // ── Floating buff text ──
  private showBuff(x: number, y: number, text: string, color = '#44aaff'): void {
    const txt = this.add.text(x, y, text, {
      fontSize: '16px', color,
      fontFamily: TD_FONT, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);

    this.tweens.add({
      targets: txt,
      y: y - 40,
      alpha: 0,
      duration: 1000,
      ease: 'Power1',
      onComplete: () => txt.destroy(),
    });
  }

  // ── Sprite shake ──
  // TD reskin: playerGfx (Graphics) VE monsterGfx (Image, chibi) ile çağrılır — ikisi de .x taşır.
  private shakeSprite(gfx: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image): void {
    const origX = gfx.x;
    this.tweens.add({
      targets: gfx,
      x: origX + 6,
      duration: 40,
      yoyo: true,
      repeat: 3,
      onComplete: () => { gfx.x = origX; },
    });
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0.1).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
  }

  // ── Victory ──
  private victory(): void {
    this.battleOver = true;
    const state = PlayerState.get();
    state.hp = this.playerHp;
    state.mp = this.playerMp;
    const leveled = state.addXp(this.monster.xpReward);
    state.gold += this.monster.goldReward;

    // ── Achievement stat tracking ── (sandbox: testnet önizleme canlı achievements'e yazmaz)
    if (!this.sandbox) {
      incrementStat('totalKills');
      incrementStat('totalGoldEarned', this.monster.goldReward);
      if (this.battleCrits > 0) incrementStat('critCount', this.battleCrits);
      if (this.battleDodges > 0) incrementStat('dodgeCount', this.battleDodges);
      if (this.battleDamageTaken === 0) incrementStat('perfectWins');

      // Boss kills
      const mType = this.monster.type;
      const isBoss = mType.includes('boss') || mType === 'crystal_wyrm' || mType === 'infernal_dragon' || mType === 'dragon';
      if (isBoss) incrementStat('bossKills');

      // Monster type kills
      if (mType === 'skeleton') incrementStat('skeletonKills');
      if (mType === 'spider') incrementStat('spiderKills');
      if (mType === 'ghost') incrementStat('ghostKills');
      if (mType === 'dragon' || mType === 'frost_dragon' || mType === 'crystal_wyrm' || mType === 'infernal_dragon') {
        incrementStat('dragonKills');
      }

      // Trigger achievement check via HUD
      const hudScene = this.scene.get('HUD') as any;
      if (hudScene?.runAchievementCheck) {
        this.time.delayedCall(500, () => hudScene.runAchievementCheck());
      }
    }

    // Loot drops
    const loot = rollLoot(this.monster.type, !!this.monster.isElite);
    let lootMsg = '';
    for (const drop of loot) {
      const added = state.addItem(drop.item);
      if (added) {
        const rarityName = drop.rarity.charAt(0).toUpperCase() + drop.rarity.slice(1);
        lootMsg += `\n${drop.item.name} (${rarityName})`;
        // Animate loot drop
        const lootColor = `#${RARITY_COLORS[drop.rarity].toString(16).padStart(6, '0')}`;
        this.showBuff(this.monsterBaseX + Phaser.Math.Between(-30, 30), this.stageY - Phaser.Math.Between(20, 60),
          `${drop.item.name}`, lootColor);
      } else {
        lootMsg += `\n${drop.item.name} — Inventory full!`;
      }
    }

    this.turnIndicator.setText('').setColor('#44dd66');
    this.setButtonsEnabled(false);
    this.playMonsterDeathAnimation();
    this.playVictoryConfetti();

    let msg = `Victory!  +${this.monster.xpReward} XP  +${this.monster.goldReward} Gold`;
    if (leveled) msg += `\n⬆ LEVEL UP! Now level ${state.level}!`;
    if (lootMsg) msg += lootMsg;
    this.log(msg);
    if (!this.sandbox) {
      state.save();

      // Sync XP to on-chain hero NFT via multiplayer server
      if (mp.connected && state.nftTokenId > 0) {
        (mp as any).socket?.emit('battle-result', {
          won: true,
          heroTokenId: state.nftTokenId,
          xpEarned: this.monster.xpReward,
          killScore: 1,
        });
      }
    }

    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffdd00, 0.15).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 800, onComplete: () => flash.destroy() });

    this.time.delayedCall(2200, () => this.endBattle(true));
  }

  // ── Defeat ──
  private defeat(): void {
    // Stacked DOT ticks + the afterEnemyTurn delayedCall can both reach here in
    // one death — a second run would double the death stat and gold penalty.
    if (this.battleOver) return;
    this.battleOver = true;
    if (!this.sandbox) incrementStat('deaths');
    const state = PlayerState.get();
    state.hp = Math.floor(state.maxHp * 0.3);
    state.mp = Math.floor(state.maxMp * 0.5);
    state.gold = Math.max(0, state.gold - Math.floor(state.gold * 0.1));
    this.turnIndicator.setText('').setColor('#cc4444');
    this.setButtonsEnabled(false);
    if (!this.sandbox) state.save();

    // ── Death Animation ──
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;

    // 1. Player sprite falls down + fades
    this.tweens.add({
      targets: this.playerGfx,
      y: this.playerGfx.y + 30,
      alpha: 0,
      angle: -15,
      duration: 800,
      ease: 'Power2',
    });

    // 2. Screen shakes
    this.cameras.main.shake(500, 0.02);

    // 3. Red flash pulsing
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xff0000, 0.3).setDepth(50);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 600, yoyo: true, repeat: 1,
      onComplete: () => flash.destroy(),
    });

    // 4. "DEFEATED" text with dramatic entrance
    this.time.delayedCall(600, () => {
      const defeatText = this.add.text(W / 2, H * 0.35, 'DEFEATED', {
        fontSize: '36px', color: '#cc2222', fontFamily: TD_FONT,
        fontStyle: 'bold', stroke: '#000000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(60).setScale(0);

      this.tweens.add({
        targets: defeatText,
        scaleX: 1, scaleY: 1,
        duration: 400,
        ease: 'Back.easeOut',
      });

      // 5. "You retreat to town" subtitle
      this.time.delayedCall(500, () => {
        const subText = this.add.text(W / 2, H * 0.45, 'Retreating to town...  -10% Gold', {
          fontSize: '14px', color: '#884444', fontFamily: TD_FONT,
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(60).setAlpha(0);

        this.tweens.add({
          targets: subText, alpha: 1, duration: 500,
        });
      });

      // 6. Skull icon
      const skull = this.add.text(W / 2, H * 0.25, '💀', {
        fontSize: '48px',
      }).setOrigin(0.5).setDepth(60);

      this.tweens.add({
        targets: skull,
        y: H * 0.22,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    this.log('Defeated...');

    // 7. Fade to black then hand control back to TdWorld via battle-end.
    // TD reskin: izo'nun `scene.stop(returnScene)+scene.start('Town')` teleportu
    // YOK — TdWorld kendi battle-end dinleyicisinde grace-timer uygular (ışınlama
    // yok, sadece geçici dokunulmazlık). spawnX/spawnY iso-Town'a özgü, TD'de kullanılmaz.
    this.time.delayedCall(3500, () => {
      // Full black overlay fade
      const blackout = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100);
      this.tweens.add({
        targets: blackout,
        alpha: 1,
        duration: 800,
        onComplete: () => {
          this.events.emit('battle-end', { won: false });
          this.scene.stop();
        },
      });
    });
  }

  private endBattle(won: boolean): void {
    this.events.emit('battle-end', { won });
    this.scene.stop();
  }

  // ── HP/MP bar updates ──
  private updatePlayerHp(): void {
    const ratio = this.playerHp / this.playerMaxHp;
    this.tweens.add({ targets: this.playerHpBar, width: 200 * ratio, duration: 300 });
    // Ghost trail: the pale bar lags behind, showing the chunk just lost
    this.tweens.add({ targets: this.playerHpGhost, width: 200 * ratio, duration: 450, delay: 280, ease: 'Power2' });
    this.playerHpText.setText(`HP ${this.playerHp}/${this.playerMaxHp}`);
    this.playerHpBar.setFillStyle(ratio > 0.5 ? 0x00cc66 : ratio > 0.25 ? 0xccaa00 : 0xcc3333);
    this.updateLowHpPulse(ratio);
  }

  // Red heartbeat vignette while HP is critical (≤25%)
  private updateLowHpPulse(ratio: number): void {
    const critical = ratio > 0 && ratio <= 0.25;
    if (critical && !this.lowHpOverlay) {
      this.lowHpOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xcc0000, 0)
        .setDepth(48);
      this.tweens.add({ targets: this.lowHpOverlay, fillAlpha: 0.10, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!critical && this.lowHpOverlay) {
      this.tweens.killTweensOf(this.lowHpOverlay);
      this.lowHpOverlay.destroy();
      this.lowHpOverlay = null;
    }
  }

  private updateMonsterHp(): void {
    const ratio = this.monster.hp / this.monster.maxHp;
    this.tweens.add({ targets: this.monsterHpBar, width: 200 * ratio, duration: 300 });
    this.tweens.add({ targets: this.monsterHpGhost, width: 200 * ratio, duration: 450, delay: 280, ease: 'Power2' });
    this.monsterHpText.setText(`HP ${this.monster.hp}/${this.monster.maxHp}`);
  }

  private updatePlayerMp(): void {
    const ratio = this.playerMp / this.playerMaxMp;
    this.tweens.add({ targets: this.playerMpBar, width: 200 * ratio, duration: 300 });
    this.playerMpText.setText(`MP ${this.playerMp}/${this.playerMaxMp}`);
  }

  private log(msg: string): void { this.logText.setText(msg); }
  private sfx(key: string): void { try { this.sound.play(key, { volume: 0.4 }); } catch {} }
}
