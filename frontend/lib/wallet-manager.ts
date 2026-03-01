import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import getDb from './db';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export interface StoredAgent {
  walletAddress: string;
  encryptedKey: string; // AES-256-GCM ciphertext (hex)
  iv: string;           // initialization vector (hex)
  authTag: string;      // GCM auth tag (hex)
  name: string;
  strategy: number;     // 0=Aggressive, 1=Defensive, 2=Analytical, 3=Random
  ownerAddress: string;
  createdAt: string;
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const ALGORITHM = 'aes-256-gcm';

/* ---------------------------------------------------------------------------
 * KDF — derive AES key via scrypt
 * ------------------------------------------------------------------------- */

let _derivedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_derivedKey) return _derivedKey;

  const raw = process.env.AGENT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('AGENT_ENCRYPTION_KEY environment variable is not set');
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) {
    throw new Error('AGENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  // Derive key via scrypt with fixed salt (raw key is already high-entropy)
  _derivedKey = crypto.scryptSync(buf, 'frostbite-agent-keys', 32);
  return _derivedKey;
}

/** Get the raw (non-KDF) key — only for migration of legacy data */
function getLegacyEncryptionKey(): Buffer {
  const raw = process.env.AGENT_ENCRYPTION_KEY;
  if (!raw) throw new Error('AGENT_ENCRYPTION_KEY environment variable is not set');
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) throw new Error('AGENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  return buf;
}

/* ---------------------------------------------------------------------------
 * Encryption helpers
 * ------------------------------------------------------------------------- */

function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return { ciphertext: encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function decryptLegacy(ciphertext: string, iv: string, authTag: string): string {
  const key = getLegacyEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/* ---------------------------------------------------------------------------
 * JSON → SQLite migration (one-time, read-only from agents.json)
 * ------------------------------------------------------------------------- */

let _migrated = false;

function migrateFromJsonIfNeeded(): void {
  if (_migrated) return;
  _migrated = true;

  if (!fs.existsSync(AGENTS_FILE)) return;

  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM agent_wallets').get() as { cnt: number };
  if (existing.cnt > 0) return; // Already have data in SQLite

  try {
    const raw = fs.readFileSync(AGENTS_FILE, 'utf-8');
    const store = JSON.parse(raw) as { agents: Array<{
      walletAddress: string; encryptedKey: string; iv: string; authTag: string;
      name: string; strategy: number; ownerAddress: string; createdAt: string;
    }> };

    const insert = db.prepare(
      `INSERT OR IGNORE INTO agent_wallets
       (wallet_address, encrypted_key, iv, auth_tag, name, strategy, owner_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const tx = db.transaction(() => {
      for (const a of store.agents) {
        // Re-encrypt with KDF key
        try {
          const plainKey = decryptLegacy(a.encryptedKey, a.iv, a.authTag);
          const { ciphertext, iv, authTag } = encrypt(plainKey);
          insert.run(a.walletAddress, ciphertext, iv, authTag, a.name, a.strategy, a.ownerAddress, a.createdAt);
        } catch {
          // If legacy decryption fails, store as-is (will fail on access)
          insert.run(a.walletAddress, a.encryptedKey, a.iv, a.authTag, a.name, a.strategy, a.ownerAddress, a.createdAt);
        }
      }
    });
    tx();
    console.log(`[wallet-manager] Migrated ${store.agents.length} agents from agents.json to SQLite`);
  } catch (err) {
    console.error('[wallet-manager] Migration from agents.json failed:', err);
  }
}

/* ---------------------------------------------------------------------------
 * SQLite store helpers
 * ------------------------------------------------------------------------- */

interface WalletRow {
  wallet_address: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  name: string;
  strategy: number;
  owner_address: string;
  created_at: string;
}

function rowToStoredAgent(row: WalletRow): StoredAgent {
  return {
    walletAddress: row.wallet_address,
    encryptedKey: row.encrypted_key,
    iv: row.iv,
    authTag: row.auth_tag,
    name: row.name,
    strategy: row.strategy,
    ownerAddress: row.owner_address,
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

/**
 * Generate a new agent wallet keypair, encrypt the private key, and store it.
 * Returns the wallet address (never the private key).
 */
export function generateAgentWallet(opts: {
  name: string;
  strategy: number;
  ownerAddress: string;
}): { walletAddress: string } {
  migrateFromJsonIfNeeded();

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const { ciphertext, iv, authTag } = encrypt(privateKey);

  const db = getDb();

  // Check duplicate wallet
  const dup = db.prepare('SELECT 1 FROM agent_wallets WHERE wallet_address = ?').get(
    account.address.toLowerCase(),
  );
  if (dup) {
    throw new Error('Wallet address collision detected. Please retry.');
  }

  // Check if owner already has an agent
  const ownerDup = db.prepare('SELECT 1 FROM agent_wallets WHERE owner_address = ?').get(
    opts.ownerAddress.toLowerCase(),
  );
  if (ownerDup) {
    throw new Error('Owner already has a registered agent');
  }

  db.prepare(
    `INSERT INTO agent_wallets
     (wallet_address, encrypted_key, iv, auth_tag, name, strategy, owner_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    account.address.toLowerCase(),
    ciphertext,
    iv,
    authTag,
    opts.name,
    opts.strategy,
    opts.ownerAddress.toLowerCase(),
    new Date().toISOString(),
  );

  return { walletAddress: account.address };
}

/**
 * Retrieve the viem Account for an agent by wallet address.
 * Decrypts the stored private key.
 */
export function getAgentAccount(walletAddress: string) {
  migrateFromJsonIfNeeded();

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM agent_wallets WHERE wallet_address = ?')
    .get(walletAddress.toLowerCase()) as WalletRow | undefined;

  if (!row) {
    throw new Error(`Agent wallet not found: ${walletAddress}`);
  }

  const privateKey = decrypt(row.encrypted_key, row.iv, row.auth_tag) as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

/**
 * Get stored agent metadata (no private key).
 */
export function getStoredAgent(walletAddress: string): StoredAgent | null {
  migrateFromJsonIfNeeded();

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM agent_wallets WHERE wallet_address = ?')
    .get(walletAddress.toLowerCase()) as WalletRow | undefined;

  return row ? rowToStoredAgent(row) : null;
}

/**
 * Get stored agent by owner address.
 */
export function getAgentByOwner(ownerAddress: string): StoredAgent | null {
  migrateFromJsonIfNeeded();

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM agent_wallets WHERE owner_address = ?')
    .get(ownerAddress.toLowerCase()) as WalletRow | undefined;

  return row ? rowToStoredAgent(row) : null;
}

/**
 * List all agent wallet addresses and metadata (no private keys).
 */
export function listAgents(): Omit<StoredAgent, 'encryptedKey' | 'iv' | 'authTag'>[] {
  migrateFromJsonIfNeeded();

  const db = getDb();
  const rows = db
    .prepare('SELECT wallet_address, name, strategy, owner_address, created_at FROM agent_wallets')
    .all() as Pick<WalletRow, 'wallet_address' | 'name' | 'strategy' | 'owner_address' | 'created_at'>[];

  return rows.map((r) => ({
    walletAddress: r.wallet_address,
    name: r.name,
    strategy: r.strategy,
    ownerAddress: r.owner_address,
    createdAt: r.created_at,
  }));
}
