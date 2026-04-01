import { parseAbi } from 'viem';

export const FROSTBITE_WARRIOR_ABI = parseAbi([
  'function mint() external payable',
  'function getWarrior(uint256 tokenId) external view returns ((uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint16 level, uint256 experience, uint256 battleWins, uint256 battleLosses, uint256 powerScore))',
  'function getWarriorsByOwner(address owner) external view returns (uint256[])',
  'function getWarriorPowerScore(uint256 tokenId) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function isApprovedForAll(address owner, address operator) external view returns (bool)',
  'function setApprovalForAll(address operator, bool approved) external',
  'event WarriorMinted(address indexed owner, uint256 indexed tokenId, uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint256 powerScore)',
  'event BattleRecorded(uint256 indexed tokenId, bool won, uint256 newWins, uint256 newLosses)',
  'event LevelUp(uint256 indexed tokenId, uint16 newLevel, uint256 newPowerScore)',
  'function mergeWarriors(uint256 tokenId1, uint256 tokenId2) external payable',
  'function mergePrice() external view returns (uint256)',
  'event WarriorsMerged(address indexed owner, uint256 indexed resultTokenId, uint256 burnedTokenId1, uint256 burnedTokenId2, uint8 attack, uint8 defense, uint8 speed, uint8 element, uint8 specialPower, uint16 level, uint256 powerScore)',
]);

export const BATTLE_ENGINE_ABI = parseAbi([
  // Core battle functions
  'function createBattle(uint256 tokenId, bytes signature) external payable',
  'function joinBattle(uint256 battleId, uint256 tokenId, bytes signature) external payable',
  'function cancelBattle(uint256 battleId) external',
  'function claimTimeout(uint256 battleId) external',

  // Existing view functions
  'function getOpenBattles(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getOpenBattleCount() external view returns (uint256)',
  'function getBattle(uint256 battleId) external view returns ((uint256 id, address player1, address player2, uint256 nft1, uint256 nft2, uint256 stake, address winner, bool resolved, uint256 createdAt, uint256 resolvedAt))',
  'function getBattleHistory(address player) external view returns (uint256[])',
  'function battleCounter() external view returns (uint256)',

  // Platform stats
  'function getPlatformStats() external view returns (uint256 totalBattles, uint256 totalWagered, uint256 totalFees)',

  // Pagination
  'function getResolvedBattles(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getResolvedBattleCount() external view returns (uint256)',
  'function getPlayerBattlesPaginated(address player, uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getPlayerBattleCount(address player) external view returns (uint256)',

  // Pausable
  'function paused() external view returns (bool)',

  // Admin
  'function admins(address) external view returns (bool)',

  // Payout
  'function withdrawPayout() external',
  'function pendingPayouts(address) external view returns (uint256)',

  // Nonce
  'function nonces(address) external view returns (uint256)',

  // Events
  'event BattleCreated(uint256 indexed battleId, address indexed player1, uint256 tokenId, uint256 stake)',
  'event BattleJoined(uint256 indexed battleId, address indexed player2, uint256 tokenId)',
  'event BattleResolved(uint256 indexed battleId, address indexed winner, address indexed loser, uint256 payout)',
  'event BattleCancelled(uint256 indexed battleId, address indexed player)',
  'event AdminAdded(address indexed admin)',
  'event AdminRemoved(address indexed admin)',
]);

export const TEAM_BATTLE_ABI = parseAbi([
  // Core functions
  'function createTeamBattle(uint256[3] tokenIds, bytes signature) external payable',
  'function joinTeamBattle(uint256 battleId, uint256[3] tokenIds, bytes signature) external payable',
  'function cancelTeamBattle(uint256 battleId) external',
  'function claimTimeout(uint256 battleId) external',

  // View functions
  'function getOpenTeamBattles(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getOpenTeamBattleCount() external view returns (uint256)',
  'function getTeamBattle(uint256 battleId) external view returns (uint256 id, address player1, address player2, uint256[3] team1, uint256[3] team2, uint256 stake, uint8 score1, uint8 score2, uint8[3] matchups, address winner, bool resolved, uint256 createdAt, uint256 resolvedAt)',
  'function getTeamBattleHistory(address player) external view returns (uint256[])',
  'function battleCounter() external view returns (uint256)',

  // Platform stats
  'function getPlatformStats() external view returns (uint256 totalBattles, uint256 totalWagered, uint256 totalFees)',

  // Pagination
  'function getResolvedTeamBattles(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getResolvedTeamBattleCount() external view returns (uint256)',
  'function getPlayerTeamBattlesPaginated(address player, uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getPlayerTeamBattleCount(address player) external view returns (uint256)',

  // Pausable
  'function paused() external view returns (bool)',

  // Payout
  'function withdrawPayout() external',
  'function pendingPayouts(address) external view returns (uint256)',

  // Nonce
  'function nonces(address) external view returns (uint256)',

  // Events
  'event TeamBattleCreated(uint256 indexed battleId, address indexed player1, uint256[3] team, uint256 stake)',
  'event TeamBattleJoined(uint256 indexed battleId, address indexed player2, uint256[3] team)',
  'event TeamBattleResolved(uint256 indexed battleId, address indexed winner, address indexed loser, uint8 score1, uint8 score2, uint256 payout)',
  'event TeamBattleCancelled(uint256 indexed battleId, address indexed player)',
]);

export const FROSTBITE_TOKEN_ABI = parseAbi([
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
]);

export const MARKETPLACE_ABI = parseAbi([
  'function listItem(uint256 tokenId, uint256 price) external',
  'function cancelListing(uint256 tokenId) external',
  'function buyItem(uint256 tokenId) external payable',
  'function makeOffer(uint256 tokenId) external payable',
  'function cancelOffer(uint256 tokenId) external',
  'function acceptOffer(uint256 tokenId, address offerer) external',
  'function createAuction(uint256 tokenId, uint256 startPrice, uint256 duration) external',
  'function placeBid(uint256 tokenId) external payable',
  'function endAuction(uint256 tokenId) external',
  'function cancelAuction(uint256 tokenId) external',
  'function getListing(uint256 tokenId) external view returns ((address seller, uint256 price, bool active))',
  'function getAuction(uint256 tokenId) external view returns ((address seller, uint256 startPrice, uint256 highestBid, address highestBidder, uint256 startTime, uint256 endTime, bool active, bool settled))',
  'function getOffers(uint256 tokenId) external view returns ((address offerer, uint256 amount, uint256 timestamp)[])',
  'function getActiveListings(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getActiveListingCount() external view returns (uint256)',
  'function getActiveAuctions(uint256 offset, uint256 limit) external view returns (uint256[])',
  'function getActiveAuctionCount() external view returns (uint256)',
  'event ItemListed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event ListingCancelled(uint256 indexed tokenId, address indexed seller)',
  'event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)',
  'event OfferMade(uint256 indexed tokenId, address indexed offerer, uint256 amount)',
  'event OfferCancelled(uint256 indexed tokenId, address indexed offerer)',
  'event OfferAccepted(uint256 indexed tokenId, address indexed seller, address indexed offerer, uint256 amount)',
  'event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 startPrice, uint256 endTime)',
  'event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount)',
  'event AuctionEnded(uint256 indexed tokenId, address indexed seller, address indexed winner, uint256 amount)',
  'event AuctionCancelled(uint256 indexed tokenId, address indexed seller)',
]);

export const QUEST_ENGINE_ABI = parseAbi([
  'function updateQuest(uint256 questId, uint256 duration, uint256 winXP, uint256 lossXP, uint16 minLevel, uint256 minPowerScore, uint16 baseDifficulty) external',
  'function startQuest(uint256 tokenId, uint256 questId) external',
  'function completeQuest(uint256 tokenId) external',
  'function abandonQuest(uint256 tokenId) external',
  'function getQuest(uint256 questId) external view returns ((uint256 id, string name, uint8 zone, uint8 difficulty, uint256 duration, uint256 winXP, uint256 lossXP, uint16 minLevel, uint256 minPowerScore, uint16 baseDifficulty, bool active))',
  'function getActiveQuest(uint256 tokenId) external view returns ((uint256 questId, uint256 tokenId, address player, uint256 startedAt, uint256 endsAt, bool completed, bool won))',
  'function isWarriorOnQuest(uint256 tokenId) external view returns (bool)',
  'function getQuestsByZone(uint8 zone) external view returns ((uint256 id, string name, uint8 zone, uint8 difficulty, uint256 duration, uint256 winXP, uint256 lossXP, uint16 minLevel, uint256 minPowerScore, uint16 baseDifficulty, bool active)[])',
  'function getQuestStats() external view returns (uint256 totalStarted, uint256 totalCompleted, uint256 totalWon, uint256 questCount)',
  'function getSuccessChance(uint256 tokenId, uint256 questId) external view returns (uint256)',
  'function questCount() external view returns (uint256)',
  'function getWalletProgression(address wallet) external view returns ((uint256 tier, uint256 questsCompleted, uint256 questsWon, uint256 totalXP, uint256 tierProgress))',
  'event QuestStarted(uint256 indexed questId, uint256 indexed tokenId, address indexed player, uint256 endsAt)',
  'event QuestCompleted(uint256 indexed questId, uint256 indexed tokenId, address indexed player, bool won, uint256 xpGained)',
  'event QuestAbandoned(uint256 indexed questId, uint256 indexed tokenId, address indexed player)',
  'event TierAdvanced(address indexed player, uint256 newTier, uint256 totalCompleted, uint256 totalXP)',
]);

export const BATCH_MINTER_ABI = parseAbi([
  'function batchMint(uint256 quantity) external payable',
  'function MINT_PRICE() external view returns (uint256)',
  'function MAX_BATCH_SIZE() external view returns (uint256)',
  'event BatchMinted(address indexed to, uint256 quantity, uint256[] tokenIds)',
]);

/* ---- ERC-6551 Token Bound Accounts ---- */

export const ERC6551_REGISTRY_ABI = parseAbi([
  'function createAccount(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) external returns (address)',
  'function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) external view returns (address)',
]);

export const FROSTBITE_ACCOUNT_ABI = parseAbi([
  'function execute(address to, uint256 value, bytes data, uint8 operation) external payable returns (bytes)',
  'function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId)',
  'function state() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function isValidSigner(address signer, bytes context) external view returns (bytes4)',
  'event Executed(address indexed to, uint256 value, bytes data, uint256 newState)',
  'event Received(address indexed from, uint256 amount)',
]);

/* ---- Phase 3: FrostbiteAccountV2 (Delegation-enabled TBA) ---- */

export const FROSTBITE_ACCOUNT_V2_ABI = parseAbi([
  // V1 functions
  'function execute(address to, uint256 value, bytes data, uint8 operation) external payable returns (bytes)',
  'function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId)',
  'function state() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function isValidSigner(address signer, bytes context) external view returns (bytes4)',

  // V2 delegation functions
  'function addDelegate(address delegate) external',
  'function removeDelegate(address delegate) external',
  'function isDelegate(address addr) external view returns (bool)',

  // Events
  'event Executed(address indexed to, uint256 value, bytes data, uint256 newState)',
  'event Received(address indexed from, uint256 amount)',
  'event DelegateAdded(address indexed delegate)',
  'event DelegateRemoved(address indexed delegate)',
]);

/* ---- Phase 4: FrostbiteAccountV3 (Ultimate Secure TBA) ---- */

export const FROSTBITE_ACCOUNT_V3_ABI = parseAbi([
  // ERC-6551 Core
  'function execute(address to, uint256 value, bytes data, uint8 operation) external payable returns (bytes)',
  'function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId)',
  'function state() external view returns (uint256)',
  'function owner() external view returns (address)',
  'function isValidSigner(address signer, bytes context) external view returns (bytes4)',

  // Delegation Management
  'function addDelegate(address delegate, uint256 expiresAt, uint256 budget) external',
  'function removeDelegate(address delegate) external',
  'function setDelegateBudget(address delegate, uint256 budget) external',
  'function isDelegate(address addr) external view returns (bool)',
  'function getDelegateInfo(address addr) external view returns ((bool active, address authorizedBy, uint256 expiresAt, uint256 budgetTotal, uint256 budgetSpent))',
  'function delegateBudgetRemaining(address delegate) external view returns (uint256)',

  // Target & Selector Management
  'function setAllowedTarget(address target, bool allowed) external',
  'function isAllowedTarget(address target) external view returns (bool)',
  'function setDelegateSpendLimit(uint256 limit) external',
  'function delegateSpendLimit() external view returns (uint256)',
  'function setDelegateAllowedSelector(address target, bytes4 selector, bool allowed) external',
  'function isDelegateAllowedSelector(address target, bytes4 selector) external view returns (bool)',

  // Lock & Freeze
  'function lock(uint256 duration) external',
  'function unlock() external',
  'function lockedUntil() external view returns (uint256)',
  'function emergencyFrozen() external view returns (bool)',
  'function MAX_LOCK_DURATION() external view returns (uint256)',

  // Guardian & Emergency
  'function setGuardian(address _guardian) external',
  'function guardian() external view returns (address)',
  'function emergencyFreeze() external',
  'function emergencyUnfreeze() external',

  // Cooldown
  'function setDelegateCooldown(uint256 seconds_) external',
  'function delegateCooldown() external view returns (uint256)',
  'function lastDelegateExecTime(address delegate) external view returns (uint256)',

  // Sweep
  'function sweepAVAX(address to) external',

  // Events
  'event DelegateAdded(address indexed delegate, uint256 expiresAt, uint256 budget)',
  'event DelegateRemoved(address indexed delegate)',
  'event DelegateBudgetSet(address indexed delegate, uint256 budget)',
  'event Locked(uint256 until)',
  'event Unlocked()',
  'event EmergencyFrozen(address indexed by)',
  'event EmergencyUnfrozen()',
  'event Swept(address indexed to, uint256 amount)',
  'event GuardianSet(address indexed guardian)',
  'event Executed(address indexed to, uint256 value, bytes data, uint256 newState)',
  'event Received(address indexed from, uint256 amount)',
]);

/* ---- Phase 2: Identity & Reputation Registries ---- */

export const IDENTITY_REGISTRY_ABI = parseAbi([
  // Write functions
  'function registerAgent(uint256 tokenId, string metadataURI) external',
  'function updateMetadata(uint256 tokenId, string newURI) external',
  'function setAutoMode(uint256 tokenId, bool enabled) external',

  // View functions
  'function getAgent(uint256 tokenId) external view returns ((uint256 agentId, uint256 tokenId, address tbaAddress, string metadataURI, uint256 registeredAt, bool autoMode))',
  'function getAgentByAddress(address tba) external view returns ((uint256 agentId, uint256 tokenId, address tbaAddress, string metadataURI, uint256 registeredAt, bool autoMode))',
  'function isRegistered(uint256 tokenId) external view returns (bool)',
  'function totalAgents() external view returns (uint256)',
  'function getAutoModeAgents() external view returns (uint256[])',
  'function getAutoModeAgentCount() external view returns (uint256)',
  'function computeTBA(uint256 tokenId) external view returns (address)',

  // Immutables
  'function erc6551Registry() external view returns (address)',
  'function frostbiteAccountImpl() external view returns (address)',
  'function arenaWarrior() external view returns (address)',
  'function tbaChainId() external view returns (uint256)',

  // Events
  'event AgentRegistered(uint256 indexed agentId, uint256 indexed tokenId, address indexed tbaAddress, string metadataURI)',
  'event MetadataUpdated(uint256 indexed tokenId, string newURI)',
  'event AutoModeToggled(uint256 indexed tokenId, bool enabled)',
]);

export const REPUTATION_REGISTRY_ABI = parseAbi([
  // Write functions (authorized callers only)
  'function postBattleResult(uint256 tokenId, bool won, uint256 avaxStake, uint8 warriorElement, uint8 opponentElement) external',
  'function postQuestResult(uint256 tokenId, bool completed, uint256 xpGained) external',

  // Owner functions
  'function addAuthorizedCaller(address caller) external',
  'function removeAuthorizedCaller(address caller) external',

  // View functions
  'function getReputation(uint256 tokenId) external view returns ((uint256 totalBattles, uint256 wins, uint256 losses, uint256 totalQuests, uint256 questsCompleted, uint256 questsFailed, uint256 totalXpEarned, uint256 totalAvaxEarned, uint256 totalAvaxLost, uint256[8] elementWins, uint256 lastActive, uint256 overallScore))',
  'function getOverallScore(uint256 tokenId) external view returns (uint256)',
  'function getElementMastery(uint256 tokenId, uint8 element) external view returns (uint256)',
  'function getTopAgents(uint256 limit) external view returns (uint256[], uint256[])',
  'function getLeaderboardSize() external view returns (uint256)',
  'function authorizedCallers(address) external view returns (bool)',

  // Events
  'event BattleResultPosted(uint256 indexed tokenId, bool won, uint256 avaxStake, uint256 newScore)',
  'event QuestResultPosted(uint256 indexed tokenId, bool completed, uint256 xpGained, uint256 newScore)',
  'event AuthorizedCallerAdded(address indexed caller)',
  'event AuthorizedCallerRemoved(address indexed caller)',
]);

