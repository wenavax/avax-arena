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

  // Owner grants a session key that can act on behalf of the agent
  'function grantSessionKey(address sessionKey, uint256 expiry) external',

  // View: check whether an address is an authorized agent (or session key)
  'function isAgentAuthorized(address agent) external view returns (bool)',

  // Update the strategy label stored on-chain for this agent
  'function updateStrategy(string calldata newStrategy) external',
] as const;
