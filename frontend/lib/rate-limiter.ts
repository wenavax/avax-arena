import { NextRequest } from 'next/server';
import getDb from './db';
import { logSecurityEvent } from './security-logger';

/* ---------------------------------------------------------------------------
 * SQLite-backed Rate Limiter
 *
 * Persists across restarts/deploys. Uses the `rate_limits` table.
 * Prunes expired entries on each check.
 * ------------------------------------------------------------------------- */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const db = getDb();
  const now = Date.now();

  // Prune expired entries
  db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(now - windowMs);

  const row = db
    .prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
    .get(key) as { window_start: number; count: number } | undefined;

  if (!row || now - row.window_start >= windowMs) {
    // New window
    db.prepare(
      'INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)',
    ).run(key, now);
    return { allowed: true, remaining: max - 1, resetMs: windowMs };
  }

  if (row.count >= max) {
    const resetMs = windowMs - (now - row.window_start);
    logSecurityEvent('rate_limit_exceeded', { key, max, windowMs }, undefined);
    return { allowed: false, remaining: 0, resetMs };
  }

  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return {
    allowed: true,
    remaining: max - (row.count + 1),
    resetMs: windowMs - (now - row.window_start),
  };
}

/* ---------------------------------------------------------------------------
 * IP Extraction (anti-spoofing)
 *
 * Takes the *rightmost* IP from x-forwarded-for, which is the one added by
 * the nearest trusted reverse proxy. Falls back to x-real-ip, then 'unknown'.
 * ------------------------------------------------------------------------- */

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return req.headers.get('x-real-ip') || 'unknown';
}
