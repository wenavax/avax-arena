import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

interface AgentsStore {
  agents: StoredAgent[];
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const ALGORITHM = 'aes-256-gcm';

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function getEncryptionKey(): Buffer {
  const key = process.env.AGENT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('AGENT_ENCRYPTION_KEY environment variable is not set');
  }
  // Key must be 32 bytes (64 hex chars) for AES-256
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error('AGENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return buf;
}

function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function readStore(): AgentsStore {
  if (!fs.existsSync(AGENTS_FILE)) {
    return { agents: [] };
  }
  const raw = fs.readFileSync(AGENTS_FILE, 'utf-8');
  return JSON.parse(raw) as AgentsStore;
}

function writeStore(store: AgentsStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(store, null, 2), 'utf-8');
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
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const { ciphertext, iv, authTag } = encrypt(privateKey);

  const store = readStore();

  // Check duplicate wallet (extremely unlikely but safety check)
  if (store.agents.some((a) => a.walletAddress.toLowerCase() === account.address.toLowerCase())) {
    throw new Error('Wallet address collision detected. Please retry.');
  }

  // Check if owner already has an agent
  if (store.agents.some((a) => a.ownerAddress.toLowerCase() === opts.ownerAddress.toLowerCase())) {
    throw new Error('Owner already has a registered agent');
  }

  const agent: StoredAgent = {
    walletAddress: account.address,
    encryptedKey: ciphertext,
    iv,
    authTag,
    name: opts.name,
    strategy: opts.strategy,
    ownerAddress: opts.ownerAddress,
    createdAt: new Date().toISOString(),
  };

  store.agents.push(agent);
  writeStore(store);

  return { walletAddress: account.address };
}

/**
 * Retrieve the viem Account for an agent by wallet address.
 * Decrypts the stored private key.
 */
export function getAgentAccount(walletAddress: string) {
  const store = readStore();
  const agent = store.agents.find(
    (a) => a.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  );

  if (!agent) {
    throw new Error(`Agent wallet not found: ${walletAddress}`);
  }

  const privateKey = decrypt(agent.encryptedKey, agent.iv, agent.authTag) as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

/**
 * Get stored agent metadata (no private key).
 */
export function getStoredAgent(walletAddress: string): StoredAgent | null {
  const store = readStore();
  return (
    store.agents.find(
      (a) => a.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    ) ?? null
  );
}

/**
 * Get stored agent by owner address.
 */
export function getAgentByOwner(ownerAddress: string): StoredAgent | null {
  const store = readStore();
  return (
    store.agents.find(
      (a) => a.ownerAddress.toLowerCase() === ownerAddress.toLowerCase()
    ) ?? null
  );
}

/**
 * List all agent wallet addresses and metadata (no private keys).
 */
export function listAgents(): Omit<StoredAgent, 'encryptedKey' | 'iv' | 'authTag'>[] {
  const store = readStore();
  return store.agents.map(({ encryptedKey: _ek, iv: _iv, authTag: _at, ...rest }) => rest);
}
