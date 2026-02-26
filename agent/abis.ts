// Minimal ABI fragments for the contracts used by the AI agent.
// Only the function signatures actually called are included.

export const GAME_ENGINE_ABI = [
  // Create a new game of the given type with a stake (payable)
  // GameType enum values (uint8):
  //   0 = CoinFlip, 1 = DiceRoll, 2 = RPS, 3 = NumberGuess,
  //   4 = DragonTiger, 5 = ElementalClash, 6 = CrashDice
  'function createGame(uint8 gameType) external payable returns (uint256 gameId)',

  // Join an existing game by gameId (payable, must match stake)
  'function joinGame(uint256 gameId) external payable',

  // Commit a hashed move during the commit phase
  'function commitMove(uint256 gameId, bytes32 commitHash) external',

  // Reveal the move and salt used to produce the earlier commit hash
  'function revealMove(uint256 gameId, uint8 move, bytes32 salt) external',

  // Claim the reward after a game has been resolved
  'function claimReward(uint256 gameId) external',

  // View: retrieve full game struct by id
  'function games(uint256 gameId) external view returns (uint256 id, uint8 gameType, address player1, address player2, uint256 stake, uint8 state, address winner)',

  // View: total number of games ever created
  'function gameCounter() external view returns (uint256)',
] as const;

export const AGENT_REGISTRY_ABI = [
  // Register this wallet as an AI agent with a chosen strategy label
  'function registerAgent(string calldata strategy) external',

  // Register an agent wallet with name and strategy type (wallet management)
  'function registerAgent(address wallet, string calldata name, uint8 strategyType) external',

  // Owner grants a session key that can act on behalf of the agent
  'function grantSessionKey(address sessionKey, uint256 expiry) external',

  // Grant a session key with duration in seconds (wallet management)
  'function grantSessionKey(uint256 duration) external',

  // View: check whether an address is an authorized agent (or session key)
  'function isAgentAuthorized(address agent) external view returns (bool)',

  // Update the strategy label stored on-chain for this agent
  'function updateStrategy(string calldata newStrategy) external',

  // View: look up agent data by wallet address
  'function getAgentByWallet(address wallet) external view returns (uint256 id, address walletAddr, string name, uint8 strategyType, bool active)',

  // Fund the agent's on-chain balance (payable)
  'function fundAgent() external payable',

  // Withdraw funds from the agent's on-chain balance
  'function withdrawFromAgent(uint256 _amount) external',

  // Set daily spend limit and max stake per game for the agent
  'function setSpendLimits(uint256 _dailyLimit, uint256 _maxStakePerGame) external',

  // Check and record a spend action against the agent's limits
  'function checkAndRecordSpend(address _wallet, uint256 _amount) external',

  // Emergency stop: deactivate the agent immediately
  'function emergencyStop() external',

  // Reactivate a previously stopped agent
  'function reactivateAgent() external',

  // View: get the on-chain balance for a given agent
  'function getAgentBalance(uint256 _agentId) external view returns (uint256)',
] as const;
