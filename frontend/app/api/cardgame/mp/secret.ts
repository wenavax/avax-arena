import 'server-only';
import { timingSafeEqual } from 'crypto';

/**
 * Shared-secret gate for the server-to-server MP routes. The multiplayer server
 * (frostbite-mp) sends `x-cardgame-mp-secret`; only it and Next know the value,
 * so a browser can never reach createMatch/settle for a 4-player match. Timing-
 * safe compare. If CARDGAME_MP_SECRET is unset, the MP routes are closed.
 */
export function mpAuthorized(req: Request): boolean {
  const expected = process.env.CARDGAME_MP_SECRET;
  if (!expected) return false;
  const got = req.headers.get('x-cardgame-mp-secret') || '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}
