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

/** Trusted client IP. nginx sets X-Real-IP := $remote_addr (the true peer),
 *  OVERWRITING any client value, so it is unspoofable through the proxy. We do
 *  NOT trust the leftmost X-Forwarded-For (fully client-controlled); if X-Real-IP
 *  is missing we take the RIGHTMOST XFF hop (closest to the proxy). */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const xf = req.headers.get('x-forwarded-for');
  if (xf) { const parts = xf.split(','); return parts[parts.length - 1].trim(); }
  return 'unknown';
}

/** Global breaker independent of caller identity — bounds how much operator gas
 *  ANY set of callers can burn per window (fresh-wallet spam defense). */
export function globalLimit(key: string, max: number, windowMs: number): boolean {
  return rateLimit(`global:${key}`, max, windowMs);
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
