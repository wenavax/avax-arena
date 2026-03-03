import getDb from './db';
import { hashApiKey, getKeyPrefix, type ApiKeyRecord } from './api-auth';

/* ---------------------------------------------------------------------------
 * API Key CRUD
 * ------------------------------------------------------------------------- */

export function createApiKey(data: {
  keyPlaintext: string;
  agentId: string;
  name: string;
  description: string;
}): ApiKeyRecord {
  const db = getDb();
  const hash = hashApiKey(data.keyPlaintext);
  const prefix = getKeyPrefix(data.keyPlaintext);

  db.prepare(`
    INSERT INTO api_keys (key_hash, key_prefix, agent_id, name, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(hash, prefix, data.agentId, data.name, data.description);

  return db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash) as ApiKeyRecord;
}

export function getApiKeyByAgent(agentId: string): ApiKeyRecord | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM api_keys WHERE agent_id = ? AND revoked = 0').get(agentId) as
      | ApiKeyRecord
      | undefined) ?? null
  );
}

export function revokeApiKey(agentId: string): void {
  const db = getDb();
  db.prepare("UPDATE api_keys SET revoked = 1, updated_at = datetime('now') WHERE agent_id = ?").run(agentId);
}

export function updateHeartbeat(agentId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE api_keys SET last_heartbeat = datetime('now'), updated_at = datetime('now') WHERE agent_id = ? AND revoked = 0",
  ).run(agentId);
}
