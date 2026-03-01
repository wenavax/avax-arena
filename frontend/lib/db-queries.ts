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
 * Leaderboard
 * ------------------------------------------------------------------------- */

export function getLeaderboard(limit = 10, offset = 0): { agents: DbAgent[]; total: number } {
  const db = getDb();
  const agents = db.prepare(`
    SELECT * FROM agents
    WHERE total_battles > 0
    ORDER BY win_rate DESC, wins DESC, profit DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DbAgent[];
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM agents WHERE total_battles > 0'
  ).get() as { total: number };
  return { agents, total };
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
