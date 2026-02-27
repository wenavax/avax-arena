import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/* ---------------------------------------------------------------------------
 * Singleton SQLite connection
 * Persists across Next.js hot reloads via globalThis
 * ------------------------------------------------------------------------- */

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'frostbite.db');

const globalKey = '__frostbite_db__' as const;

function getDb(): Database.Database {
  if ((globalThis as Record<string, unknown>)[globalKey]) {
    return (globalThis as Record<string, unknown>)[globalKey] as Database.Database;
  }

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  migrate(db);

  (globalThis as Record<string, unknown>)[globalKey] = db;
  return db;
}

/* ---------------------------------------------------------------------------
 * Schema Migration
 * ------------------------------------------------------------------------- */

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id                TEXT PRIMARY KEY,
      wallet_address    TEXT UNIQUE NOT NULL,
      owner_address     TEXT NOT NULL,
      name              TEXT NOT NULL,
      strategy          INTEGER NOT NULL DEFAULT 2,
      strategy_name     TEXT NOT NULL DEFAULT 'Analytical',
      description       TEXT DEFAULT '',
      element           INTEGER,
      active            INTEGER NOT NULL DEFAULT 1,
      total_battles     INTEGER NOT NULL DEFAULT 0,
      wins              INTEGER NOT NULL DEFAULT 0,
      losses            INTEGER NOT NULL DEFAULT 0,
      draws             INTEGER NOT NULL DEFAULT 0,
      win_rate          REAL NOT NULL DEFAULT 0,
      total_staked      TEXT NOT NULL DEFAULT '0',
      total_earned      TEXT NOT NULL DEFAULT '0',
      profit            TEXT NOT NULL DEFAULT '0',
      messages_sent     INTEGER NOT NULL DEFAULT 0,
      nfts_minted       INTEGER NOT NULL DEFAULT 0,
      current_streak    INTEGER NOT NULL DEFAULT 0,
      best_streak       INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS battles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id         INTEGER UNIQUE,
      attacker_id       TEXT REFERENCES agents(id),
      defender_id       TEXT REFERENCES agents(id),
      attacker_wallet   TEXT,
      defender_wallet   TEXT,
      attacker_nft      INTEGER,
      defender_nft      INTEGER,
      winner_id         TEXT,
      winner_wallet     TEXT,
      stake             TEXT NOT NULL DEFAULT '0',
      attacker_element  INTEGER,
      defender_element  INTEGER,
      tx_hash           TEXT,
      status            TEXT NOT NULL DEFAULT 'pending',
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS activities (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT REFERENCES agents(id),
      agent_name        TEXT NOT NULL,
      type              TEXT NOT NULL,
      description       TEXT NOT NULL,
      element           INTEGER,
      tx_hash           TEXT,
      success           INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT REFERENCES agents(id),
      agent_name        TEXT NOT NULL,
      thread_id         INTEGER NOT NULL DEFAULT 0,
      content           TEXT NOT NULL,
      likes             INTEGER NOT NULL DEFAULT 0,
      tx_hash           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* Indexes for common queries */
    CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_address);
    CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_battles_attacker ON battles(attacker_id);
    CREATE INDEX IF NOT EXISTS idx_battles_defender ON battles(defender_id);
    CREATE INDEX IF NOT EXISTS idx_activities_agent ON activities(agent_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(thread_id);
  `);
}

export default getDb;
