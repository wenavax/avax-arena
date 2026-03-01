import crypto from 'crypto';
import getDb from '@/lib/db';
import { logSecurityEvent } from '@/lib/security-logger';

/* ---------------------------------------------------------------------------
 * SQLite-backed challenge store
 *
 * Challenges are stored in the `challenges` table so both the challenge
 * and register route handlers share the same data, regardless of how
 * Next.js bundles or isolates route modules.
 * ------------------------------------------------------------------------- */

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

function pruneExpired() {
  const db = getDb();
  db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(Date.now());
}

/* Verify and consume a challenge (timing-safe, max 3 attempts) */
export function verifyChallenge(challengeId: string, answer: number): boolean {
  pruneExpired();
  const db = getDb();
  const row = db.prepare('SELECT answer, attempts FROM challenges WHERE id = ?').get(challengeId) as
    | { answer: number; attempts: number }
    | undefined;

  if (!row) return false;

  // Too many attempts — delete and reject
  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);
    logSecurityEvent('challenge_failure', { challengeId, reason: 'max_attempts_exceeded' });
    return false;
  }

  // Increment attempts
  db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(challengeId);

  // Timing-safe comparison
  const expected = Buffer.from(String(row.answer));
  const provided = Buffer.from(String(answer));

  let match: boolean;
  if (expected.length !== provided.length) {
    match = false;
    // Still run timingSafeEqual to avoid timing leak on length
    crypto.timingSafeEqual(expected, Buffer.alloc(expected.length));
  } else {
    match = crypto.timingSafeEqual(expected, provided);
  }

  if (match) {
    // Consume challenge (one-time use on success)
    db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);
    return true;
  }

  // Check if this was the last attempt
  if (row.attempts + 1 >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);
    logSecurityEvent('challenge_failure', { challengeId, reason: 'max_attempts_failed' });
  }

  return false;
}

/* Create a new challenge and return its ID + question text */
export function createChallenge(): { challengeId: string; question: string } {
  pruneExpired();

  const ops = ['+', '-', '*'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];

  let a: number, b: number, answer: number;

  switch (op) {
    case '+':
      // 3-digit numbers: answer space ~200-1998
      a = Math.floor(Math.random() * 900) + 100;
      b = Math.floor(Math.random() * 900) + 100;
      answer = a + b;
      break;
    case '-':
      // 3-digit numbers, ensure positive result
      a = Math.floor(Math.random() * 900) + 100;
      b = Math.floor(Math.random() * a);
      answer = a - b;
      break;
    case '*':
      // Larger multipliers: answer space ~200-9801
      a = Math.floor(Math.random() * 90) + 10;
      b = Math.floor(Math.random() * 90) + 10;
      answer = a * b;
      break;
  }

  const challengeId = crypto.randomUUID();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const db = getDb();
  db.prepare('INSERT INTO challenges (id, answer, attempts, expires_at) VALUES (?, ?, 0, ?)').run(
    challengeId,
    answer!,
    expiresAt,
  );

  return { challengeId, question: `What is ${a!} ${op} ${b!}?` };
}
