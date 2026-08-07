// frontend/scripts/td-quest-test.ts
// Faz 7 — quests.ts + npcs.ts saf mantık testi (Node: `npx tsx scripts/td-quest-test.ts`).
// Biçim emsali: td-cozy-test.ts (elle yazılmış eq/ok, pass/fail sayacı, exit(1)).
// Bu suite aynı zamanda R8 kanaryasıdır: quests.ts/npcs.ts Phaser veya çıplak `window`
// dokunuşu kazanırsa bu dosya Node'da import aşamasında patlar.
import {
  QUESTS, QUEST_BY_ID, questsForGiver, objectiveKey, matchEvent, advance, makeRow,
  offerState, rolloverRepeatables, grantReward, DAILY_MS,
} from '../lib/game/td/quests';
import { NPCS, NPC_BY_ID } from '../lib/game/td/npcs';
import { PlayerState, type QuestData } from '../lib/game/PlayerState';
import { allTownProps, propsForChunk, TOWN_ORIGIN } from '../lib/game/td/worldProps';
import { TOWN_SPAWN, ROAD_Y, getTile } from '../lib/game/td/worldMap';
import { CHUNK } from '../lib/game/td/tdCore';
import { HUB_GAMES } from '../lib/game/hub/hubGames';
import { REGIONS } from '../lib/game/td/worldMap';
import { REGION_MONSTERS, DUNGEON_ROSTERS } from '../lib/game/td/monsterData';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const row = (id: string): QuestData => makeRow(QUEST_BY_ID[id]);

// ─── (1) Bütünlük: tekil id, çözülen giver/requires ───
eq('quest-count', QUESTS.length, 15);
eq('quest-ids-unique', new Set(QUESTS.map(q => q.id)).size, QUESTS.length);
ok('quest-givers-exist', QUESTS.every(q => !!NPC_BY_ID[q.giver]));
ok('quest-requires-resolve', QUESTS.every(q => !q.requires || !!QUEST_BY_ID[q.requires]));
ok('quest-requires-no-self', QUESTS.every(q => q.requires !== q.id));
ok('quest-count-positive', QUESTS.every(q => Number.isInteger(q.count) && q.count > 0));
ok('quest-reward-positive', QUESTS.every(q => q.reward.amount > 0));
ok('quest-item-reward-has-id', QUESTS.every(q => q.reward.type !== 'item' || !!q.reward.id));
eq('daily-count', QUESTS.filter(q => q.repeatable === 'daily').length, 4);
eq('npc-count', NPCS.length, 8);
eq('npc-ids-unique', new Set(NPCS.map(n => n.id)).size, NPCS.length);
ok('every-npc-has-quest', NPCS.every(n => questsForGiver(n.id).length > 0));
eq('questsForGiver-elder', questsForGiver('elder').map(q => q.id), ['q_first_steps', 'q_wolf_cull', 'q_hag_hunt']);
eq('questsForGiver-unknown', questsForGiver('nobody'), []);

// ─── (2) İngilizce-only bekçisi: tüm oyuncuya görünen metin ASCII ───
const ASCII = /^[\x20-\x7E]*$/;
const badText: string[] = [];
for (const q of QUESTS) {
  for (const [f, v] of [['title', q.title], ['description', q.description]] as const) {
    if (!ASCII.test(v)) badText.push(`${q.id}.${f}`);
  }
}
for (const n of NPCS) {
  for (const [f, v] of [['name', n.name], ['greeting', n.greeting]] as const) {
    if (!ASCII.test(v)) badText.push(`${n.id}.${f}`);
  }
}
eq('all-text-ascii', badText, []);

// ─── (3) makeRow → QuestData'nın 10 alanı ───
const r1 = row('q_first_steps');
eq('makeRow-keys', Object.keys(r1).sort(), [
  'completed', 'description', 'id', 'objective', 'progress', 'reward', 'target', 'title', 'turnedIn',
].sort());
eq('makeRow-objective', r1.objective, 'gather:wood');
eq('makeRow-objectiveKey', objectiveKey('gather', 'wood'), 'gather:wood');
eq('makeRow-target', r1.target, 5);
eq('makeRow-progress', r1.progress, 0);
eq('makeRow-flags', [r1.completed, r1.turnedIn], [false, false]);
eq('makeRow-reward-copied', r1.reward, { type: 'gold', amount: 40 });
ok('makeRow-reward-not-aliased', r1.reward !== QUEST_BY_ID.q_first_steps.reward);
eq('makeRow-repeatable-absent', 'repeatable' in r1, false);
eq('makeRow-repeatable-present', row('q_stone_haul').repeatable, 'daily');

// ─── (4) advance: tek-artış, tek-tamamlanma, kıskaç ───
{
  const rows = [row('q_first_steps')];
  let done: string[] = [];
  for (let i = 0; i < 4; i++) done = advance(rows, 'gather:wood', 1);
  eq('advance-4x-progress', rows[0].progress, 4);
  eq('advance-4x-no-complete', [rows[0].completed, done], [false, []]);
  eq('advance-5th-completes', advance(rows, 'gather:wood', 1), ['q_first_steps']);
  eq('advance-5x-progress', rows[0].progress, 5);
  eq('advance-completed', rows[0].completed, true);
  eq('advance-6th-silent', advance(rows, 'gather:wood', 1), []);
  eq('advance-clamped', rows[0].progress, 5);
}
{
  const rows = [row('q_market_day')];                    // amount>1 (sell:gold, total=250)
  eq('advance-amount-completes', advance(rows, 'sell:gold', 250), ['q_market_day']);
  eq('advance-amount-clamped', rows[0].progress, 200);
  eq('advance-zero-amount', advance([row('q_first_steps')], 'gather:wood', 0), []);
}
{
  const rows = [row('q_first_steps')];
  eq('advance-wrong-key', advance(rows, 'gather:stone', 3), []);
  eq('advance-wrong-key-progress', rows[0].progress, 0);
  eq('advance-bare-key-ignored', advance(rows, 'wood', 3), []);   // R2: ad-alansız tip asla eşleşmez
}

// ─── (5) elite joker: tek yönlü ───
{
  const rows = [row('q_wolf_cull')];
  advance(rows, 'kill:elite_wolf', 1);
  eq('elite-advances-base', rows[0].progress, 1);
}
ok('base-does-not-advance-elite', matchEvent({ objective: 'kill:elite_wolf' }, 'kill:wolf') === false);
ok('elite-matches-base', matchEvent({ objective: 'kill:wolf' }, 'kill:elite_wolf') === true);
ok('elite-cross-type-no-match', matchEvent({ objective: 'kill:bear' }, 'kill:elite_wolf') === false);

// ─── (6) `any` jokerleri ───
{
  const rows = [row('q_bounty')];
  advance(rows, 'kill:wolf', 1);
  advance(rows, 'kill:elite_bear', 1);
  advance(rows, 'kill:slime', 1);
  eq('kill-any-counts-all', rows[0].progress, 3);
  eq('kill-any-ignores-other-kind', advance(rows, 'gather:wood', 1), []);
  eq('kill-any-progress-after', rows[0].progress, 3);
}
ok('visit-any-matches-hub', matchEvent({ objective: 'visit:any' }, 'visit:arena'));
ok('visit-any-ignores-kill', matchEvent({ objective: 'visit:any' }, 'kill:wolf') === false);
{
  // `visit:any` dedupe çağrı yerine ait: aynı bina için ikinci kez OLAY YAYINLANMAZ
  // (flags `hub_seen_<id>`), ama olay geldiyse ilerletir — burada sözleşmenin
  // sahne tarafını taklit ediyoruz.
  const rows = [row('q_grand_tour')];
  const flags = new Set<string>();
  const visit = (id: string) => {
    if (flags.has('hub_seen_' + id)) return;
    flags.add('hub_seen_' + id);
    advance(rows, `visit:${id}`, 1);
  };
  visit('arena'); visit('arena'); visit('cardgame');
  eq('visit-any-dedupes', rows[0].progress, 2);
  eq('grand-tour-target-is-hub-count', QUEST_BY_ID.q_grand_tour.count, 9);
}

// ─── (7) turnedIn satırlara dokunmaz ───
{
  const rows = [row('q_first_steps')];
  rows[0].completed = true; rows[0].turnedIn = true; rows[0].progress = 5;
  eq('advance-skips-turnedin', advance(rows, 'gather:wood', 3), []);
  eq('advance-turnedin-progress', rows[0].progress, 5);
}

// ─── (8) offerState geçişleri ───
{
  const rows: QuestData[] = [];
  eq('offer-available', offerState(rows, QUEST_BY_ID.q_first_steps), 'available');
  eq('offer-locked-by-requires', offerState(rows, QUEST_BY_ID.q_wolf_cull), 'locked');

  rows.push(row('q_first_steps'));
  eq('offer-active', offerState(rows, QUEST_BY_ID.q_first_steps), 'active');
  eq('offer-still-locked', offerState(rows, QUEST_BY_ID.q_wolf_cull), 'locked');

  advance(rows, 'gather:wood', 5);
  eq('offer-ready', offerState(rows, QUEST_BY_ID.q_first_steps), 'ready');
  eq('offer-locked-until-turnin', offerState(rows, QUEST_BY_ID.q_wolf_cull), 'locked');

  rows[0].turnedIn = true;
  eq('offer-done', offerState(rows, QUEST_BY_ID.q_first_steps), 'done');
  eq('offer-unlocked-after-turnin', offerState(rows, QUEST_BY_ID.q_wolf_cull), 'available');
  eq('offer-chain-still-locked', offerState(rows, QUEST_BY_ID.q_hag_hunt), 'locked');
}

// ─── (9) rolloverRepeatables (now PARAMETRE) ───
{
  const T = 1_800_000_000_000;                            // sabit epoch — Date.now() YOK
  const daily = row('q_stone_haul');
  daily.progress = 15; daily.completed = true; daily.turnedIn = true; daily.resetAt = T + DAILY_MS;
  const oneShot = row('q_first_steps');
  oneShot.progress = 5; oneShot.completed = true; oneShot.turnedIn = true;
  const rows = [daily, oneShot];

  eq('rollover-future-noop', rolloverRepeatables(rows, T), []);
  eq('rollover-future-untouched', [daily.progress, daily.turnedIn], [15, true]);

  eq('rollover-due-resets', rolloverRepeatables(rows, T + DAILY_MS), ['q_stone_haul']);
  eq('rollover-reset-fields', [daily.progress, daily.completed, daily.turnedIn], [0, false, false]);
  eq('rollover-clears-resetAt', daily.resetAt, undefined);
  eq('rollover-never-touches-oneshot', [oneShot.progress, oneShot.turnedIn], [5, true]);
  eq('rollover-idempotent', rolloverRepeatables(rows, T + DAILY_MS), []);
  eq('rollover-reopens-offer', offerState(rows, QUEST_BY_ID.q_stone_haul), 'active');

  const noStamp = row('q_bounty');                        // resetAt yoksa dokunma (bozuk satır güvenliği)
  noStamp.completed = true; noStamp.turnedIn = true;
  eq('rollover-needs-resetAt', rolloverRepeatables([noStamp], T + DAILY_MS), []);
}

// ─── (10) grantReward — çanta doluysa hiçbir şey mutasyona uğramaz (R9) ───
{
  const ps = PlayerState.get();                           // yapısal uyum kanıtı: RewardSink === PlayerState
  ps.inventory = []; ps.gold = 100; ps.xp = 0; ps.level = 1; ps.xpToNext = 100;

  ok('grant-gold', grantReward(ps, QUEST_BY_ID.q_first_steps) === true);
  eq('grant-gold-amount', ps.gold, 140);

  ok('grant-xp', grantReward(ps, QUEST_BY_ID.q_cold_catch) === true);
  eq('grant-xp-amount', ps.xp, 60);

  ok('grant-item', grantReward(ps, QUEST_BY_ID.q_ore_run) === true);
  eq('grant-item-count', ps.inventory.find(i => i.id === 'potion_hp')?.count, 2);

  // çantayı 12 farklı stack'siz eşyayla doldur → potion_hp stack'i de yok
  ps.inventory = Array.from({ length: 12 }, (_, i) => ({
    id: `junk_${i}`, name: `Junk ${i}`, sprite: 'rock', type: 'quest' as const, stackable: false, count: 1,
  }));
  const goldBefore = ps.gold, xpBefore = ps.xp, invBefore = ps.inventory.length;
  ok('grant-item-full-bag-false', grantReward(ps, QUEST_BY_ID.q_ore_run) === false);
  eq('grant-item-full-bag-no-mutation', [ps.gold, ps.xp, ps.inventory.length], [goldBefore, xpBefore, invBefore]);
  ok('grant-gold-works-with-full-bag', grantReward(ps, QUEST_BY_ID.q_first_steps) === true);

  ps.inventory = []; ps.gold = 50; ps.xp = 0;             // singleton'ı temiz bırak
}

// ─── (11) NPC yerleşimi: çakışma yok, ≥3 tile ayrık ───
{
  // tile KUTUSU × solid dikdörtgeni (merkez-nokta testi ağaç ayak kutularını kaçırıyordu)
  const solids = allTownProps().filter(p => p.solid).map(p => p.solid!);
  const hitsSolid = (tx: number, ty: number) => {
    const x = tx * 16, y = ty * 16;
    return solids.some(s => x < s.x + s.w && x + 16 > s.x && y < s.y + s.h && y + 16 > s.y);
  };
  // kontrol: assertion boşuna geçmesin — bilinen dolu tile'lar TRUE dönmeli
  ok('solid-probe-catches-building', hitsSolid(TOWN_ORIGIN.tx - 12, TOWN_ORIGIN.ty - 2));   // arena kapısı
  ok('solid-probe-catches-campfire', hitsSolid(TOWN_SPAWN.tx, TOWN_SPAWN.ty - 3));
  ok('solid-probe-catches-plaza-tree', hitsSolid(TOWN_ORIGIN.tx - 5, TOWN_ORIGIN.ty + 2));
  ok('npc-no-solid-overlap', !NPCS.some(n => hitsSolid(n.tx, n.ty)));

  const farmTiles = new Set(allTownProps().filter(p => p.kind === 'farm_plot')
    .map(p => `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`));
  ok('npc-not-on-farm-plot', !NPCS.some(n => farmTiles.has(`${n.tx},${n.ty}`)));

  // deterministik prop yerleşimi (çalı vb.) NPC tile'ına düşmesin — 'npc' kind'ının
  // kendisi hariç (Faz 7 adım 3'te propsForChunk NPC'leri de dönecek).
  const occupied = new Map<string, string>();
  for (const c of new Set(NPCS.map(n => `${Math.floor(n.tx / CHUNK)},${Math.floor(n.ty / CHUNK)}`))) {
    const [ccx, ccy] = c.split(',').map(Number);
    for (const p of propsForChunk(ccx, ccy)) {
      if ((p.kind as string) === 'npc') continue;   // PropKind'a 'npc' adım 3'te eklenecek
      occupied.set(`${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`, p.kind);
    }
  }
  eq('npc-tiles-free-of-props', NPCS.filter(n => occupied.has(`${n.tx},${n.ty}`)).map(n => n.id), []);

  ok('npc-off-road', !NPCS.some(n => n.ty === ROAD_Y || n.ty === ROAD_Y - 1));
  ok('npc-off-spawn', !NPCS.some(n => n.tx === TOWN_SPAWN.tx && n.ty === TOWN_SPAWN.ty));
  ok('npc-tiles-walkable', NPCS.every(n => {
    const t = getTile(n.tx, n.ty);
    return !t.collision && t.biome !== 'water';
  }));
  ok('npc-tiles-unique', new Set(NPCS.map(n => `${n.tx},${n.ty}`)).size === NPCS.length);

  // etkileşim yarıçapı 28px (~1.75 tile) → Chebyshev ≥3 tile hedef belirsizliğini imkânsız kılar
  const tooClose: string[] = [];
  for (let i = 0; i < NPCS.length; i++) for (let j = i + 1; j < NPCS.length; j++) {
    const a = NPCS[i], b = NPCS[j];
    if (Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty)) < 3) tooClose.push(`${a.id}~${b.id}`);
  }
  eq('npc-pairwise-3-tiles', tooClose, []);

  // kasabanın içinde kalsınlar (TOWN_ORIGIN ±16 tile bandı)
  ok('npc-inside-town', NPCS.every(n =>
    Math.abs(n.tx - TOWN_ORIGIN.tx) <= 16 && Math.abs(n.ty - TOWN_ORIGIN.ty) <= 16));
}

// ─── Faz 7 sahne sözleşmesi: her görev hedefinin bir ÜRETİCİSİ olmalı ───
// TdWorldScene/TdDungeonScene'in yayınlayabildiği anahtar uzayı. Bir görev tanımı bu
// kümenin dışına çıkarsa (ör. 'crop' yerine 'crops') görev sonsuza dek 0/N kalırdı —
// bu assert o sessiz ölümü derleme-öncesi yakalar.
const HUB_IDS = HUB_GAMES.map(g => g.id);
const DUNGEON_IDS = REGIONS.filter(r => r.key !== 'town').map(r => r.key);
const MONSTER_TYPES = new Set<string>();
for (const list of Object.values(REGION_MONSTERS)) for (const m of list) MONSTER_TYPES.add(m.type);
const BOSS_TYPES = new Set<string>();
for (const r of Object.values(DUNGEON_ROSTERS)) {
  if (r.boss) { BOSS_TYPES.add(r.boss.type); MONSTER_TYPES.add(r.boss.type); }
  for (const m of r.pool) MONSTER_TYPES.add(m.type);
}
const PRODUCIBLE = new Set<string>([
  // TdWorldScene.onSpaceGather + balık tutma
  'gather:wood', 'gather:stone', 'gather:ore', 'gather:fish', 'gather:frostberry',
  // farm_plot hasadı · marketplace satışı
  'harvest:crop', 'sell:gold',
  ...HUB_IDS.map(id => `visit:${id}`),
  ...DUNGEON_IDS.map(id => `enter:${id}`),
  ...[...MONSTER_TYPES].map(t => `kill:${t}`),
  ...[...BOSS_TYPES].map(t => `boss:${t}`),
]);
for (const q of QUESTS) {
  const key = objectiveKey(q.kind, q.target);
  // '<kind>:any' joker — üreteç gerektirmez (aynı kind'daki her olay ilerletir)
  ok(`objective-producible:${q.id}`, q.target === 'any' || PRODUCIBLE.has(key));
}

console.log(`td-quest: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
