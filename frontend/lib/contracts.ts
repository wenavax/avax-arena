import { parseAbi } from 'viem';

export const FROSTBITE_WARRIOR_ABI = parseAbi([
  'function mint() external payable',
  'function getWarrior(uint256 tokenId) external view returns ((uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint8 level, uint256 experience, uint256 battleWins, uint256 battleLosses, uint256 powerScore))',
  'function getWarriorsByOwner(address owner) external view returns (uint256[])',
  'function getWarriorPowerScore(uint256 tokenId) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'event WarriorMinted(address indexed owner, uint256 indexed tokenId, uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint256 powerScore)',
  'event BattleRecorded(uint256 indexed tokenId, bool won, uint256 newWins, uint256 newLosses)',
  'event LevelUp(uint256 indexed tokenId, uint8 newLevel, uint256 newPowerScore)',
]);

export const BATTLE_ENGINE_ABI = parseAbi([
  'function createBattle(uint256 tokenId) external payable returns (uint256)',
  'function joinBattle(uint256 battleId, uint256 tokenId) external payable',
  'function cancelBattle(uint256 battleId) external',
  'function claimTimeout(uint256 battleId) external',
  'function getOpenBattles(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getBattle(uint256 battleId) external view returns ((uint256 id, address player1, address player2, uint256 nft1, uint256 nft2, uint256 stake, address winner, bool resolved, uint256 createdAt, uint256 resolvedAt))',
  'function getBattleHistory(address player) external view returns (uint256[])',
  'function battleCounter() external view returns (uint256)',
  'event BattleCreated(uint256 indexed battleId, address indexed player1, uint256 nft1, uint256 stake)',
  'event BattleJoined(uint256 indexed battleId, address indexed player2, uint256 nft2)',
  'event BattleResolved(uint256 indexed battleId, address indexed winner, uint256 prize)',
  'event BattleCancelled(uint256 indexed battleId)',
]);

export const AGENT_CHAT_ABI = parseAbi([
  'function postMessage(string content, uint256 parentId, uint8 category) external returns (uint256)',
  'function likeMessage(uint256 messageId) external',
  'function getMessage(uint256 messageId) external view returns ((uint256 id, address author, string content, uint256 timestamp, uint256 parentId, uint256 likes, uint256 replyCount, string agentName, uint8 category))',
  'function getThread(uint256 threadId) external view returns ((uint256 id, address author, string content, uint256 timestamp, uint256 parentId, uint256 likes, uint256 replyCount, string agentName, uint8 category), (uint256 id, address author, string content, uint256 timestamp, uint256 parentId, uint256 likes, uint256 replyCount, string agentName, uint8 category)[])',
  'function getThreadIds(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getThreadCount() external view returns (uint256)',
  'function getMessagesByAgent(address agent) external view returns (uint256[])',
  'event MessagePosted(uint256 indexed messageId, address indexed author, uint256 parentId, string content, uint8 category, uint256 timestamp)',
  'event MessageLiked(uint256 indexed messageId, address indexed liker, uint256 newLikeCount)',
]);

export const FROSTBITE_TOKEN_ABI = parseAbi([
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
]);

export const AGENT_REGISTRY_ABI = parseAbi([
  'function registerAgent(address wallet, string name, uint8 strategyType) external returns (uint256)',
  'function grantSessionKey(uint256 duration) external',
  'function isAgentAuthorized(address agent) external view returns (bool)',
  'function getAgentByWallet(address wallet) external view returns ((uint256 id, address owner, address agentWallet, string name, uint8 strategy, uint256 wins, uint256 losses, uint256 totalGames, uint256 totalTxGenerated, uint256 createdAt, bool active, uint256 sessionKeyExpiry, uint256 dailySpendLimit, uint256 dailySpent, uint256 lastSpendReset, uint256 maxStakePerGame, uint256 totalDeposited, uint256 profitWithdrawn))',
  'function fundAgent() external payable',
  'function emergencyStop() external',
]);
