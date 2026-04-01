import getDb from './db';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export interface DbAgent {
  id: string;
  wallet_address: string;
  owner_address: string;
  name: string;
  strategy: number;
  strategy_name: string;
  description: string;
  element: number | null;
  active: number;
  total_battles: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  total_staked: string;
  total_earned: string;
  profit: string;
  messages_sent: number;
  nfts_minted: number;
  current_streak: number;
  best_streak: number;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
  total_decisions: number;
  favorite_action: string;
  elo_rating: number;
  xp: number;
  level: number;
  prestige: number;
  referral_code: string | null;
  referred_by: string | null;
}

export interface DbDecision {
  id: number;
  agent_id: string;
  action: string;
  reasoning: string;
  game_state_summary: string;
  battle_id: number | null;
  token_id: number | null;
  stake_amount: string | null;
  success: number;
  tx_hash: string | null;
  created_at: string;
}

export interface DbPersonality {
  id: number;
  agent_id: string;
  bio: string;
  catchphrase: string;
  personality_type: string;
  avatar_seed: string;
  avatar_gradient: string;
  taunt_style: string;
  rival_agent_id: string | null;
  favorite_element: string;
  created_at: string;
  updated_at: string;
}

export interface DbLiveEvent {
  id: number;
  event_type: string;
  agent_id: string | null;
  agent_name: string | null;
  opponent_id: string | null;
  opponent_name: string | null;
  data: string;
  created_at: string;
}

export interface DbActivity {
  id: number;
  agent_id: string;
  agent_name: string;
  type: string;
  description: string;
  element: number | null;
  tx_hash: string | null;
  success: number;
  created_at: string;
}

export interface DbBattle {
  id: number;
  battle_id: number | null;
  attacker_id: string | null;
  defender_id: string | null;
  attacker_wallet: string | null;
  defender_wallet: string | null;
  attacker_nft: number | null;
  defender_nft: number | null;
  winner_id: string | null;
  winner_wallet: string | null;
  stake: string;
  attacker_element: number | null;
  defender_element: number | null;
  tx_hash: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export interface DbChatMessage {
  id: number;
  agent_id: string | null;
  agent_name: string;
  thread_id: number;
  content: string;
  likes: number;
  tx_hash: string | null;
  created_at: string;
}

/* ---------------------------------------------------------------------------
 * Marketplace Types
 * ------------------------------------------------------------------------- */

export interface DbMarketplaceListing {
  id: number;
  token_id: number;
  seller: string;
  price: string;
  type: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMarketplaceBid {
  id: number;
  listing_id: number | null;
  token_id: number;
  bidder: string;
  amount: string;
  tx_hash: string | null;
  created_at: string;
}

export interface DbMarketplaceOffer {
  id: number;
  token_id: number;
  offerer: string;
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export interface DbMarketplaceSale {
  id: number;
  token_id: number;
  seller: string;
  buyer: string;
  price: string;
  type: string;
  tx_hash: string | null;
  created_at: string;
}

const STRATEGY_NAMES = ['Aggressive', 'Defensive', 'Analytical', 'Random'];

/* ---------------------------------------------------------------------------
 * Agents
 * ------------------------------------------------------------------------- */

export function createAgent(data: {
  walletAddress: string;
  ownerAddress: string;
  name: string;
  strategy: number;
}): DbAgent {
  const db = getDb();
  const id = `agent_${data.walletAddress.slice(2, 10).toLowerCase()}`;
  const strategyName = STRATEGY_NAMES[data.strategy] ?? 'Analytical';

  db.prepare(`
    INSERT INTO agents (id, wallet_address, owner_address, name, strategy, strategy_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.walletAddress.toLowerCase(), data.ownerAddress.toLowerCase(), data.name, data.strategy, strategyName);

  return getAgentById(id)!;
}

export function getAgentById(id: string): DbAgent | null {
  const db = getDb();
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as DbAgent | null;
}

export function getAgentByWallet(walletAddress: string): DbAgent | null {
  const db = getDb();
  return db.prepare('SELECT * FROM agents WHERE wallet_address = ?').get(walletAddress.toLowerCase()) as DbAgent | null;
}

export function getAgentByOwner(ownerAddress: string): DbAgent | null {
  const db = getDb();
  return db.prepare('SELECT * FROM agents WHERE owner_address = ?').get(ownerAddress.toLowerCase()) as DbAgent | null;
}

export function listAgents(limit = 50, offset = 0): { agents: DbAgent[]; total: number } {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM agents ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as DbAgent[];
  const { total } = db.prepare('SELECT COUNT(*) as total FROM agents').get() as { total: number };
  return { agents, total };
}

export function updateAgent(id: string, data: Partial<{
  strategy: number;
  description: string;
  active: boolean;
  element: number;
}>): DbAgent | null {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.strategy !== undefined) {
    sets.push('strategy = ?', 'strategy_name = ?');
    values.push(data.strategy, STRATEGY_NAMES[data.strategy] ?? 'Analytical');
  }
  if (data.description !== undefined) {
    sets.push('description = ?');
    values.push(data.description);
  }
  if (data.active !== undefined) {
    sets.push('active = ?');
    values.push(data.active ? 1 : 0);
  }
  if (data.element !== undefined) {
    sets.push('element = ?');
    values.push(data.element);
  }

  if (sets.length === 0) return getAgentById(id);

  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getAgentById(id);
}

export function updateAgentStats(id: string, data: {
  won: boolean;
  stake: string;
  earned?: string;
}): void {
  const db = getDb();
  const agent = getAgentById(id);
  if (!agent) return;

  const newWins = agent.wins + (data.won ? 1 : 0);
  const newLosses = agent.losses + (data.won ? 0 : 1);
  const newBattles = agent.total_battles + 1;
  const winRate = newBattles > 0 ? (newWins / newBattles) * 100 : 0;

  const stakeNum = parseFloat(data.stake) || 0;
  const earnedNum = parseFloat(data.earned ?? '0');
  const newStaked = parseFloat(agent.total_staked) + stakeNum;
  const newEarned = parseFloat(agent.total_earned) + earnedNum;
  const newProfit = newEarned - newStaked;

  const newStreak = data.won ? agent.current_streak + 1 : 0;
  const bestStreak = Math.max(agent.best_streak, newStreak);

  db.prepare(`
    UPDATE agents SET
      total_battles = ?, wins = ?, losses = ?, win_rate = ?,
      total_staked = ?, total_earned = ?, profit = ?,
      current_streak = ?, best_streak = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(newBattles, newWins, newLosses, Math.round(winRate * 10) / 10,
    newStaked.toFixed(4), newEarned.toFixed(4), newProfit.toFixed(4),
    newStreak, bestStreak, id);
}

export function incrementAgentMints(id: string): void {
  const db = getDb();
  db.prepare("UPDATE agents SET nfts_minted = nfts_minted + 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function incrementAgentMessages(id: string): void {
  const db = getDb();
  db.prepare("UPDATE agents SET messages_sent = messages_sent + 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

/* ---------------------------------------------------------------------------
 * Activities
 * ------------------------------------------------------------------------- */

export function addActivity(data: {
  agentId: string;
  agentName: string;
  type: string;
  description: string;
  element?: number | null;
  txHash?: string;
  success?: boolean;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO activities (agent_id, agent_name, type, description, element, tx_hash, success)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.agentId,
    data.agentName,
    data.type,
    data.description,
    data.element ?? null,
    data.txHash ?? null,
    data.success !== false ? 1 : 0
  );
}

export function getActivities(limit = 10, offset = 0, agentId?: string): { activities: DbActivity[]; total: number } {
  const db = getDb();

  if (agentId) {
    const activities = db.prepare(
      'SELECT * FROM activities WHERE agent_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(agentId, limit, offset) as DbActivity[];
    const { total } = db.prepare(
      'SELECT COUNT(*) as total FROM activities WHERE agent_id = ?'
    ).get(agentId) as { total: number };
    return { activities, total };
  }

  const activities = db.prepare(
    'SELECT * FROM activities ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as DbActivity[];
  const { total } = db.prepare('SELECT COUNT(*) as total FROM activities').get() as { total: number };
  return { activities, total };
}

/* ---------------------------------------------------------------------------
 * Battles
 * ------------------------------------------------------------------------- */

export function createBattle(data: {
  battleId?: number;
  attackerId?: string;
  attackerWallet: string;
  attackerNft?: number;
  attackerElement?: number;
  stake: string;
  txHash?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO battles (battle_id, attacker_id, attacker_wallet, attacker_nft, attacker_element, stake, tx_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    data.battleId ?? null,
    data.attackerId ?? null,
    data.attackerWallet.toLowerCase(),
    data.attackerNft ?? null,
    data.attackerElement ?? null,
    data.stake,
    data.txHash ?? null
  );
  return result.lastInsertRowid as number;
}

export function joinBattle(id: number, data: {
  defenderId?: string;
  defenderWallet: string;
  defenderNft?: number;
  defenderElement?: number;
  txHash?: string;
}): void {
  const db = getDb();
  db.prepare(`
    UPDATE battles SET
      defender_id = ?, defender_wallet = ?, defender_nft = ?,
      defender_element = ?, tx_hash = COALESCE(?, tx_hash), status = 'active'
    WHERE id = ?
  `).run(
    data.defenderId ?? null,
    data.defenderWallet.toLowerCase(),
    data.defenderNft ?? null,
    data.defenderElement ?? null,
    data.txHash ?? null,
    id
  );
}

export function resolveBattle(id: number, data: {
  winnerId?: string;
  winnerWallet: string;
  txHash?: string;
}): void {
  const db = getDb();
  db.prepare(`
    UPDATE battles SET
      winner_id = ?, winner_wallet = ?, tx_hash = COALESCE(?, tx_hash),
      status = 'resolved', resolved_at = datetime('now')
    WHERE id = ?
  `).run(data.winnerId ?? null, data.winnerWallet.toLowerCase(), data.txHash ?? null, id);
}

export function getBattleByChainId(battleId: number): DbBattle | null {
  const db = getDb();
  return db.prepare('SELECT * FROM battles WHERE battle_id = ?').get(battleId) as DbBattle | null;
}

export function getBattleHistory(agentId: string, limit = 10): DbBattle[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM battles
    WHERE (attacker_id = ? OR defender_id = ?) AND status = 'resolved'
    ORDER BY resolved_at DESC LIMIT ?
  `).all(agentId, agentId, limit) as DbBattle[];
}

/* ---------------------------------------------------------------------------
 * Chat Messages
 * ------------------------------------------------------------------------- */

export function addChatMessage(data: {
  agentId: string;
  agentName: string;
  threadId?: number;
  content: string;
  txHash?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO chat_messages (agent_id, agent_name, thread_id, content, tx_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.agentId, data.agentName, data.threadId ?? 0, data.content, data.txHash ?? null);
}

export function getChatMessages(threadId = 0, limit = 50, offset = 0): { messages: DbChatMessage[]; total: number } {
  const db = getDb();
  const messages = db.prepare(
    'SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(threadId, limit, offset) as DbChatMessage[];
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM chat_messages WHERE thread_id = ?'
  ).get(threadId) as { total: number };
  return { messages, total };
}

/* ---------------------------------------------------------------------------
 * Marketplace Listings
 * ------------------------------------------------------------------------- */

export function createMarketplaceListing(data: {
  tokenId: number;
  seller: string;
  price: string;
  type?: string;
  txHash?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO marketplace_listings (token_id, seller, price, type, tx_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.tokenId, data.seller.toLowerCase(), data.price, data.type ?? 'fixed', data.txHash ?? null);
  return result.lastInsertRowid as number;
}

export function getMarketplaceListings(
  limit = 20,
  offset = 0,
  status = 'active',
  type?: string,
  seller?: string
): { listings: DbMarketplaceListing[]; total: number } {
  const db = getDb();
  const conditions = ['status = ?'];
  const params: unknown[] = [status];

  if (type) { conditions.push('type = ?'); params.push(type); }
  if (seller) { conditions.push('seller = ?'); params.push(seller.toLowerCase()); }

  const where = conditions.join(' AND ');

  const listings = db.prepare(
    `SELECT * FROM marketplace_listings WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as DbMarketplaceListing[];

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM marketplace_listings WHERE ${where}`
  ).get(...params) as { total: number };

  return { listings, total };
}

export function getMarketplaceListingByToken(tokenId: number): DbMarketplaceListing | null {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM marketplace_listings WHERE token_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(tokenId) as DbMarketplaceListing | null;
}

export function updateMarketplaceListingStatus(id: number, status: string): void {
  const db = getDb();
  db.prepare("UPDATE marketplace_listings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

/* ---------------------------------------------------------------------------
 * Marketplace Bids
 * ------------------------------------------------------------------------- */

export function addMarketplaceBid(data: {
  listingId?: number;
  tokenId: number;
  bidder: string;
  amount: string;
  txHash?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO marketplace_bids (listing_id, token_id, bidder, amount, tx_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.listingId ?? null, data.tokenId, data.bidder.toLowerCase(), data.amount, data.txHash ?? null);
  return result.lastInsertRowid as number;
}

export function getMarketplaceBids(tokenId: number, limit = 20): DbMarketplaceBid[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM marketplace_bids WHERE token_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(tokenId, limit) as DbMarketplaceBid[];
}

/* ---------------------------------------------------------------------------
 * Marketplace Offers
 * ------------------------------------------------------------------------- */

export function addMarketplaceOffer(data: {
  tokenId: number;
  offerer: string;
  amount: string;
  txHash?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO marketplace_offers (token_id, offerer, amount, tx_hash)
    VALUES (?, ?, ?, ?)
  `).run(data.tokenId, data.offerer.toLowerCase(), data.amount, data.txHash ?? null);
  return result.lastInsertRowid as number;
}

export function getMarketplaceOffers(tokenId: number): DbMarketplaceOffer[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM marketplace_offers WHERE token_id = ? AND status = 'active' ORDER BY amount DESC"
  ).all(tokenId) as DbMarketplaceOffer[];
}

export function updateMarketplaceOfferStatus(id: number, status: string): void {
  const db = getDb();
  db.prepare('UPDATE marketplace_offers SET status = ? WHERE id = ?').run(status, id);
}

/* ---------------------------------------------------------------------------
 * Marketplace Sales
 * ------------------------------------------------------------------------- */

export function addMarketplaceSale(data: {
  tokenId: number;
  seller: string;
  buyer: string;
  price: string;
  type?: string;
  txHash?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO marketplace_sales (token_id, seller, buyer, price, type, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.tokenId, data.seller.toLowerCase(), data.buyer.toLowerCase(), data.price, data.type ?? 'fixed', data.txHash ?? null);
  return result.lastInsertRowid as number;
}

export function getMarketplaceActivity(limit = 20, offset = 0): { sales: DbMarketplaceSale[]; total: number } {
  const db = getDb();
  const sales = db.prepare(
    'SELECT * FROM marketplace_sales ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as DbMarketplaceSale[];
  const { total } = db.prepare('SELECT COUNT(*) as total FROM marketplace_sales').get() as { total: number };
  return { sales, total };
}

/* ---------------------------------------------------------------------------
 * Wallet Points (FSB Rewards)
 * ------------------------------------------------------------------------- */

/* ---- Monthly Points Config ---- */
const POINTS = {
  BATTLE_1V1_WIN: 15,   BATTLE_1V1_LOSS: 3,
  BATTLE_3V3_WIN: 40,   BATTLE_3V3_LOSS: 8,
  QUEST_EASY_WIN: 5,    QUEST_EASY_FAIL: 1,
  QUEST_MEDIUM_WIN: 15, QUEST_MEDIUM_FAIL: 3,
  QUEST_HARD_WIN: 30,   QUEST_HARD_FAIL: 5,
  QUEST_BOSS_WIN: 50,   QUEST_BOSS_FAIL: 8,
  MINT: 20,
  FUSION: 35,
  MARKET_BUY: 25,
  MARKET_LIST: 5,
};

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ensureMonthlyColumns(db: ReturnType<typeof getDb>) {
  const cols = db.prepare("PRAGMA table_info(wallet_points)").all() as { name: string }[];
  const colNames = cols.map(c => c.name);
  const newCols: [string, string][] = [
    ['battles_3v3', 'INTEGER NOT NULL DEFAULT 0'],
    ['wins_3v3', 'INTEGER NOT NULL DEFAULT 0'],
    ['losses_3v3', 'INTEGER NOT NULL DEFAULT 0'],
    ['quests_completed', 'INTEGER NOT NULL DEFAULT 0'],
    ['quests_failed', 'INTEGER NOT NULL DEFAULT 0'],
    ['mints', 'INTEGER NOT NULL DEFAULT 0'],
    ['fusions', 'INTEGER NOT NULL DEFAULT 0'],
    ['market_buys', 'INTEGER NOT NULL DEFAULT 0'],
    ['market_lists', 'INTEGER NOT NULL DEFAULT 0'],
    ['monthly_points', 'INTEGER NOT NULL DEFAULT 0'],
    ['month_key', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, type] of newCols) {
    if (!colNames.includes(name)) {
      db.prepare(`ALTER TABLE wallet_points ADD COLUMN ${name} ${type}`).run();
    }
  }
}

function ensureMonth(db: ReturnType<typeof getDb>, wallet: string, monthKey: string) {
  const row = db.prepare('SELECT month_key FROM wallet_points WHERE wallet = ?').get(wallet) as { month_key: string } | undefined;
  if (row && row.month_key !== monthKey) {
    // New month — reset monthly points but keep all-time stats
    db.prepare('UPDATE wallet_points SET monthly_points = 0, month_key = ? WHERE wallet = ?').run(monthKey, wallet);
  }
}

export function recordBattleResult(winner: string, loser: string, avaxWon: string, is3v3 = false) {
  const db = getDb();
  ensureMonthlyColumns(db);
  const now = new Date().toISOString();
  const monthKey = currentMonthKey();
  const winPts = is3v3 ? POINTS.BATTLE_3V3_WIN : POINTS.BATTLE_1V1_WIN;
  const losePts = is3v3 ? POINTS.BATTLE_3V3_LOSS : POINTS.BATTLE_1V1_LOSS;

  const winnerLc = winner.toLowerCase();
  const loserLc = loser.toLowerCase();

  // Winner
  db.prepare(`
    INSERT INTO wallet_points (wallet, fsb_points, total_battles, wins, losses, total_avax_won, ${is3v3 ? 'battles_3v3, wins_3v3' : 'battles_3v3, wins_3v3'}, monthly_points, month_key, updated_at)
    VALUES (?, ?, 1, ${is3v3 ? '0, 0' : '1, 0'}, ?, ${is3v3 ? '1, 1' : '0, 0'}, ?, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET
      fsb_points = fsb_points + ?,
      total_battles = total_battles + 1,
      ${is3v3 ? 'battles_3v3 = battles_3v3 + 1, wins_3v3 = wins_3v3 + 1' : 'wins = wins + 1'},
      total_avax_won = CAST((CAST(total_avax_won AS REAL) + CAST(? AS REAL)) AS TEXT),
      monthly_points = CASE WHEN month_key = ? THEN monthly_points + ? ELSE ? END,
      month_key = ?,
      updated_at = ?
  `).run(winnerLc, winPts, avaxWon, winPts, monthKey, now, winPts, avaxWon, monthKey, winPts, winPts, monthKey, now);

  // Loser
  db.prepare(`
    INSERT INTO wallet_points (wallet, fsb_points, total_battles, wins, losses, total_avax_won, ${is3v3 ? 'battles_3v3, losses_3v3' : 'battles_3v3, losses_3v3'}, monthly_points, month_key, updated_at)
    VALUES (?, ?, 1, ${is3v3 ? '0, 0' : '0, 1'}, '0', ${is3v3 ? '1, 1' : '0, 0'}, ?, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET
      fsb_points = fsb_points + ?,
      total_battles = total_battles + 1,
      ${is3v3 ? 'battles_3v3 = battles_3v3 + 1, losses_3v3 = losses_3v3 + 1' : 'losses = losses + 1'},
      monthly_points = CASE WHEN month_key = ? THEN monthly_points + ? ELSE ? END,
      month_key = ?,
      updated_at = ?
  `).run(loserLc, losePts, losePts, monthKey, now, losePts, monthKey, losePts, losePts, monthKey, now);
}

export function recordActivity(wallet: string, activity: 'mint' | 'fusion' | 'market_buy' | 'market_list' | 'quest_easy_win' | 'quest_easy_fail' | 'quest_medium_win' | 'quest_medium_fail' | 'quest_hard_win' | 'quest_hard_fail' | 'quest_boss_win' | 'quest_boss_fail') {
  const db = getDb();
  ensureMonthlyColumns(db);
  const now = new Date().toISOString();
  const monthKey = currentMonthKey();
  const walletLc = wallet.toLowerCase();

  const pointsMap: Record<string, { points: number; col: string }> = {
    mint: { points: POINTS.MINT, col: 'mints' },
    fusion: { points: POINTS.FUSION, col: 'fusions' },
    market_buy: { points: POINTS.MARKET_BUY, col: 'market_buys' },
    market_list: { points: POINTS.MARKET_LIST, col: 'market_lists' },
    quest_easy_win: { points: POINTS.QUEST_EASY_WIN, col: 'quests_completed' },
    quest_easy_fail: { points: POINTS.QUEST_EASY_FAIL, col: 'quests_failed' },
    quest_medium_win: { points: POINTS.QUEST_MEDIUM_WIN, col: 'quests_completed' },
    quest_medium_fail: { points: POINTS.QUEST_MEDIUM_FAIL, col: 'quests_failed' },
    quest_hard_win: { points: POINTS.QUEST_HARD_WIN, col: 'quests_completed' },
    quest_hard_fail: { points: POINTS.QUEST_HARD_FAIL, col: 'quests_failed' },
    quest_boss_win: { points: POINTS.QUEST_BOSS_WIN, col: 'quests_completed' },
    quest_boss_fail: { points: POINTS.QUEST_BOSS_FAIL, col: 'quests_failed' },
  };

  const { points, col } = pointsMap[activity];

  db.prepare(`
    INSERT INTO wallet_points (wallet, fsb_points, total_battles, wins, losses, total_avax_won, ${col}, monthly_points, month_key, updated_at)
    VALUES (?, ?, 0, 0, 0, '0', 1, ?, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET
      fsb_points = fsb_points + ?,
      ${col} = ${col} + 1,
      monthly_points = CASE WHEN month_key = ? THEN monthly_points + ? ELSE ? END,
      month_key = ?,
      updated_at = ?
  `).run(walletLc, points, points, monthKey, now, points, monthKey, points, points, monthKey, now);
}

export function migrateExistingPoints() {
  const db = getDb();
  ensureMonthlyColumns(db);
  const monthKey = currentMonthKey();
  // Recalculate fsb_points and monthly_points from existing wins/losses
  db.prepare(`
    UPDATE wallet_points SET
      fsb_points = (wins * ${POINTS.BATTLE_1V1_WIN}) + (losses * ${POINTS.BATTLE_1V1_LOSS}),
      monthly_points = (wins * ${POINTS.BATTLE_1V1_WIN}) + (losses * ${POINTS.BATTLE_1V1_LOSS}),
      month_key = ?
    WHERE month_key = '' OR month_key IS NULL
  `).run(monthKey);
}

export function getLeaderboard(limit = 50, offset = 0) {
  const db = getDb();
  ensureMonthlyColumns(db);
  const monthKey = currentMonthKey();
  const players = db.prepare(
    'SELECT * FROM wallet_points WHERE month_key = ? ORDER BY monthly_points DESC, fsb_points DESC LIMIT ? OFFSET ?'
  ).all(monthKey, limit, offset) as any[];
  const { total } = db.prepare('SELECT COUNT(*) as total FROM wallet_points WHERE month_key = ? AND monthly_points > 0').get(monthKey) as { total: number };
  return { players, total };
}

export function getLeaderboardAllTime(limit = 50, offset = 0) {
  const db = getDb();
  ensureMonthlyColumns(db);
  const players = db.prepare(
    'SELECT * FROM wallet_points ORDER BY fsb_points DESC, wins DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as any[];
  const { total } = db.prepare('SELECT COUNT(*) as total FROM wallet_points WHERE fsb_points > 0').get() as { total: number };
  return { players, total };
}

export function getWalletPoints(wallet: string) {
  const db = getDb();
  ensureMonthlyColumns(db);
  return db.prepare('SELECT * FROM wallet_points WHERE wallet = ?').get(wallet.toLowerCase()) as any | undefined;
}

export function archiveMonth(monthKey: string) {
  const db = getDb();
  ensureMonthlyColumns(db);
  // Check if already archived
  const existing = db.prepare('SELECT COUNT(*) as c FROM monthly_archive WHERE month_key = ?').get(monthKey) as { c: number };
  if (existing.c > 0) return;

  // Archive top 10
  const top10 = db.prepare(
    'SELECT * FROM wallet_points WHERE month_key = ? AND monthly_points > 0 ORDER BY monthly_points DESC LIMIT 10'
  ).all(monthKey) as any[];

  const insert = db.prepare(
    'INSERT INTO monthly_archive (month_key, rank, wallet, monthly_points, wins, losses, wins_3v3, mints, fusions, quests_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (let i = 0; i < top10.length; i++) {
    const p = top10[i];
    insert.run(monthKey, i + 1, p.wallet, p.monthly_points, p.wins ?? 0, p.losses ?? 0, p.wins_3v3 ?? 0, p.mints ?? 0, p.fusions ?? 0, p.quests_completed ?? 0);
  }
}

export function getPreviousMonthTop10(): { monthKey: string; players: any[] } | null {
  const db = getDb();
  // Ensure archive table exists
  try { db.prepare('SELECT 1 FROM monthly_archive LIMIT 1').get(); } catch { return null; }

  const currentMonth = currentMonthKey();
  const row = db.prepare(
    'SELECT DISTINCT month_key FROM monthly_archive WHERE month_key < ? ORDER BY month_key DESC LIMIT 1'
  ).get(currentMonth) as { month_key: string } | undefined;

  if (!row) return null;

  const players = db.prepare(
    'SELECT * FROM monthly_archive WHERE month_key = ? ORDER BY rank ASC'
  ).all(row.month_key) as any[];

  return { monthKey: row.month_key, players };
}

export function checkAndArchivePreviousMonth() {
  const current = currentMonthKey();
  // Calculate previous month key
  const [y, m] = current.split('-').map(Number);
  const prevDate = new Date(Date.UTC(y, m - 2, 1)); // m-1 is current, m-2 is previous
  const prevKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
  archiveMonth(prevKey);
}

/* ---------------------------------------------------------------------------
 * Agent Decisions
 * ------------------------------------------------------------------------- */

export function addDecision(data: {
  agentId: string;
  action: string;
  reasoning: string;
  gameStateSummary?: string;
  battleId?: number;
  tokenId?: number;
  stakeAmount?: string;
  success?: boolean;
  txHash?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_decisions (agent_id, action, reasoning, game_state_summary, battle_id, token_id, stake_amount, success, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.agentId,
    data.action,
    data.reasoning,
    data.gameStateSummary ?? '{}',
    data.battleId ?? null,
    data.tokenId ?? null,
    data.stakeAmount ?? null,
    data.success !== false ? 1 : 0,
    data.txHash ?? null
  );

  // Update agent decision count & favorite action & last_active_at
  db.prepare(`
    UPDATE agents SET
      total_decisions = total_decisions + 1,
      last_active_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(data.agentId);

  // Update favorite action (most frequent)
  const fav = db.prepare(`
    SELECT action, COUNT(*) as cnt FROM agent_decisions
    WHERE agent_id = ? GROUP BY action ORDER BY cnt DESC LIMIT 1
  `).get(data.agentId) as { action: string; cnt: number } | undefined;
  if (fav) {
    db.prepare('UPDATE agents SET favorite_action = ? WHERE id = ?').run(fav.action, data.agentId);
  }
}

export function getDecisions(agentId: string, limit = 10, offset = 0): { decisions: DbDecision[]; total: number } {
  const db = getDb();
  const decisions = db.prepare(
    'SELECT * FROM agent_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(agentId, limit, offset) as DbDecision[];
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM agent_decisions WHERE agent_id = ?'
  ).get(agentId) as { total: number };
  return { decisions, total };
}

export function getDecisionStats(agentId: string): {
  actionBreakdown: Record<string, number>;
  successRate: number;
  totalDecisions: number;
} {
  const db = getDb();

  const rows = db.prepare(
    'SELECT action, COUNT(*) as cnt FROM agent_decisions WHERE agent_id = ? GROUP BY action'
  ).all(agentId) as { action: string; cnt: number }[];

  const actionBreakdown: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    actionBreakdown[row.action] = row.cnt;
    total += row.cnt;
  }

  const { successCount } = db.prepare(
    'SELECT COUNT(*) as successCount FROM agent_decisions WHERE agent_id = ? AND success = 1'
  ).get(agentId) as { successCount: number };

  return {
    actionBreakdown,
    successRate: total > 0 ? Math.round((successCount / total) * 1000) / 10 : 0,
    totalDecisions: total,
  };
}

/* ---------------------------------------------------------------------------
 * Agent Personalities
 * ------------------------------------------------------------------------- */

export function createPersonality(data: {
  agentId: string;
  bio: string;
  catchphrase: string;
  personalityType: string;
  avatarSeed: string;
  avatarGradient: string;
  tauntStyle: string;
  rivalAgentId?: string;
  favoriteElement: string;
}): DbPersonality {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_personalities (agent_id, bio, catchphrase, personality_type, avatar_seed, avatar_gradient, taunt_style, rival_agent_id, favorite_element)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      bio = excluded.bio, catchphrase = excluded.catchphrase, personality_type = excluded.personality_type,
      avatar_seed = excluded.avatar_seed, avatar_gradient = excluded.avatar_gradient, taunt_style = excluded.taunt_style,
      rival_agent_id = excluded.rival_agent_id, favorite_element = excluded.favorite_element,
      updated_at = datetime('now')
  `).run(
    data.agentId, data.bio, data.catchphrase, data.personalityType,
    data.avatarSeed, data.avatarGradient, data.tauntStyle,
    data.rivalAgentId ?? null, data.favoriteElement
  );
  return getPersonality(data.agentId)!;
}

export function getPersonality(agentId: string): DbPersonality | null {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_personalities WHERE agent_id = ?').get(agentId) as DbPersonality | null;
}

export function updatePersonality(agentId: string, data: Partial<{
  bio: string;
  catchphrase: string;
  personalityType: string;
  tauntStyle: string;
  rivalAgentId: string;
}>): DbPersonality | null {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.bio !== undefined) { sets.push('bio = ?'); values.push(data.bio); }
  if (data.catchphrase !== undefined) { sets.push('catchphrase = ?'); values.push(data.catchphrase); }
  if (data.personalityType !== undefined) { sets.push('personality_type = ?'); values.push(data.personalityType); }
  if (data.tauntStyle !== undefined) { sets.push('taunt_style = ?'); values.push(data.tauntStyle); }
  if (data.rivalAgentId !== undefined) { sets.push('rival_agent_id = ?'); values.push(data.rivalAgentId); }

  if (sets.length === 0) return getPersonality(agentId);

  sets.push("updated_at = datetime('now')");
  values.push(agentId);

  db.prepare(`UPDATE agent_personalities SET ${sets.join(', ')} WHERE agent_id = ?`).run(...values);
  return getPersonality(agentId);
}

/* ---------------------------------------------------------------------------
 * Rival System (Faz 3)
 * ------------------------------------------------------------------------- */

export function setRival(agentId: string, rivalAgentId: string): void {
  const db = getDb();
  db.prepare("UPDATE agent_personalities SET rival_agent_id = ?, updated_at = datetime('now') WHERE agent_id = ?")
    .run(rivalAgentId, agentId);
}

export function getRivalStats(agentId: string, rivalId: string): { wins: number; losses: number; totalBattles: number } {
  const db = getDb();
  const { wins } = db.prepare(`
    SELECT COUNT(*) as wins FROM battles
    WHERE ((attacker_id = ? AND defender_id = ?) OR (attacker_id = ? AND defender_id = ?))
    AND winner_id = ? AND status = 'resolved'
  `).get(agentId, rivalId, rivalId, agentId, agentId) as { wins: number };

  const { losses } = db.prepare(`
    SELECT COUNT(*) as losses FROM battles
    WHERE ((attacker_id = ? AND defender_id = ?) OR (attacker_id = ? AND defender_id = ?))
    AND winner_id = ? AND status = 'resolved'
  `).get(agentId, rivalId, rivalId, agentId, rivalId) as { losses: number };

  return { wins, losses, totalBattles: wins + losses };
}

export function autoDetectRival(agentId: string): string | null {
  const db = getDb();
  // Find the opponent this agent has lost to the most
  const result = db.prepare(`
    SELECT
      CASE WHEN attacker_id = ? THEN defender_id ELSE attacker_id END as rival_id,
      COUNT(*) as loss_count
    FROM battles
    WHERE ((attacker_id = ? AND winner_id != ?) OR (defender_id = ? AND winner_id != ?))
    AND status = 'resolved'
    AND winner_id IS NOT NULL
    AND (attacker_id = ? OR defender_id = ?)
    GROUP BY rival_id
    ORDER BY loss_count DESC
    LIMIT 1
  `).get(agentId, agentId, agentId, agentId, agentId, agentId, agentId) as { rival_id: string; loss_count: number } | undefined;

  return result?.rival_id ?? null;
}

export function getRivalInfo(agentId: string): {
  name: string;
  element: string;
  winRate: number;
  lastEncounter: string;
  headToHead: { wins: number; losses: number };
} | null {
  const personality = getPersonality(agentId);
  if (!personality?.rival_agent_id) return null;

  const rivalAgent = getAgentById(personality.rival_agent_id);
  if (!rivalAgent) return null;

  const rivalPersonality = getPersonality(personality.rival_agent_id);
  const stats = getRivalStats(agentId, personality.rival_agent_id);

  const db = getDb();
  const lastBattle = db.prepare(`
    SELECT resolved_at FROM battles
    WHERE ((attacker_id = ? AND defender_id = ?) OR (attacker_id = ? AND defender_id = ?))
    AND status = 'resolved'
    ORDER BY resolved_at DESC LIMIT 1
  `).get(agentId, personality.rival_agent_id, personality.rival_agent_id, agentId) as { resolved_at: string } | undefined;

  return {
    name: rivalAgent.name,
    element: rivalPersonality?.favorite_element ?? 'Unknown',
    winRate: rivalAgent.win_rate,
    lastEncounter: lastBattle?.resolved_at ?? 'never',
    headToHead: { wins: stats.wins, losses: stats.losses },
  };
}

/* ---------------------------------------------------------------------------
 * Live Events
 * ------------------------------------------------------------------------- */

export function addLiveEvent(data: {
  eventType: string;
  agentId?: string;
  agentName?: string;
  opponentId?: string;
  opponentName?: string;
  data?: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO live_events (event_type, agent_id, agent_name, opponent_id, opponent_name, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.eventType,
    data.agentId ?? null,
    data.agentName ?? null,
    data.opponentId ?? null,
    data.opponentName ?? null,
    JSON.stringify(data.data ?? {})
  );
}

export function getLiveEvents(limit = 20, since?: string): DbLiveEvent[] {
  const db = getDb();
  if (since) {
    return db.prepare(
      'SELECT * FROM live_events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?'
    ).all(since, limit) as DbLiveEvent[];
  }
  return db.prepare(
    'SELECT * FROM live_events ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as DbLiveEvent[];
}

/* ---------------------------------------------------------------------------
 * Roster / Profile / Arena helpers
 * ------------------------------------------------------------------------- */

export function getAgentRoster(limit = 50, offset = 0): { agents: (DbAgent & { personality?: DbPersonality | null })[]; total: number } {
  const db = getDb();
  const agents = db.prepare(
    'SELECT * FROM agents ORDER BY last_active_at DESC NULLS LAST, created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as DbAgent[];
  const { total } = db.prepare('SELECT COUNT(*) as total FROM agents').get() as { total: number };

  const withPersonality = agents.map(a => ({
    ...a,
    personality: getPersonality(a.id),
  }));

  return { agents: withPersonality, total };
}

export function getAgentFullProfile(agentId: string): {
  agent: DbAgent;
  personality: DbPersonality | null;
  recentDecisions: DbDecision[];
  decisionStats: ReturnType<typeof getDecisionStats>;
} | null {
  const agent = getAgentById(agentId);
  if (!agent) return null;

  const personality = getPersonality(agentId);
  const { decisions: recentDecisions } = getDecisions(agentId, 10);
  const decisionStats = getDecisionStats(agentId);

  return { agent, personality, recentDecisions, decisionStats };
}

export function getActiveBattles(): DbBattle[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM battles WHERE status IN ('open', 'active') ORDER BY created_at DESC LIMIT 20"
  ).all() as DbBattle[];
}

export function getPlatformStats(): {
  totalAgents: number;
  activeAgents: number;
  avgWinRate: number;
} {
  const db = getDb();
  const { totalAgents } = db.prepare('SELECT COUNT(*) as totalAgents FROM agents').get() as { totalAgents: number };
  const { activeAgents } = db.prepare(
    "SELECT COUNT(*) as activeAgents FROM agents WHERE last_active_at IS NOT NULL AND last_active_at > datetime('now', '-2 minutes')"
  ).get() as { activeAgents: number };
  const { avgWinRate } = db.prepare(
    'SELECT COALESCE(AVG(win_rate), 0) as avgWinRate FROM agents WHERE total_battles > 0'
  ).get() as { avgWinRate: number };

  return { totalAgents, activeAgents, avgWinRate: Math.round(avgWinRate * 10) / 10 };
}

/* ---------------------------------------------------------------------------
 * Notifications
 * ------------------------------------------------------------------------- */

export function addNotification(params: {
  agentId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO notifications (agent_id, type, title, message, data) VALUES (?, ?, ?, ?, ?)',
  ).run(
    params.agentId,
    params.type,
    params.title,
    params.message,
    params.data ? JSON.stringify(params.data) : null,
  );
}

/* ---------------------------------------------------------------------------
 * Agent Funding (Faz 2)
 * ------------------------------------------------------------------------- */

export function getDailyFunded(agentWallet: string, date: string): bigint {
  const db = getDb();
  const row = db
    .prepare('SELECT funded_wei FROM agent_funding WHERE agent_wallet = ? AND date = ?')
    .get(agentWallet.toLowerCase(), date) as { funded_wei: string } | undefined;
  return row ? BigInt(row.funded_wei) : 0n;
}

export function addDailyFunded(agentWallet: string, date: string, amountWei: bigint): void {
  const db = getDb();
  const existing = db
    .prepare('SELECT funded_wei FROM agent_funding WHERE agent_wallet = ? AND date = ?')
    .get(agentWallet.toLowerCase(), date) as { funded_wei: string } | undefined;

  if (existing) {
    const newTotal = BigInt(existing.funded_wei) + amountWei;
    db.prepare(
      'UPDATE agent_funding SET funded_wei = ? WHERE agent_wallet = ? AND date = ?',
    ).run(newTotal.toString(), agentWallet.toLowerCase(), date);
  } else {
    db.prepare(
      'INSERT INTO agent_funding (agent_wallet, date, funded_wei) VALUES (?, ?, ?)',
    ).run(agentWallet.toLowerCase(), date, amountWei.toString());
  }
}

/* ---------------------------------------------------------------------------
 * Agent Loop State (Faz 7 — PM2 restart recovery)
 * ------------------------------------------------------------------------- */

export function setLoopState(agentWallet: string, running: boolean): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_loop_state (agent_wallet, running, last_tick)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(agent_wallet) DO UPDATE SET
      running = excluded.running,
      last_tick = datetime('now'),
      stopped_at = CASE WHEN excluded.running = 0 THEN datetime('now') ELSE stopped_at END
  `).run(agentWallet.toLowerCase(), running ? 1 : 0);
}

export function getRunningAgents(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT agent_wallet FROM agent_loop_state WHERE running = 1').all() as { agent_wallet: string }[];
  return rows.map(r => r.agent_wallet);
}

export function updateLoopTick(agentWallet: string): void {
  const db = getDb();
  db.prepare("UPDATE agent_loop_state SET last_tick = datetime('now') WHERE agent_wallet = ?")
    .run(agentWallet.toLowerCase());
}

/* ---------------------------------------------------------------------------
 * Tournaments (Faz 6)
 * ------------------------------------------------------------------------- */

export interface DbTournament {
  id: number;
  name: string;
  status: string;
  entry_fee: string;
  max_players: number;
  prize_pool: string;
  start_at: string;
  end_at: string | null;
  winner_id: string | null;
  created_at: string;
}

export interface DbTournamentParticipant {
  tournament_id: number;
  agent_id: string;
  score: number;
  wins: number;
  losses: number;
  joined_at: string;
}

export function createTournament(data: {
  name: string;
  entryFee: string;
  maxPlayers: number;
  startAt: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO tournaments (name, entry_fee, max_players, start_at)
    VALUES (?, ?, ?, ?)
  `).run(data.name, data.entryFee, data.maxPlayers, data.startAt);
  return result.lastInsertRowid as number;
}

export function getTournament(id: number): DbTournament | null {
  const db = getDb();
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as DbTournament | null;
}

export function listTournaments(status?: string): DbTournament[] {
  const db = getDb();
  if (status) {
    return db.prepare('SELECT * FROM tournaments WHERE status = ? ORDER BY start_at DESC').all(status) as DbTournament[];
  }
  return db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 20').all() as DbTournament[];
}

export function updateTournamentStatus(id: number, status: string, winnerId?: string): void {
  const db = getDb();
  if (winnerId) {
    db.prepare("UPDATE tournaments SET status = ?, winner_id = ? WHERE id = ?").run(status, winnerId, id);
  } else {
    db.prepare("UPDATE tournaments SET status = ? WHERE id = ?").run(status, id);
  }
}

export function updateTournamentPrizePool(id: number, prizePool: string): void {
  const db = getDb();
  db.prepare("UPDATE tournaments SET prize_pool = ? WHERE id = ?").run(prizePool, id);
}

export function joinTournament(tournamentId: number, agentId: string): boolean {
  const db = getDb();
  const tournament = getTournament(tournamentId);
  if (!tournament || tournament.status !== 'upcoming') return false;

  const count = db.prepare('SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ?')
    .get(tournamentId) as { cnt: number };
  if (count.cnt >= tournament.max_players) return false;

  // Check if already joined
  const existing = db.prepare('SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND agent_id = ?')
    .get(tournamentId, agentId);
  if (existing) return false;

  db.prepare('INSERT INTO tournament_participants (tournament_id, agent_id) VALUES (?, ?)').run(tournamentId, agentId);

  // Update prize pool
  const newPool = parseFloat(tournament.prize_pool) + parseFloat(tournament.entry_fee);
  updateTournamentPrizePool(tournamentId, newPool.toFixed(4));

  return true;
}

export function getTournamentParticipants(tournamentId: number): DbTournamentParticipant[] {
  const db = getDb();
  return db.prepare('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY score DESC, wins DESC')
    .all(tournamentId) as DbTournamentParticipant[];
}

export function updateTournamentScore(tournamentId: number, agentId: string, won: boolean): void {
  const db = getDb();
  if (won) {
    db.prepare(`
      UPDATE tournament_participants SET score = score + 3, wins = wins + 1
      WHERE tournament_id = ? AND agent_id = ?
    `).run(tournamentId, agentId);
  } else {
    db.prepare(`
      UPDATE tournament_participants SET losses = losses + 1
      WHERE tournament_id = ? AND agent_id = ?
    `).run(tournamentId, agentId);
  }
}

export function getAgentTournaments(agentId: string): (DbTournament & { score: number; wins: number; losses: number })[] {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, tp.score, tp.wins, tp.losses
    FROM tournaments t
    JOIN tournament_participants tp ON t.id = tp.tournament_id
    WHERE tp.agent_id = ?
    ORDER BY t.created_at DESC
  `).all(agentId) as (DbTournament & { score: number; wins: number; losses: number })[];
}

/* ---------------------------------------------------------------------------
 * Daily Spending (agent-engine persistence)
 * ------------------------------------------------------------------------- */

export function getDailySpent(agentWallet: string, date: string): bigint {
  const db = getDb();
  const row = db
    .prepare('SELECT spent_wei FROM agent_daily_spending WHERE agent_wallet = ? AND date = ?')
    .get(agentWallet.toLowerCase(), date) as { spent_wei: string } | undefined;
  return row ? BigInt(row.spent_wei) : 0n;
}

export function addDailySpent(agentWallet: string, date: string, amountWei: bigint): void {
  const db = getDb();
  const existing = db
    .prepare('SELECT spent_wei FROM agent_daily_spending WHERE agent_wallet = ? AND date = ?')
    .get(agentWallet.toLowerCase(), date) as { spent_wei: string } | undefined;

  if (existing) {
    const newTotal = BigInt(existing.spent_wei) + amountWei;
    db.prepare(
      'UPDATE agent_daily_spending SET spent_wei = ? WHERE agent_wallet = ? AND date = ?',
    ).run(newTotal.toString(), agentWallet.toLowerCase(), date);
  } else {
    db.prepare(
      'INSERT INTO agent_daily_spending (agent_wallet, date, spent_wei) VALUES (?, ?, ?)',
    ).run(agentWallet.toLowerCase(), date, amountWei.toString());
  }
}

/* ===========================================================================
 * MODULE 1: ELO/Rating System
 * ========================================================================= */

const ELO_TIERS = [
  { name: 'Bronze', min: 0, max: 1199 },
  { name: 'Silver', min: 1200, max: 1399 },
  { name: 'Gold', min: 1400, max: 1599 },
  { name: 'Platinum', min: 1600, max: 1799 },
  { name: 'Diamond', min: 1800, max: Infinity },
] as const;

export function getEloTier(elo: number): string {
  for (const tier of ELO_TIERS) {
    if (elo >= tier.min && elo <= tier.max) return tier.name;
  }
  return 'Bronze';
}

export function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  winnerBattles: number
): { winnerDelta: number; loserDelta: number } {
  const K = winnerBattles < 30 ? 32 : 16;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;
  const winnerDelta = Math.round(K * (1 - expectedWinner));
  const loserDelta = Math.round(K * (0 - expectedLoser));
  return { winnerDelta, loserDelta };
}

export function updateEloAfterBattle(winnerId: string, loserId: string): { winnerElo: number; loserElo: number } {
  const db = getDb();
  const winner = getAgentById(winnerId);
  const loser = getAgentById(loserId);
  if (!winner || !loser) return { winnerElo: 1200, loserElo: 1200 };

  const { winnerDelta, loserDelta } = calculateEloChange(
    winner.elo_rating,
    loser.elo_rating,
    winner.total_battles
  );

  const newWinnerElo = Math.max(0, winner.elo_rating + winnerDelta);
  const newLoserElo = Math.max(0, loser.elo_rating + loserDelta);

  db.prepare("UPDATE agents SET elo_rating = ?, updated_at = datetime('now') WHERE id = ?")
    .run(newWinnerElo, winnerId);
  db.prepare("UPDATE agents SET elo_rating = ?, updated_at = datetime('now') WHERE id = ?")
    .run(newLoserElo, loserId);

  return { winnerElo: newWinnerElo, loserElo: newLoserElo };
}

export function getLeaderboardByElo(limit = 10, offset = 0): { agents: DbAgent[]; total: number } {
  const db = getDb();
  const agents = db.prepare(`
    SELECT * FROM agents
    WHERE total_battles > 0
    ORDER BY elo_rating DESC, wins DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DbAgent[];
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM agents WHERE total_battles > 0'
  ).get() as { total: number };
  return { agents, total };
}

/* ===========================================================================
 * MODULE 2: XP/Level Progression
 * ========================================================================= */

export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100));
}

export function getXpForNextLevel(currentXp: number): { currentLevel: number; nextLevelXp: number; progress: number } {
  const currentLevel = calculateLevel(currentXp);
  const nextLevel = currentLevel + 1;
  const nextLevelXp = nextLevel * nextLevel * 100;
  const currentLevelXp = currentLevel * currentLevel * 100;
  const progress = currentLevel === 0
    ? (currentXp / nextLevelXp) * 100
    : ((currentXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return { currentLevel, nextLevelXp, progress: Math.min(100, Math.round(progress * 10) / 10) };
}

export function addXp(agentId: string, amount: number, source: string): { newXp: number; newLevel: number; leveledUp: boolean } {
  const db = getDb();
  const agent = getAgentById(agentId);
  if (!agent) return { newXp: 0, newLevel: 0, leveledUp: false };

  const newXp = agent.xp + amount;
  const newLevel = calculateLevel(newXp);
  const leveledUp = newLevel > agent.level;

  db.prepare("UPDATE agents SET xp = ?, level = ?, updated_at = datetime('now') WHERE id = ?")
    .run(newXp, newLevel, agentId);

  if (leveledUp) {
    addLiveEvent({
      eventType: 'level_up',
      agentId,
      agentName: agent.name,
      data: { oldLevel: agent.level, newLevel, xp: newXp, source },
    });
    addNotification({
      agentId,
      type: 'level_up',
      title: `Level Up! Level ${newLevel}`,
      message: `You reached level ${newLevel} from ${source}!`,
      data: { level: newLevel, xp: newXp },
    });
  }

  return { newXp, newLevel, leveledUp };
}

export function checkAndPrestige(agentId: string): boolean {
  const db = getDb();
  const agent = getAgentById(agentId);
  if (!agent || agent.level < 50) return false;

  const newPrestige = agent.prestige + 1;
  db.prepare("UPDATE agents SET prestige = ?, xp = 0, level = 0, updated_at = datetime('now') WHERE id = ?")
    .run(newPrestige, agentId);

  addLiveEvent({
    eventType: 'prestige',
    agentId,
    agentName: agent.name,
    data: { prestige: newPrestige },
  });
  addNotification({
    agentId,
    type: 'prestige',
    title: `Prestige ${newPrestige}!`,
    message: `You have reached Prestige ${newPrestige}. XP and Level have been reset.`,
    data: { prestige: newPrestige },
  });

  return true;
}

/* ===========================================================================
 * MODULE 3: Achievement/Badge System
 * ========================================================================= */

export interface DbAchievement {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  rarity: string;
  xp_reward: number;
  requirement_type: string;
  requirement_value: number;
}

export interface DbAgentAchievement {
  agent_id: string;
  achievement_id: string;
  unlocked_at: string;
}

const ACHIEVEMENT_SEED: Omit<DbAchievement, never>[] = [
  // Battle
  { id: 'first_blood', name: 'First Blood', description: 'Win your first battle', category: 'battle', icon: 'swords', rarity: 'common', xp_reward: 50, requirement_type: 'wins', requirement_value: 1 },
  { id: 'veteran', name: 'Veteran', description: 'Win 10 battles', category: 'battle', icon: 'shield', rarity: 'rare', xp_reward: 200, requirement_type: 'wins', requirement_value: 10 },
  { id: 'champion', name: 'Champion', description: 'Win 50 battles', category: 'battle', icon: 'trophy', rarity: 'epic', xp_reward: 500, requirement_type: 'wins', requirement_value: 50 },
  { id: 'legend', name: 'Legend', description: 'Win 100 battles', category: 'battle', icon: 'crown', rarity: 'legendary', xp_reward: 1000, requirement_type: 'wins', requirement_value: 100 },
  { id: 'streak_5', name: 'On Fire', description: '5-win streak', category: 'battle', icon: 'flame', rarity: 'rare', xp_reward: 300, requirement_type: 'streak', requirement_value: 5 },
  { id: 'streak_10', name: 'Unstoppable', description: '10-win streak', category: 'battle', icon: 'flame', rarity: 'epic', xp_reward: 600, requirement_type: 'streak', requirement_value: 10 },
  // Economy
  { id: 'first_mint', name: 'First Mint', description: 'Mint your first warrior', category: 'economy', icon: 'gem', rarity: 'common', xp_reward: 30, requirement_type: 'mints', requirement_value: 1 },
  { id: 'collector', name: 'Collector', description: 'Mint 10 warriors', category: 'economy', icon: 'gem', rarity: 'rare', xp_reward: 150, requirement_type: 'mints', requirement_value: 10 },
  { id: 'whale', name: 'Whale', description: 'Earn 1 AVAX total profit', category: 'economy', icon: 'coins', rarity: 'epic', xp_reward: 400, requirement_type: 'profit', requirement_value: 1 },
  // Social
  { id: 'chatty', name: 'Chatty', description: 'Send 10 messages', category: 'social', icon: 'message-circle', rarity: 'common', xp_reward: 50, requirement_type: 'messages', requirement_value: 10 },
  { id: 'influencer', name: 'Influencer', description: 'Send 50 messages', category: 'social', icon: 'message-circle', rarity: 'rare', xp_reward: 200, requirement_type: 'messages', requirement_value: 50 },
  // Milestone
  { id: 'bronze_tier', name: 'Bronze Tier', description: 'Reach Bronze ELO', category: 'milestone', icon: 'medal', rarity: 'common', xp_reward: 0, requirement_type: 'elo', requirement_value: 0 },
  { id: 'silver_tier', name: 'Silver Tier', description: 'Reach Silver ELO (1200+)', category: 'milestone', icon: 'medal', rarity: 'rare', xp_reward: 100, requirement_type: 'elo', requirement_value: 1200 },
  { id: 'gold_tier', name: 'Gold Tier', description: 'Reach Gold ELO (1400+)', category: 'milestone', icon: 'medal', rarity: 'epic', xp_reward: 300, requirement_type: 'elo', requirement_value: 1400 },
  { id: 'diamond_tier', name: 'Diamond Tier', description: 'Reach Diamond ELO (1800+)', category: 'milestone', icon: 'medal', rarity: 'legendary', xp_reward: 1000, requirement_type: 'elo', requirement_value: 1800 },
  { id: 'level_10', name: 'Level 10', description: 'Reach Level 10', category: 'milestone', icon: 'star', rarity: 'rare', xp_reward: 200, requirement_type: 'level', requirement_value: 10 },
  { id: 'level_25', name: 'Level 25', description: 'Reach Level 25', category: 'milestone', icon: 'star', rarity: 'epic', xp_reward: 500, requirement_type: 'level', requirement_value: 25 },
  { id: 'first_prestige', name: 'Prestige', description: 'Reach Prestige 1', category: 'milestone', icon: 'zap', rarity: 'legendary', xp_reward: 1000, requirement_type: 'prestige', requirement_value: 1 },
  // Referral
  { id: 'recruiter', name: 'Recruiter', description: 'Refer 1 agent', category: 'social', icon: 'users', rarity: 'common', xp_reward: 50, requirement_type: 'referrals', requirement_value: 1 },
  { id: 'networker', name: 'Networker', description: 'Refer 5 agents', category: 'social', icon: 'users', rarity: 'rare', xp_reward: 300, requirement_type: 'referrals', requirement_value: 5 },
];

export function seedAchievements(): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO achievements (id, name, description, category, icon, rarity, xp_reward, requirement_type, requirement_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of ACHIEVEMENT_SEED) {
    stmt.run(a.id, a.name, a.description, a.category, a.icon, a.rarity, a.xp_reward, a.requirement_type, a.requirement_value);
  }
}

export function unlockAchievement(agentId: string, achievementId: string): boolean {
  const db = getDb();
  // Check if already unlocked
  const existing = db.prepare('SELECT 1 FROM agent_achievements WHERE agent_id = ? AND achievement_id = ?')
    .get(agentId, achievementId);
  if (existing) return false;

  const achievement = db.prepare('SELECT * FROM achievements WHERE id = ?')
    .get(achievementId) as DbAchievement | undefined;
  if (!achievement) return false;

  db.prepare('INSERT INTO agent_achievements (agent_id, achievement_id) VALUES (?, ?)')
    .run(agentId, achievementId);

  // Grant XP reward
  if (achievement.xp_reward > 0) {
    addXp(agentId, achievement.xp_reward, `achievement:${achievementId}`);
  }

  // Notify
  const agent = getAgentById(agentId);
  if (agent) {
    addNotification({
      agentId,
      type: 'achievement',
      title: `Achievement Unlocked: ${achievement.name}`,
      message: achievement.description,
      data: { achievementId, rarity: achievement.rarity, xpReward: achievement.xp_reward },
    });
    addLiveEvent({
      eventType: 'achievement_unlocked',
      agentId,
      agentName: agent.name,
      data: { achievementId, achievementName: achievement.name, rarity: achievement.rarity },
    });
  }

  return true;
}

export function checkAchievements(agentId: string): string[] {
  const db = getDb();
  const agent = getAgentById(agentId);
  if (!agent) return [];

  // Seed achievements if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM achievements').get() as { cnt: number };
  if (count.cnt === 0) seedAchievements();

  // Get all achievements not yet unlocked by this agent
  const locked = db.prepare(`
    SELECT a.* FROM achievements a
    WHERE a.id NOT IN (SELECT achievement_id FROM agent_achievements WHERE agent_id = ?)
  `).all(agentId) as DbAchievement[];

  const unlocked: string[] = [];

  // Get referral count for this agent
  const { refCount } = db.prepare(
    'SELECT COUNT(*) as refCount FROM referrals WHERE referrer_id = ?'
  ).get(agentId) as { refCount: number };

  for (const ach of locked) {
    let met = false;
    switch (ach.requirement_type) {
      case 'wins':
        met = agent.wins >= ach.requirement_value;
        break;
      case 'battles':
        met = agent.total_battles >= ach.requirement_value;
        break;
      case 'streak':
        met = agent.best_streak >= ach.requirement_value;
        break;
      case 'level':
        met = agent.level >= ach.requirement_value;
        break;
      case 'elo':
        met = agent.elo_rating >= ach.requirement_value;
        break;
      case 'messages':
        met = agent.messages_sent >= ach.requirement_value;
        break;
      case 'mints':
        met = agent.nfts_minted >= ach.requirement_value;
        break;
      case 'profit':
        met = parseFloat(agent.profit) >= ach.requirement_value;
        break;
      case 'prestige':
        met = agent.prestige >= ach.requirement_value;
        break;
      case 'referrals':
        met = refCount >= ach.requirement_value;
        break;
    }
    if (met) {
      unlockAchievement(agentId, ach.id);
      unlocked.push(ach.id);
    }
  }

  return unlocked;
}

export function getAgentAchievements(agentId: string): (DbAchievement & { unlocked_at: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, aa.unlocked_at
    FROM achievements a
    JOIN agent_achievements aa ON a.id = aa.achievement_id
    WHERE aa.agent_id = ?
    ORDER BY aa.unlocked_at DESC
  `).all(agentId) as (DbAchievement & { unlocked_at: string })[];
}

/* ===========================================================================
 * MODULE 4: Seasonal Rewards
 * ========================================================================= */

export interface DbSeason {
  id: number;
  name: string;
  number: number;
  status: string;
  start_at: string;
  end_at: string;
  reward_pool: string;
  created_at: string;
}

export interface DbSeasonSnapshot {
  season_id: number;
  agent_id: string;
  elo_start: number;
  elo_end: number | null;
  rank: number | null;
  battles: number;
  wins: number;
  xp_earned: number;
  reward: string;
}

export function createSeason(data: { name: string; number: number; startAt: string; endAt: string; rewardPool?: string }): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO seasons (name, number, start_at, end_at, reward_pool)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.name, data.number, data.startAt, data.endAt, data.rewardPool ?? '0');
  return result.lastInsertRowid as number;
}

export function getActiveSeason(): DbSeason | null {
  const db = getDb();
  return db.prepare("SELECT * FROM seasons WHERE status = 'active' LIMIT 1").get() as DbSeason | null;
}

export function getSeasonById(id: number): DbSeason | null {
  const db = getDb();
  return db.prepare('SELECT * FROM seasons WHERE id = ?').get(id) as DbSeason | null;
}

export function listSeasons(): DbSeason[] {
  const db = getDb();
  return db.prepare('SELECT * FROM seasons ORDER BY number DESC').all() as DbSeason[];
}

export function updateSeasonStatus(id: number, status: string): void {
  const db = getDb();
  db.prepare('UPDATE seasons SET status = ? WHERE id = ?').run(status, id);
}

export function takeSeasonSnapshot(seasonId: number): void {
  const db = getDb();
  const agents = db.prepare('SELECT id, elo_rating FROM agents WHERE total_battles > 0').all() as { id: string; elo_rating: number }[];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO season_snapshots (season_id, agent_id, elo_start)
    VALUES (?, ?, ?)
  `);
  for (const a of agents) {
    stmt.run(seasonId, a.id, a.elo_rating);
  }
}

export function getSeasonLeaderboard(seasonId: number): DbSeasonSnapshot[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM season_snapshots
    WHERE season_id = ?
    ORDER BY COALESCE(elo_end, elo_start) DESC
  `).all(seasonId) as DbSeasonSnapshot[];
}

export function updateSeasonSnapshot(seasonId: number, agentId: string, data: Partial<{
  elo_end: number;
  rank: number;
  battles: number;
  wins: number;
  xp_earned: number;
  reward: string;
}>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.elo_end !== undefined) { sets.push('elo_end = ?'); values.push(data.elo_end); }
  if (data.rank !== undefined) { sets.push('rank = ?'); values.push(data.rank); }
  if (data.battles !== undefined) { sets.push('battles = ?'); values.push(data.battles); }
  if (data.wins !== undefined) { sets.push('wins = ?'); values.push(data.wins); }
  if (data.xp_earned !== undefined) { sets.push('xp_earned = ?'); values.push(data.xp_earned); }
  if (data.reward !== undefined) { sets.push('reward = ?'); values.push(data.reward); }

  if (sets.length === 0) return;

  values.push(seasonId, agentId);
  db.prepare(`UPDATE season_snapshots SET ${sets.join(', ')} WHERE season_id = ? AND agent_id = ?`).run(...values);
}

export function finalizeSeasonRewards(seasonId: number): void {
  const db = getDb();
  const season = getSeasonById(seasonId);
  if (!season) return;

  const pool = parseFloat(season.reward_pool);
  const agents = db.prepare(`
    SELECT agent_id, elo_rating FROM agents
    WHERE id IN (SELECT agent_id FROM season_snapshots WHERE season_id = ?)
    ORDER BY elo_rating DESC
  `).all(seasonId) as { agent_id: string; elo_rating: number }[];

  // Update elo_end and rank for all participants
  agents.forEach((a, i) => {
    updateSeasonSnapshot(seasonId, a.agent_id, {
      elo_end: a.elo_rating,
      rank: i + 1,
    });
  });

  // Top 3 rewards: 50%, 30%, 20%
  const rewardPcts = [0.5, 0.3, 0.2];
  for (let i = 0; i < Math.min(3, agents.length); i++) {
    const reward = (pool * rewardPcts[i]).toFixed(4);
    updateSeasonSnapshot(seasonId, agents[i].agent_id, { reward });
  }

  updateSeasonStatus(seasonId, 'completed');
}

/* ===========================================================================
 * MODULE 5: Referral System
 * ========================================================================= */

export function generateReferralCode(agentId: string): string {
  const db = getDb();
  const agent = getAgentById(agentId);
  if (!agent) return '';

  if (agent.referral_code) return agent.referral_code;

  // Generate 8-char hex code
  const code = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  db.prepare("UPDATE agents SET referral_code = ?, updated_at = datetime('now') WHERE id = ?")
    .run(code, agentId);

  return code;
}

export function applyReferral(newAgentId: string, referralCode: string): { success: boolean; error?: string } {
  const db = getDb();
  const newAgent = getAgentById(newAgentId);
  if (!newAgent) return { success: false, error: 'Agent not found' };
  if (newAgent.referred_by) return { success: false, error: 'Already referred' };

  const referrer = db.prepare('SELECT * FROM agents WHERE referral_code = ?')
    .get(referralCode) as DbAgent | undefined;
  if (!referrer) return { success: false, error: 'Invalid referral code' };
  if (referrer.id === newAgentId) return { success: false, error: 'Cannot refer yourself' };

  // Apply referral
  db.prepare("UPDATE agents SET referred_by = ?, updated_at = datetime('now') WHERE id = ?")
    .run(referrer.id, newAgentId);
  db.prepare('INSERT INTO referrals (referrer_id, referee_id) VALUES (?, ?)')
    .run(referrer.id, newAgentId);

  // Bonus XP
  addXp(referrer.id, 100, 'referral_bonus');
  addXp(newAgentId, 50, 'referral_welcome');

  // Notifications
  addNotification({
    agentId: referrer.id,
    type: 'referral',
    title: 'New Referral!',
    message: `${newAgent.name} joined using your referral code. +100 XP!`,
    data: { refereeId: newAgentId },
  });

  return { success: true };
}

export function getReferralStats(agentId: string): { totalReferrals: number; totalBonusXp: number; referees: string[] } {
  const db = getDb();
  const rows = db.prepare('SELECT referee_id, bonus_xp FROM referrals WHERE referrer_id = ?')
    .all(agentId) as { referee_id: string; bonus_xp: number }[];
  return {
    totalReferrals: rows.length,
    totalBonusXp: rows.reduce((sum, r) => sum + r.bonus_xp, 0),
    referees: rows.map(r => r.referee_id),
  };
}

/* ===========================================================================
 * MODULE 6: Warrior Merging/Fusion
 * ========================================================================= */

export interface DbWarriorMerge {
  id: number;
  agent_id: string;
  token_id_1: number;
  token_id_2: number;
  result_token_id: number | null;
  element_1: number | null;
  element_2: number | null;
  result_element: number | null;
  tx_hash: string | null;
  success: number;
  created_at: string;
}

export function recordMerge(data: {
  agentId: string;
  tokenId1: number;
  tokenId2: number;
  resultTokenId?: number;
  element1?: number;
  element2?: number;
  resultElement?: number;
  txHash?: string;
  success?: boolean;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO warrior_merges (agent_id, token_id_1, token_id_2, result_token_id, element_1, element_2, result_element, tx_hash, success)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.agentId,
    data.tokenId1,
    data.tokenId2,
    data.resultTokenId ?? null,
    data.element1 ?? null,
    data.element2 ?? null,
    data.resultElement ?? null,
    data.txHash ?? null,
    data.success !== false ? 1 : 0
  );
  return result.lastInsertRowid as number;
}

export function getMergeHistory(agentId: string, limit = 10): DbWarriorMerge[] {
  const db = getDb();
  return db.prepare('SELECT * FROM warrior_merges WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(agentId, limit) as DbWarriorMerge[];
}

/* ===========================================================================
 * MODULE 7: Agent Marketplace
 * ========================================================================= */

export interface DbAgentListing {
  id: number;
  agent_id: string;
  seller_address: string;
  price: string;
  status: string;
  buyer_address: string | null;
  tx_hash: string | null;
  created_at: string;
  sold_at: string | null;
}

export function listAgentForSale(agentId: string, sellerAddress: string, price: string): { success: boolean; listingId?: number; error?: string } {
  const db = getDb();
  const agent = getAgentById(agentId);
  if (!agent) return { success: false, error: 'Agent not found' };
  if (agent.owner_address.toLowerCase() !== sellerAddress.toLowerCase()) {
    return { success: false, error: 'Not the owner of this agent' };
  }

  // Check if already listed
  const existing = db.prepare("SELECT 1 FROM agent_listings WHERE agent_id = ? AND status = 'active'")
    .get(agentId);
  if (existing) return { success: false, error: 'Agent already listed' };

  const result = db.prepare(`
    INSERT INTO agent_listings (agent_id, seller_address, price)
    VALUES (?, ?, ?)
  `).run(agentId, sellerAddress.toLowerCase(), price);

  return { success: true, listingId: result.lastInsertRowid as number };
}

export function buyAgent(listingId: number, buyerAddress: string): { success: boolean; error?: string } {
  const db = getDb();
  const listing = db.prepare("SELECT * FROM agent_listings WHERE id = ? AND status = 'active'")
    .get(listingId) as DbAgentListing | undefined;
  if (!listing) return { success: false, error: 'Listing not found or not active' };
  if (listing.seller_address.toLowerCase() === buyerAddress.toLowerCase()) {
    return { success: false, error: 'Cannot buy your own agent' };
  }

  // Transfer ownership
  db.prepare("UPDATE agents SET owner_address = ?, updated_at = datetime('now') WHERE id = ?")
    .run(buyerAddress.toLowerCase(), listing.agent_id);

  // Update listing
  db.prepare("UPDATE agent_listings SET status = 'sold', buyer_address = ?, sold_at = datetime('now') WHERE id = ?")
    .run(buyerAddress.toLowerCase(), listingId);

  return { success: true };
}

export function cancelAgentListing(listingId: number, sellerAddress: string): { success: boolean; error?: string } {
  const db = getDb();
  const listing = db.prepare("SELECT * FROM agent_listings WHERE id = ? AND status = 'active'")
    .get(listingId) as DbAgentListing | undefined;
  if (!listing) return { success: false, error: 'Listing not found or not active' };
  if (listing.seller_address.toLowerCase() !== sellerAddress.toLowerCase()) {
    return { success: false, error: 'Not the seller' };
  }

  db.prepare("UPDATE agent_listings SET status = 'cancelled' WHERE id = ?").run(listingId);
  return { success: true };
}

export function getAgentListings(status = 'active', limit = 20, offset = 0): { listings: (DbAgentListing & { agent_name?: string; elo_rating?: number; level?: number })[]; total: number } {
  const db = getDb();
  const listings = db.prepare(`
    SELECT al.*, a.name as agent_name, a.elo_rating, a.level
    FROM agent_listings al
    JOIN agents a ON al.agent_id = a.id
    WHERE al.status = ?
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(status, limit, offset) as (DbAgentListing & { agent_name: string; elo_rating: number; level: number })[];
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM agent_listings WHERE status = ?'
  ).get(status) as { total: number };
  return { listings, total };
}

/* ===========================================================================
 * MODULE 8: Cross-game Reputation
 * ========================================================================= */

export function getReputationProfile(agentId: string): Record<string, unknown> | null {
  const agent = getAgentById(agentId);
  if (!agent) return null;

  const achievements = getAgentAchievements(agentId);
  const seasonData = getDb().prepare(`
    SELECT ss.*, s.number as season_number
    FROM season_snapshots ss
    JOIN seasons s ON ss.season_id = s.id
    WHERE ss.agent_id = ?
    ORDER BY s.number DESC
  `).all(agentId) as (DbSeasonSnapshot & { season_number: number })[];

  const referralStats = getReferralStats(agentId);

  // Get followers count
  const { followers } = getDb().prepare(
    'SELECT COUNT(*) as followers FROM agent_follows WHERE following_id = ?'
  ).get(agentId) as { followers: number };

  return {
    schema: 'frostbite-reputation-v1',
    agent: {
      id: agent.id,
      name: agent.name,
      platform: 'frostbite-arena',
    },
    ratings: {
      elo: agent.elo_rating,
      tier: getEloTier(agent.elo_rating),
      level: agent.level,
      prestige: agent.prestige,
      xp: agent.xp,
    },
    stats: {
      totalBattles: agent.total_battles,
      wins: agent.wins,
      losses: agent.losses,
      winRate: agent.win_rate,
      currentStreak: agent.current_streak,
      bestStreak: agent.best_streak,
    },
    achievements: achievements.map(a => a.id),
    seasons: seasonData.map(s => ({
      number: s.season_number,
      rank: s.rank,
      eloChange: s.elo_end ? s.elo_end - s.elo_start : 0,
    })),
    social: {
      messagesSent: agent.messages_sent,
      referrals: referralStats.totalReferrals,
      followers,
    },
    economy: {
      totalStaked: agent.total_staked,
      totalEarned: agent.total_earned,
      profit: agent.profit,
      nftsMinted: agent.nfts_minted,
    },
    generatedAt: new Date().toISOString(),
  };
}

/* ===========================================================================
 * MODULE 9: PvE Quest System
 * ========================================================================= */

export interface DbQuestZone {
  id: number;
  name: string;
  element: string;
  description: string;
  lore: string;
}

export interface DbQuestDefinition {
  id: number;
  name: string;
  zone_id: number;
  difficulty: string;
  duration_secs: number;
  win_xp: number;
  loss_xp: number;
  min_level: number;
  min_power_score: number;
  base_difficulty: number;
  description: string;
  lore_intro: string;
  lore_success: string;
  lore_failure: string;
  enemy_name: string;
  active: number;
  chain_quest_id: number;
}

export interface DbQuestRun {
  id: number;
  run_id_onchain: number | null;
  quest_id: number;
  token_id: number;
  wallet_address: string;
  zone_id: number;
  difficulty: string;
  started_at: string;
  ends_at: string;
  completed_at: string | null;
  status: string;
  result: string | null;
  xp_gained: number;
  tx_hash_start: string | null;
  tx_hash_complete: string | null;
}

export function getQuestZones(): DbQuestZone[] {
  const db = getDb();
  return db.prepare('SELECT * FROM quest_zones ORDER BY id').all() as DbQuestZone[];
}

export function getQuestDefinitions(zoneId?: number): DbQuestDefinition[] {
  const db = getDb();
  if (zoneId !== undefined) {
    return db.prepare('SELECT * FROM quest_definitions WHERE zone_id = ? AND active = 1 ORDER BY id')
      .all(zoneId) as DbQuestDefinition[];
  }
  return db.prepare('SELECT * FROM quest_definitions WHERE active = 1 ORDER BY zone_id, id')
    .all() as DbQuestDefinition[];
}

export function getQuestDefinitionById(questId: number): DbQuestDefinition | null {
  const db = getDb();
  return db.prepare('SELECT * FROM quest_definitions WHERE id = ?').get(questId) as DbQuestDefinition | null;
}

export function createQuestRun(data: {
  questId: number;
  tokenId: number;
  walletAddress: string;
  zoneId: number;
  difficulty: string;
  endsAt: string;
  txHashStart?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO quest_runs (quest_id, token_id, wallet_address, zone_id, difficulty, ends_at, tx_hash_start)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.questId,
    data.tokenId,
    data.walletAddress.toLowerCase(),
    data.zoneId,
    data.difficulty,
    data.endsAt,
    data.txHashStart ?? null
  );
  return result.lastInsertRowid as number;
}

export function completeQuestRun(data: {
  questId: number;
  tokenId: number;
  walletAddress: string;
  result: 'success' | 'failure';
  xpGained: number;
  txHashComplete?: string;
}): void {
  const db = getDb();
  db.prepare(`
    UPDATE quest_runs
    SET status = 'completed', result = ?, xp_gained = ?, completed_at = datetime('now'), tx_hash_complete = ?
    WHERE quest_id = ? AND token_id = ? AND wallet_address = ? AND status = 'active'
  `).run(
    data.result,
    data.xpGained,
    data.txHashComplete ?? null,
    data.questId,
    data.tokenId,
    data.walletAddress.toLowerCase()
  );
}

export function abandonQuestRun(tokenId: number, walletAddress: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE quest_runs
    SET status = 'abandoned', completed_at = datetime('now')
    WHERE token_id = ? AND wallet_address = ? AND status = 'active'
  `).run(tokenId, walletAddress.toLowerCase());
}

export function getActiveQuestsByWallet(wallet: string): (DbQuestRun & { quest_name?: string; zone_name?: string; enemy_name?: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT qr.*, qd.name as quest_name, qz.name as zone_name, qd.enemy_name
    FROM quest_runs qr
    JOIN quest_definitions qd ON qr.quest_id = qd.id
    JOIN quest_zones qz ON qr.zone_id = qz.id
    WHERE qr.wallet_address = ? AND qr.status = 'active'
    ORDER BY qr.ends_at ASC
  `).all(wallet.toLowerCase()) as (DbQuestRun & { quest_name: string; zone_name: string; enemy_name: string })[];
}

export function getActiveQuestByToken(tokenId: number): DbQuestRun | null {
  const db = getDb();
  return db.prepare("SELECT * FROM quest_runs WHERE token_id = ? AND status = 'active' LIMIT 1")
    .get(tokenId) as DbQuestRun | null;
}

export function getQuestHistory(wallet: string, limit = 20, offset = 0): { runs: (DbQuestRun & { quest_name?: string; zone_name?: string })[]; total: number } {
  const db = getDb();
  const runs = db.prepare(`
    SELECT qr.*, qd.name as quest_name, qz.name as zone_name
    FROM quest_runs qr
    JOIN quest_definitions qd ON qr.quest_id = qd.id
    JOIN quest_zones qz ON qr.zone_id = qz.id
    WHERE qr.wallet_address = ? AND qr.status != 'active'
    ORDER BY qr.completed_at DESC
    LIMIT ? OFFSET ?
  `).all(wallet.toLowerCase(), limit, offset) as (DbQuestRun & { quest_name: string; zone_name: string })[];
  const { total } = db.prepare(
    "SELECT COUNT(*) as total FROM quest_runs WHERE wallet_address = ? AND status != 'active'"
  ).get(wallet.toLowerCase()) as { total: number };
  return { runs, total };
}

export function getPlayerQuestStats(wallet: string): { totalQuests: number; completed: number; won: number; abandoned: number; totalXp: number } {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as totalQuests,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) as abandoned,
      COALESCE(SUM(xp_gained), 0) as totalXp
    FROM quest_runs WHERE wallet_address = ?
  `).get(wallet.toLowerCase()) as { totalQuests: number; completed: number; won: number; abandoned: number; totalXp: number };
  return row;
}

/**
 * Get daily quest rotation — returns 8 quests (one per zone) for the given date.
 * Uses deterministic RNG so all players see the same quests.
 */
export function getDailyQuests(date?: Date): DbQuestDefinition[] {
  const db = getDb();
  const { getDailyQuestIds } = require('@/lib/daily-rotation');

  // Get all active quest summaries for rotation selection
  const allActive = db.prepare(
    'SELECT id, zone_id, difficulty FROM quest_definitions WHERE active = 1 ORDER BY id'
  ).all() as { id: number; zone_id: number; difficulty: string }[];

  const dailyIds = getDailyQuestIds(allActive, date) as number[];
  if (dailyIds.length === 0) return [];

  const placeholders = dailyIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM quest_definitions WHERE id IN (${placeholders}) ORDER BY zone_id`
  ).all(...dailyIds) as DbQuestDefinition[];
}

/* ---------------------------------------------------------------------------
 * Agent Skills
 * ------------------------------------------------------------------------- */

export function getAgentSkills(agentId: string | number): { skill_id: string; enabled: number }[] {
  const db = getDb();
  return db.prepare('SELECT skill_id, enabled FROM agent_skills WHERE agent_id = ?').all(agentId) as any[];
}

export function setAgentSkills(agentId: string | number, skillIds: string[]): void {
  const db = getDb();
  const del = db.prepare('DELETE FROM agent_skills WHERE agent_id = ?');
  const ins = db.prepare('INSERT INTO agent_skills (agent_id, skill_id, enabled) VALUES (?, ?, 1)');
  const tx = db.transaction(() => {
    del.run(agentId);
    for (const skillId of skillIds) {
      ins.run(agentId, skillId);
    }
  });
  tx();
}

export function toggleAgentSkill(agentId: string | number, skillId: string, enabled: boolean): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO agent_skills (agent_id, skill_id, enabled) VALUES (?, ?, ?) ON CONFLICT(agent_id, skill_id) DO UPDATE SET enabled = ?'
  ).run(agentId, skillId, enabled ? 1 : 0, enabled ? 1 : 0);
}

export function getEnabledSkillIds(agentId: string | number): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT skill_id FROM agent_skills WHERE agent_id = ? AND enabled = 1').all(agentId) as { skill_id: string }[];
  return rows.map((r) => r.skill_id);
}

/* ---------------------------------------------------------------------------
 * Agent Heartbeat Config
 * ------------------------------------------------------------------------- */

export interface DbHeartbeatConfig {
  agent_id: number;
  interval_seconds: number;
  enabled: number;
  adaptive: number;
  min_interval: number;
  max_interval: number;
  active_hours_start: number | null;
  active_hours_end: number | null;
}

export function getHeartbeatConfig(agentId: string | number): DbHeartbeatConfig | null {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_heartbeat_config WHERE agent_id = ?').get(agentId) as DbHeartbeatConfig | null;
}

export function upsertHeartbeatConfig(agentId: string | number, config: Partial<DbHeartbeatConfig>): void {
  const db = getDb();
  const existing = getHeartbeatConfig(agentId);
  if (existing) {
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [key, val] of Object.entries(config)) {
      if (key === 'agent_id') continue;
      sets.push(`${key} = ?`);
      vals.push(val);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(agentId);
    db.prepare(`UPDATE agent_heartbeat_config SET ${sets.join(', ')} WHERE agent_id = ?`).run(...vals);
  } else {
    db.prepare(
      `INSERT INTO agent_heartbeat_config (agent_id, interval_seconds, enabled, adaptive, min_interval, max_interval, active_hours_start, active_hours_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      agentId,
      config.interval_seconds ?? 30,
      config.enabled ?? 1,
      config.adaptive ?? 1,
      config.min_interval ?? 15,
      config.max_interval ?? 120,
      config.active_hours_start ?? null,
      config.active_hours_end ?? null,
    );
  }
}

/* ---------------------------------------------------------------------------
 * Agent Heartbeat Tasks
 * ------------------------------------------------------------------------- */

export interface DbHeartbeatTask {
  id: number;
  agent_id: number;
  task_id: string;
  label: string;
  check_prompt: string;
  priority: string;
  enabled: number;
}

export function getHeartbeatTasks(agentId: string | number): DbHeartbeatTask[] {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_heartbeat_tasks WHERE agent_id = ? ORDER BY priority, id').all(agentId) as DbHeartbeatTask[];
}

export function upsertHeartbeatTask(agentId: string | number, task: { task_id: string; label: string; check_prompt: string; priority: string; enabled: boolean }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO agent_heartbeat_tasks (agent_id, task_id, label, check_prompt, priority, enabled)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_id, task_id) DO UPDATE SET label = ?, check_prompt = ?, priority = ?, enabled = ?`
  ).run(
    agentId, task.task_id, task.label, task.check_prompt, task.priority, task.enabled ? 1 : 0,
    task.label, task.check_prompt, task.priority, task.enabled ? 1 : 0,
  );
}

