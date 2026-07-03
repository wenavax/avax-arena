// ─── AI-authored boss flavor (progressive enhancement, never a dependency) ───
// Claude authors the *identity* of each floor boss (name/title/lore/dialogue).
// Combat stats stay 100% deterministic (see bosses.ts / combat.ts): this layer
// only ever overwrites flavor fields, so a run's depth/reward is identical with
// or without AI. If the endpoint is unconfigured, slow, or errors, callers fall
// back to the procedural flavor already baked into each FloorBoss.
import type { Element } from '../elements';
import type { FloorBoss, BossFlavor } from './types';
import { bossForFloor } from './bosses';

/** The deterministic descriptors we hand to Claude so its flavor *matches* the
 *  mechanical boss (a Shadow elite reads menacing, a Light early boss reads
 *  radiant). Stats are intentionally omitted — the client already owns them. */
export interface BossSkeleton {
  floor: number;
  element: Element;
  level: number;
  isElite: boolean;
}

/**
 * Pre-compute every floor's boss skeleton for a run, without mutating run state.
 * Reuses the exact engine function the run uses, so descriptors match 1:1.
 * `partyPower` is constant across a run (relics never add warriors).
 */
export function previewBossSkeletons(seed: string, partyPower: number, maxFloors: number): BossSkeleton[] {
  const out: BossSkeleton[] = [];
  for (let floor = 1; floor <= maxFloors; floor++) {
    const b = bossForFloor(seed, floor, partyPower);
    out.push({ floor, element: b.element, level: b.level, isElite: b.isElite });
  }
  return out;
}

/**
 * Merge AI flavor onto a boss. ONLY identity fields are replaced — element and
 * every combat stat are preserved, which is what keeps the run deterministic.
 */
export function applyFlavor(boss: FloorBoss, flavor?: BossFlavor): FloorBoss {
  if (!flavor) return boss;
  return {
    ...boss,
    name: flavor.name || boss.name,
    title: flavor.title || boss.title,
    lore: flavor.lore || boss.lore,
    entranceDialogue: flavor.entranceDialogue || boss.entranceDialogue,
    defeatDialogue: flavor.defeatDialogue || boss.defeatDialogue,
  };
}

// basePath is '/avalanche' on web (see next.config.mjs); matches the existing
// /pve-test call convention. On the mobile Capacitor build (basePath '') this
// absolute path won't reach the API, so mobile simply falls back to procedural
// boss text (fetchBossFlavors swallows the failure) — AI flavor is web-only.
const AI_BATCH_URL = '/avalanche/api/v1/ai-enemy/batch';

interface BatchResponse {
  flavors?: Array<Partial<BossFlavor> & { floor?: number }>;
  degraded?: boolean;
}

function isFlavor(x: Partial<BossFlavor> & { floor?: number }): x is BossFlavor & { floor: number } {
  return (
    typeof x?.floor === 'number' &&
    typeof x.name === 'string' && x.name.length > 0 &&
    typeof x.title === 'string' &&
    typeof x.entranceDialogue === 'string'
  );
}

/**
 * Fetch a whole run's boss flavor in one request. NEVER throws and NEVER blocks
 * gameplay: any failure (no key/503, network, non-JSON, partial) resolves to an
 * empty (or partial) map, and callers keep the procedural boss text.
 */
export async function fetchBossFlavors(
  seed: string,
  skeletons: BossSkeleton[],
  signal?: AbortSignal,
): Promise<Record<number, BossFlavor>> {
  const map: Record<number, BossFlavor> = {};
  try {
    const res = await fetch(AI_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, bosses: skeletons }),
      signal,
    });
    if (!res.ok) return map; // 503 (no key), 5xx, etc. -> procedural fallback
    const data = (await res.json()) as BatchResponse;
    for (const f of data.flavors ?? []) {
      if (isFlavor(f)) {
        map[f.floor] = {
          name: f.name,
          title: f.title,
          lore: typeof f.lore === 'string' ? f.lore : '',
          entranceDialogue: f.entranceDialogue,
          defeatDialogue: typeof f.defeatDialogue === 'string' ? f.defeatDialogue : '',
        };
      }
    }
  } catch {
    // AbortError / network / parse — swallow; procedural flavor is the fallback.
  }
  return map;
}
