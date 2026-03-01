import getDb from './db';

/* ---------------------------------------------------------------------------
 * Security Event Logger
 *
 * Writes structured security events to the `security_events` table for
 * incident response and audit trails.
 * ------------------------------------------------------------------------- */

export type SecurityEventType =
  | 'auth_failure'
  | 'rate_limit_exceeded'
  | 'challenge_failure'
  | 'invalid_api_key'
  | 'invalid_input';

export function logSecurityEvent(
  eventType: SecurityEventType,
  details: Record<string, unknown>,
  ip?: string,
): void {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO security_events (event_type, ip, details) VALUES (?, ?, ?)',
    ).run(eventType, ip ?? null, JSON.stringify(details));
  } catch {
    // Never let logging break the request
    console.error('[security-logger] Failed to log event:', eventType);
  }
}
