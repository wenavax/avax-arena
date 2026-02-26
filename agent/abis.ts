// Minimal ABI fragments for the contracts used by the AI agent.

export const ARENA_WARRIOR_ABI = [
  'function mint() external payable returns (uint256)',
  'function getWarrior(uint256 tokenId) external view returns (tuple(uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint8 level, uint256 experience, uint256 battleWins, uint256 battleLosses, uint256 powerScore))',
  'function getWarriorsByOwner(address owner) external view returns (uint256[])',
  'function getWarriorPowerScore(uint256 tokenId) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function totalSupply() external view returns (uint256)',
  'event WarriorMinted(uint256 indexed tokenId, address indexed owner, uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint256 powerScore)',
] as const;

export const BATTLE_ENGINE_ABI = [
  'function createBattle(uint256 tokenId) external payable returns (uint256)',
  'function joinBattle(uint256 battleId, uint256 tokenId) external payable',
  'function cancelBattle(uint256 battleId) external',
  'function getOpenBattles() external view returns (uint256[])',
  'function getBattle(uint256 battleId) external view returns (tuple(uint256 id, address player1, address player2, uint256 nft1, uint256 nft2, uint256 stake, address winner, bool resolved, uint256 createdAt, uint256 resolvedAt))',
  'function getBattleHistory(address player) external view returns (uint256[])',
  'function battleCounter() external view returns (uint256)',
  'event BattleCreated(uint256 indexed battleId, address indexed player1, uint256 nft1, uint256 stake)',
  'event BattleResolved(uint256 indexed battleId, address indexed winner, uint256 prize)',
] as const;

export const AGENT_CHAT_ABI = [
  'function postMessage(string content, uint256 parentId, uint8 category) external returns (uint256)',
  'function likeMessage(uint256 messageId) external',
  'function getMessage(uint256 messageId) external view returns (tuple(uint256 id, address author, string content, uint256 timestamp, uint256 parentId, uint256 likes, uint256 replyCount, string agentName, uint8 category))',
  'function getThreadIds(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getThreadCount() external view returns (uint256)',
] as const;

export const AGENT_REGISTRY_ABI = [
  'function registerAgent(address wallet, string calldata name, uint8 strategyType) external returns (uint256)',
  'function grantSessionKey(uint256 duration) external',
  'function isAgentAuthorized(address agent) external view returns (bool)',
  'function getAgentByWallet(address wallet) external view returns (tuple(uint256 id, address owner, address agentWallet, string name, uint8 strategy, uint256 wins, uint256 losses, uint256 totalGames, uint256 totalTxGenerated, uint256 createdAt, bool active, uint256 sessionKeyExpiry, uint256 dailySpendLimit, uint256 dailySpent, uint256 lastSpendReset, uint256 maxStakePerGame, uint256 totalDeposited, uint256 profitWithdrawn))',
  'function fundAgent() external payable',
  'function withdrawFromAgent(uint256 _amount) external',
  'function setSpendLimits(uint256 _dailyLimit, uint256 _maxStakePerGame) external',
  'function checkAndRecordSpend(address _wallet, uint256 _amount) external',
  'function emergencyStop() external',
  'function reactivateAgent() external',
  'function getAgentBalance(uint256 _agentId) external view returns (uint256)',
] as const;
