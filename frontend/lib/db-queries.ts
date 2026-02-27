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
