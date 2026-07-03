// ─── Floor boss generation ───
// Phase 0: fully deterministic, procedural bosses (no AI latency). The shape
// matches /api/v1/ai-enemy so Phase 1 can swap in Claude-authored bosses by
// pre-generating a batch at run start, keyed by the same seed.
import type { Element } from '../elements';
import type { FloorBoss } from './types';
import { Rng } from './rng';

const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'ice', 'earth', 'thunder', 'shadow', 'light'];

const NAME_PREFIX = ['Frost', 'Ash', 'Storm', 'Grave', 'Ember', 'Rime', 'Dread', 'Hollow', 'Iron', 'Void'];
const NAME_ROOT = ['warden', 'reaver', 'maw', 'sentinel', 'wraith', 'colossus', 'serpent', 'herald', 'fang', 'gaze'];
const TITLES = ['the Unbroken', 'the Frozen Warden', 'of the Deep Thaw', 'the Ashen', 'the Endless', 'the Rimebound', 'the Devourer', 'the Silent'];
const TAUNTS = [
  'You will not leave this floor.',
  'Another warm body for the ice.',
  'Descend, and be forgotten.',
  'Your relics cannot save you.',
  'I have swallowed deeper runs than yours.',
];
const DEFEATS = [
  'Impossible... the thaw...',
  'You... burn brighter than most...',
  'The deep will take you yet...',
  'Go on then. The next floor is worse.',
];
const LORE = [
  'Frozen mid-roar a thousand seasons ago, it wakes only for intruders.',
  'Born of the melt, it hungers for anything that still moves.',
  'A guardian that has forgotten what it guards.',
  'It remembers every warrior it has claimed, and adds you to the list.',
];

/** Difficulty curve: soft-exponential so HP carry creates a natural wall.
 *  Tuned (Phase 0) so smart play reaches ~floor 10-12 and greedy stalls ~6-9;
 *  final calibration is a Phase-2 bot-sim task. */
function bossPower(floor: number): number {
  return Math.pow(1.092, floor - 1);
}

/**
 * Deterministic boss for a given run seed + floor. Every N-th floor is an
 * "elite" (tougher, guaranteed relic drop handled by run.ts).
 */
export function bossForFloor(seed: string, floor: number, partyPower: number): FloorBoss {
  const rng = new Rng(`${seed}:boss:${floor}`);
  const isElite = floor % 3 === 0;
  const scale = bossPower(floor) * (isElite ? 1.35 : 1);

  // Track party power loosely so early floors stay beatable and depth ramps.
  const base = Math.max(30, partyPower * 0.34);
  const level = Math.max(1, Math.round(floor * 1.5));

  const maxHp = Math.round((80 + base * 1.15) * scale * rng.range(0.92, 1.08));
  const atk = Math.round((8 + base * 0.25) * scale * rng.range(0.92, 1.08));
  const def = Math.round((5 + base * 0.14) * scale * rng.range(0.9, 1.1));
  const spd = Math.round((5 + level * 0.8) * rng.range(0.9, 1.1));
  const element = rng.pick(ELEMENTS);

  const name = `${rng.pick(NAME_PREFIX)}${rng.pick(NAME_ROOT)}`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return {
    name: cap(name),
    title: rng.pick(TITLES),
    element,
    level,
    maxHp,
    hp: maxHp,
    atk,
    def,
    spd,
    isElite,
    entranceDialogue: rng.pick(TAUNTS),
    defeatDialogue: rng.pick(DEFEATS),
    lore: rng.pick(LORE),
  };
}
