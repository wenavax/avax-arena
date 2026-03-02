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

    /* --- Marketplace Tables --- */

    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id          INTEGER NOT NULL,
      seller            TEXT NOT NULL,
      price             TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'fixed',
      status            TEXT NOT NULL DEFAULT 'active',
      tx_hash           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketplace_bids (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id        INTEGER REFERENCES marketplace_listings(id),
      token_id          INTEGER NOT NULL,
      bidder            TEXT NOT NULL,
      amount            TEXT NOT NULL,
      tx_hash           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketplace_offers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id          INTEGER NOT NULL,
      offerer           TEXT NOT NULL,
      amount            TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active',
      tx_hash           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketplace_sales (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id          INTEGER NOT NULL,
      seller            TEXT NOT NULL,
      buyer             TEXT NOT NULL,
      price             TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'fixed',
      tx_hash           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* --- Agent Decisions (Claude reasoning log) --- */

    CREATE TABLE IF NOT EXISTS agent_decisions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT NOT NULL REFERENCES agents(id),
      action            TEXT NOT NULL,
      reasoning         TEXT NOT NULL DEFAULT '',
      game_state_summary TEXT DEFAULT '{}',
      battle_id         INTEGER,
      token_id          INTEGER,
      stake_amount      TEXT,
      success           INTEGER NOT NULL DEFAULT 1,
      tx_hash           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* --- Agent Personalities --- */

    CREATE TABLE IF NOT EXISTS agent_personalities (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT UNIQUE NOT NULL REFERENCES agents(id),
      bio               TEXT NOT NULL DEFAULT '',
      catchphrase       TEXT NOT NULL DEFAULT '',
      personality_type  TEXT NOT NULL DEFAULT 'analytical',
      avatar_seed       TEXT NOT NULL DEFAULT '',
      avatar_gradient   TEXT NOT NULL DEFAULT 'from-frost-cyan to-frost-purple',
      taunt_style       TEXT NOT NULL DEFAULT 'calm',
      rival_agent_id    TEXT,
      favorite_element  TEXT NOT NULL DEFAULT 'Fire',
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* --- Live Events (lightweight event stream) --- */

    CREATE TABLE IF NOT EXISTS live_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type        TEXT NOT NULL,
      agent_id          TEXT,
      agent_name        TEXT,
      opponent_id       TEXT,
      opponent_name     TEXT,
      data              TEXT DEFAULT '{}',
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
    CREATE INDEX IF NOT EXISTS idx_mp_listings_status ON marketplace_listings(status);
    CREATE INDEX IF NOT EXISTS idx_mp_listings_seller ON marketplace_listings(seller);
    CREATE INDEX IF NOT EXISTS idx_mp_listings_token ON marketplace_listings(token_id);
    CREATE INDEX IF NOT EXISTS idx_mp_bids_token ON marketplace_bids(token_id);
    CREATE INDEX IF NOT EXISTS idx_mp_bids_listing ON marketplace_bids(listing_id);
    CREATE INDEX IF NOT EXISTS idx_mp_offers_token ON marketplace_offers(token_id);
    CREATE INDEX IF NOT EXISTS idx_mp_offers_status ON marketplace_offers(status);
    CREATE INDEX IF NOT EXISTS idx_mp_sales_created ON marketplace_sales(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_agent ON agent_decisions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_created ON agent_decisions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_personalities_agent ON agent_personalities(agent_id);
    CREATE INDEX IF NOT EXISTS idx_live_events_created ON live_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_events_type ON live_events(event_type);

    /* --- API Keys (external agent auth) --- */

    CREATE TABLE IF NOT EXISTS api_keys (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash          TEXT UNIQUE NOT NULL,
      key_prefix        TEXT NOT NULL,
      agent_id          TEXT NOT NULL REFERENCES agents(id),
      name              TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      permissions       TEXT NOT NULL DEFAULT 'read,write',
      rate_limit_read   INTEGER NOT NULL DEFAULT 60,
      rate_limit_write  INTEGER NOT NULL DEFAULT 30,
      last_used_at      TEXT,
      last_heartbeat    TEXT,
      revoked           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_agent ON api_keys(agent_id);

    /* --- Challenges (math verification for registration) --- */

    CREATE TABLE IF NOT EXISTS challenges (
      id          TEXT PRIMARY KEY,
      answer      INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      expires_at  INTEGER NOT NULL
    );

    /* --- Rate Limits (SQLite-backed, survives restarts) --- */

    CREATE TABLE IF NOT EXISTS rate_limits (
      key           TEXT PRIMARY KEY,
      window_start  INTEGER NOT NULL,
      count         INTEGER NOT NULL
    );

    /* --- Agent Wallets (replaces agents.json file I/O) --- */

    CREATE TABLE IF NOT EXISTS agent_wallets (
      wallet_address  TEXT PRIMARY KEY,
      encrypted_key   TEXT NOT NULL,
      iv              TEXT NOT NULL,
      auth_tag        TEXT NOT NULL,
      name            TEXT NOT NULL,
      strategy        INTEGER NOT NULL DEFAULT 2,
      owner_address   TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_wallets_owner ON agent_wallets(owner_address);

    /* --- Agent Daily Spending (persists across restarts) --- */

    CREATE TABLE IF NOT EXISTS agent_daily_spending (
      agent_wallet  TEXT NOT NULL,
      date          TEXT NOT NULL,
      spent_wei     TEXT NOT NULL DEFAULT '0',
      PRIMARY KEY (agent_wallet, date)
    );

    /* --- Agent Funding (faucet daily limits) --- */

    CREATE TABLE IF NOT EXISTS agent_funding (
      agent_wallet  TEXT NOT NULL,
      date          TEXT NOT NULL,
      funded_wei    TEXT DEFAULT '0',
      PRIMARY KEY (agent_wallet, date)
    );

    /* --- Agent Loop State (PM2 restart recovery) --- */

    CREATE TABLE IF NOT EXISTS agent_loop_state (
      agent_wallet  TEXT PRIMARY KEY,
      running       INTEGER DEFAULT 0,
      last_tick     TEXT,
      stopped_at    TEXT
    );

    /* --- Tournaments --- */

    CREATE TABLE IF NOT EXISTS tournaments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      status        TEXT DEFAULT 'upcoming',
      entry_fee     TEXT DEFAULT '0.01',
      max_players   INTEGER DEFAULT 8,
      prize_pool    TEXT DEFAULT '0',
      start_at      TEXT NOT NULL,
      end_at        TEXT,
      winner_id     TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id INTEGER NOT NULL,
      agent_id      TEXT NOT NULL,
      score         INTEGER DEFAULT 0,
      wins          INTEGER DEFAULT 0,
      losses        INTEGER DEFAULT 0,
      joined_at     TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
    CREATE INDEX IF NOT EXISTS idx_tournaments_start ON tournaments(start_at);
    CREATE INDEX IF NOT EXISTS idx_tournament_participants_agent ON tournament_participants(agent_id);

    /* --- Security Events (structured audit log) --- */

    CREATE TABLE IF NOT EXISTS security_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type  TEXT NOT NULL,
      ip          TEXT,
      details     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);

    /* --- Notifications --- */

    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id    TEXT NOT NULL REFERENCES agents(id),
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      message     TEXT NOT NULL DEFAULT '',
      data        TEXT,
      read        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_agent ON notifications(agent_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(agent_id, read);

    /* --- Feed Likes --- */

    CREATE TABLE IF NOT EXISTS feed_likes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id    INTEGER NOT NULL,
      agent_id    TEXT NOT NULL REFERENCES agents(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_feed_likes_event ON feed_likes(event_id);
    CREATE INDEX IF NOT EXISTS idx_feed_likes_agent ON feed_likes(agent_id);

    /* --- Agent Follows --- */

    CREATE TABLE IF NOT EXISTS agent_follows (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id     TEXT NOT NULL REFERENCES agents(id),
      following_id    TEXT NOT NULL REFERENCES agents(id),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(follower_id, following_id)
    );

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON agent_follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON agent_follows(following_id);
  `);

  // Add new columns to agents table (safe ALTER — ignores if already exists)
  // --- New tables for achievements, seasons, referrals, merges, agent marketplace ---

  db.exec(`
    /* --- Achievements --- */
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'trophy',
      rarity TEXT NOT NULL DEFAULT 'common',
      xp_reward INTEGER DEFAULT 0,
      requirement_type TEXT NOT NULL,
      requirement_value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_achievements (
      agent_id TEXT NOT NULL REFERENCES agents(id),
      achievement_id TEXT NOT NULL REFERENCES achievements(id),
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, achievement_id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_achievements_agent ON agent_achievements(agent_id);

    /* --- Seasons --- */
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      number INTEGER NOT NULL,
      status TEXT DEFAULT 'upcoming',
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      reward_pool TEXT DEFAULT '0',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS season_snapshots (
      season_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      elo_start INTEGER DEFAULT 1200,
      elo_end INTEGER,
      rank INTEGER,
      battles INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      xp_earned INTEGER DEFAULT 0,
      reward TEXT DEFAULT '0',
      PRIMARY KEY (season_id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
    CREATE INDEX IF NOT EXISTS idx_season_snapshots_season ON season_snapshots(season_id);

    /* --- Referrals --- */
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id TEXT NOT NULL REFERENCES agents(id),
      referee_id TEXT NOT NULL REFERENCES agents(id),
      bonus_xp INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(referee_id)
    );

    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

    /* --- Warrior Merges --- */
    CREATE TABLE IF NOT EXISTS warrior_merges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      token_id_1 INTEGER NOT NULL,
      token_id_2 INTEGER NOT NULL,
      result_token_id INTEGER,
      element_1 INTEGER,
      element_2 INTEGER,
      result_element INTEGER,
      tx_hash TEXT,
      success INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_merges_agent ON warrior_merges(agent_id);

    /* --- Agent Listings (agent marketplace) --- */
    CREATE TABLE IF NOT EXISTS agent_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      seller_address TEXT NOT NULL,
      price TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      buyer_address TEXT,
      tx_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      sold_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_agent_listings_status ON agent_listings(status);
    CREATE INDEX IF NOT EXISTS idx_agent_listings_agent ON agent_listings(agent_id);
  `);

  const alterStatements = [
    "ALTER TABLE agents ADD COLUMN last_active_at TEXT",
    "ALTER TABLE agents ADD COLUMN total_decisions INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN favorite_action TEXT DEFAULT 'wait'",
    "ALTER TABLE challenges ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0",
    // Modül 1: ELO
    "ALTER TABLE agents ADD COLUMN elo_rating INTEGER DEFAULT 1200",
    // Modül 2: XP/Level
    "ALTER TABLE agents ADD COLUMN xp INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN level INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN prestige INTEGER DEFAULT 0",
    // Modül 5: Referral
    "ALTER TABLE agents ADD COLUMN referral_code TEXT",
    "ALTER TABLE agents ADD COLUMN referred_by TEXT",
  ];
  for (const sql of alterStatements) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

export default getDb;
