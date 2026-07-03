import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// ─── Batch boss-flavor generator for Frostbite Expeditions ───
// One Claude call authors the *identity* (name/title/lore/dialogue) of every
// floor boss in a run. It never returns stats — the client owns those and they
// stay deterministic, so this endpoint can fail freely without affecting play.
// Cached per seed so a given run's bosses are stable and only cost one call.

const ELEMENTS = new Set(['fire', 'water', 'wind', 'ice', 'earth', 'thunder', 'shadow', 'light']);
const MAX_FLOORS = 20;   // per-run processing cap
const MAX_BOSSES = 100;  // reject absurdly large batches outright

interface BossSkeleton {
  floor: number;
  element: string;
  level: number;
  isElite: boolean;
}
interface BossFlavor {
  floor: number;
  name: string;
  title: string;
  lore: string;
  entranceDialogue: string;
  defeatDialogue: string;
}

// Module-level cache (PM2 runs a single fork instance — see project memory).
// Keyed on seed alone: clients generate a unique seed per run, so a seed maps to
// one skeleton set in practice. Reusing a seed with a different party returns the
// first run's names (cosmetic only — never a stat/determinism issue).
const CACHE = new Map<string, Record<number, BossFlavor>>();
const CACHE_MAX = 300;

function cacheGet(seed: string): Record<number, BossFlavor> | undefined {
  return CACHE.get(seed);
}
function cachePut(seed: string, flavors: Record<number, BossFlavor>): void {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(seed, flavors);
}

// ─── Abuse guards (in-memory; single fork instance) ───
const MAX_BODY_BYTES = 32 * 1024;
const PER_IP_MAX = 12;                        // requests / window / IP
const PER_IP_WINDOW_MS = 5 * 60 * 1000;
const GLOBAL_CALL_MAX = 400;                  // hard ceiling on real Claude calls / rolling day
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

const ipHits = new Map<string, number[]>();
let claudeCalls: number[] = [];

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser / same-origin without Origin — still rate-limited below
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

function ipRateLimited(ip: string, now: number): boolean {
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) {
    const k = ipHits.keys().next().value;
    if (k !== undefined) ipHits.delete(k);
  }
  return hits.length > PER_IP_MAX;
}

function globalBudgetExceeded(now: number): boolean {
  claudeCalls = claudeCalls.filter((t) => now - t < GLOBAL_WINDOW_MS);
  return claudeCalls.length >= GLOBAL_CALL_MAX;
}

function sanitize(raw: unknown): { seed: string; bosses: BossSkeleton[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const seed = (raw as any).seed;
  const bosses = (raw as any).bosses;
  if (typeof seed !== 'string' || !seed || seed.length > 128) return null;
  if (!Array.isArray(bosses) || bosses.length === 0 || bosses.length > MAX_BOSSES) return null;
  const clean: BossSkeleton[] = [];
  for (const b of bosses.slice(0, MAX_FLOORS)) {
    const floor = Number(b?.floor);
    const element = String(b?.element || '').toLowerCase();
    const level = Math.max(1, Math.min(100, Math.round(Number(b?.level) || 1)));
    if (!Number.isInteger(floor) || floor < 1 || floor > 999) continue;
    clean.push({
      floor,
      element: ELEMENTS.has(element) ? element : 'ice',
      level,
      isElite: Boolean(b?.isElite),
    });
  }
  if (clean.length === 0) return null;
  return { seed, bosses: clean };
}

const SYSTEM_PROMPT = `You are the lead narrative designer for "Frostbite Expeditions", a roguelike descent into a frozen abyss on the Avalanche chain. A squad descends floor by floor; each floor is guarded by one boss. Your job is to author the IDENTITY of each floor's boss — nothing mechanical.

Voice: cold, mythic, menacing, terse. Think ice-locked gods, thawed horrors, and things frozen mid-scream. Deeper floors and "elite" bosses are grander and more dreadful. Match each boss's ELEMENT thematically (e.g. shadow = umbral/void, light = searing/radiant, thunder = stormcalled).

For EACH requested floor return an object with:
- name: the boss's proper name, 1-3 words, evocative and unique (no numbers)
- title: a short epithet, e.g. "the Frozen Warden", "of the Deep Thaw"
- lore: ONE sentence of backstory
- entranceDialogue: a threatening one-liner it speaks on arrival
- defeatDialogue: a dying one-liner

Every name must be distinct across the whole run. Do NOT include stats, HP, or numbers. Respond with ONLY a valid JSON array (no markdown, no prose), one object per floor in the order given, each including its "floor" number.`;

function buildPrompt(bosses: BossSkeleton[]): string {
  const lines = bosses
    .map((b) => `Floor ${b.floor}: element=${b.element}, depthLevel=${b.level}${b.isElite ? ', ELITE (make it a dread mini-boss)' : ''}`)
    .join('\n');
  return `Author bosses for these ${bosses.length} floors of one expedition:\n${lines}\n\nReturn a JSON array of ${bosses.length} objects: [{ "floor", "name", "title", "lore", "entranceDialogue", "defeatDialogue" }].`;
}

function parseFlavors(text: string, requested: Set<number>): BossFlavor[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  // Grab the outermost array if the model added stray prose.
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  const json = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => ({ ...x, floor: Number(x?.floor) }))
    // Only accept well-formed entries whose floor was actually requested — a
    // hallucinated/float/out-of-range floor is dropped, never cached.
    .filter((x) => typeof x.name === 'string' && Number.isInteger(x.floor) && requested.has(x.floor))
    .map((x) => ({
      floor: x.floor,
      name: String(x.name).slice(0, 60),
      title: String(x.title ?? '').slice(0, 80),
      lore: String(x.lore ?? '').slice(0, 240),
      entranceDialogue: String(x.entranceDialogue ?? '').slice(0, 160),
      defeatDialogue: String(x.defeatDialogue ?? '').slice(0, 160),
    }));
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured', degraded: true }, { status: 503 });
  }

  // Abuse guards: browser-only endpoint, so gate on origin + rate limit + budget.
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden', degraded: true }, { status: 403 });
  }
  const now = Date.now();
  if (ipRateLimited(clientIp(request), now)) {
    return NextResponse.json({ error: 'Rate limited', degraded: true }, { status: 429 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large', degraded: true }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', degraded: true }, { status: 400 });
  }

  const input = sanitize(payload);
  if (!input) {
    return NextResponse.json({ error: 'Invalid boss batch', degraded: true }, { status: 400 });
  }
  const { seed, bosses } = input;
  const requested = new Set(bosses.map((b) => b.floor));

  // Cache hit: return the whole run's flavor, stable per seed (no Claude call).
  const cached = cacheGet(seed);
  if (cached && bosses.every((b) => cached[b.floor])) {
    return NextResponse.json({
      flavors: bosses.map((b) => cached[b.floor]),
      generatedBy: 'cache',
      cached: true,
    });
  }

  // Cache miss => a real, billable Claude call. Enforce the global daily ceiling.
  if (globalBudgetExceeded(now)) {
    return NextResponse.json({ error: 'AI temporarily unavailable', degraded: true }, { status: 503 });
  }
  claudeCalls.push(now);

  try {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: Math.min(2400, 220 + bosses.length * 130),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(bosses) }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      return NextResponse.json({ error: 'AI generation failed', degraded: true }, { status: 502 });
    }

    const flavors = parseFlavors(block.text, requested);
    if (flavors.length === 0) {
      return NextResponse.json({ error: 'AI generation failed', degraded: true }, { status: 502 });
    }

    const map: Record<number, BossFlavor> = { ...(cached ?? {}) };
    for (const f of flavors) map[f.floor] = f;
    cachePut(seed, map);

    return NextResponse.json({
      flavors: bosses.map((b) => map[b.floor]).filter(Boolean),
      generatedBy: 'claude-sonnet-4-6',
      cached: false,
    });
  } catch (err: any) {
    // Log the real cause server-side; never leak the upstream error surface.
    console.error('[ai-enemy/batch] generation failed:', err?.message || err);
    return NextResponse.json({ error: 'AI generation failed', degraded: true }, { status: 502 });
  }
}
