import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import getDb from './db';
import { checkRateLimit } from './rate-limiter';
import { logSecurityEvent } from './security-logger';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export interface ApiKeyRecord {
  id: number;
  key_hash: string;
  key_prefix: string;
  agent_id: string;
  name: string;
  description: string;
  permissions: string;
  rate_limit_read: number;
  rate_limit_write: number;
  last_used_at: string | null;
  last_heartbeat: string | null;
  revoked: number;
  created_at: string;
  updated_at: string;
}

export interface AuthResult {
  valid: true;
  keyRecord: ApiKeyRecord;
  agentId: string;
}

export interface AuthError {
  valid: false;
  response: NextResponse;
}

/* ---------------------------------------------------------------------------
 * API Key Generation & Hashing
 * ------------------------------------------------------------------------- */

export function generateApiKey(): string {
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `fb_${randomPart}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function getKeyPrefix(key: string): string {
  return key.substring(0, 8); // "fb_xxxxx"
}

/* ---------------------------------------------------------------------------
 * Rate Limiting (SQLite-backed, per API key + operation)
 * ------------------------------------------------------------------------- */

const RATE_WINDOW_MS = 60_000;

function checkApiKeyRateLimit(
  keyHash: string,
  operation: 'read' | 'write',
  maxRead: number,
  maxWrite: number,
): { allowed: boolean; remaining: number; resetMs: number } {
  const max = operation === 'read' ? maxRead : maxWrite;
  return checkRateLimit(`apikey:${operation}:${keyHash}`, max, RATE_WINDOW_MS);
}

/* ---------------------------------------------------------------------------
 * Security Headers
 * ------------------------------------------------------------------------- */

function secHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

/* ---------------------------------------------------------------------------
 * Bearer Token Authentication
 * ------------------------------------------------------------------------- */

export function authenticateRequest(
  req: NextRequest,
  operation: 'read' | 'write',
): AuthResult | AuthError {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logSecurityEvent('auth_failure', { reason: 'missing_auth_header' });
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Missing or invalid Authorization header. Use: Bearer fb_xxx', code: 'AUTH_REQUIRED' },
        { status: 401, headers: secHeaders() },
      ),
    };
  }

  const token = authHeader.substring(7);
  if (!token.startsWith('fb_')) {
    logSecurityEvent('auth_failure', { reason: 'invalid_key_format' });
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Invalid API key format. Keys start with fb_', code: 'INVALID_KEY_FORMAT' },
        { status: 401, headers: secHeaders() },
      ),
    };
  }

  const hash = hashApiKey(token);
  const db = getDb();
  const record = db
    .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0')
    .get(hash) as ApiKeyRecord | undefined;

  if (!record) {
    logSecurityEvent('invalid_api_key', { prefix: token.substring(0, 8) });
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Invalid or revoked API key', code: 'INVALID_KEY' },
        { status: 401, headers: secHeaders() },
      ),
    };
  }

  // Permission check
  const perms = record.permissions.split(',');
  if (!perms.includes(operation)) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: `API key does not have '${operation}' permission`, code: 'INSUFFICIENT_PERMISSIONS' },
        { status: 403, headers: secHeaders() },
      ),
    };
  }

  // Rate limit
  const rateCheck = checkApiKeyRateLimit(record.key_hash, operation, record.rate_limit_read, record.rate_limit_write);
  if (!rateCheck.allowed) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED', retryAfterMs: rateCheck.resetMs },
        {
          status: 429,
          headers: {
            ...secHeaders(),
            'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        },
      ),
    };
  }

  // Update last_used_at
  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(record.id);

  return { valid: true, keyRecord: record, agentId: record.agent_id };
}
