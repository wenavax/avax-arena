/**
 * CAR(D) GAME — server-side abuse guards for the staked-match API routes.
 * SERVER ONLY. In-memory (the mainnet frontend runs a single fork-mode PM2
 * process, so a process-local map is a valid limiter here).
 */
import 'server-only';
import { verifyMessage, type Address, type Hex } from 'viem';

// ── Rate limiting ────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Sliding fixed-window limiter. Returns true if allowed. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Best-effort client IP from proxy headers (nginx sets X-Real-IP / X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// ── Wallet-ownership proof ───────────────────────────────────────────────────

/** The message a player signs to prove they control `player` before staking. */
export function stakeMessage(player: Address, nonce: number): string {
  return `Frostbite CAR(D) GAME — authorize staked match\nplayer: ${player.toLowerCase()}\nnonce: ${nonce}`;
}

/** Verify the player actually signed the stake authorization (EIP-191). */
export async function verifyStakeSig(player: Address, nonce: number, signature: Hex): Promise<boolean> {
  try {
    return await verifyMessage({ address: player, message: stakeMessage(player, nonce), signature });
  } catch {
    return false;
  }
}

// ── Concurrency cap: one un-joined match per player ──────────────────────────

const openByPlayer = new Map<string, { matchId: Hex; at: number }>();
const OPEN_TTL = 15 * 60_000; // forget stale entries after 15 min

/** Reserve a create slot; refuse if the player already has a fresh un-joined match. */
export function reserveOpenMatch(player: Address, matchId: Hex): { ok: true } | { ok: false; existing: Hex } {
  const k = player.toLowerCase();
  const prev = openByPlayer.get(k);
  if (prev && Date.now() - prev.at < OPEN_TTL) return { ok: false, existing: prev.matchId };
  openByPlayer.set(k, { matchId, at: Date.now() });
  return { ok: true };
}

/** Release the reservation once the match is joined/played (or on failure). */
export function releaseOpenMatch(player: Address): void {
  openByPlayer.delete(player.toLowerCase());
}
