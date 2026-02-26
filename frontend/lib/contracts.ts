export const GAME_ENGINE_ABI = [
  'function createGame(uint8 _type) external payable returns (uint256)',
  'function joinGame(uint256 _gameId) external payable',
  'function commitMove(uint256 _gameId, bytes32 _commit) external',
  'function revealMove(uint256 _gameId, uint8 _move, bytes32 _salt) external',
  'function claimTimeout(uint256 _gameId) external',
  'function getGame(uint256 _gameId) external view returns (tuple(uint256 id, uint8 gameType, address player1, address player2, uint256 stake, uint8 state, bytes32 p1Commit, bytes32 p2Commit, uint8 p1Move, uint8 p2Move, address winner, uint256 createdAt, uint256 moveDeadline))',
  'function getPlayerGames(address _player) external view returns (uint256[])',
  'function playerWins(address) external view returns (uint256)',
  'function playerTotalGames(address) external view returns (uint256)',
  'function gameCounter() external view returns (uint256)',
  'event GameCreated(uint256 indexed gameId, uint8 gameType, address indexed player1, uint256 stake)',
  'event GameJoined(uint256 indexed gameId, address indexed player2)',
  'event MoveCommitted(uint256 indexed gameId, address indexed player)',
  'event MoveRevealed(uint256 indexed gameId, address indexed player, uint8 move)',
  'event GameFinished(uint256 indexed gameId, address indexed winner, uint256 prize)',
] as const;

export const ARENA_TOKEN_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
] as const;

export const TOURNAMENT_ABI = [
  'function joinTournament(uint256 _tournamentId) external payable',
  'function getTournament(uint256 _id) external view returns (tuple(uint256 id, string name, uint256 entryFee, uint256 prizePool, uint256 startTime, uint256 endTime, bool active, address[] players))',
  'function tournamentCount() external view returns (uint256)',
] as const;

export const LEADERBOARD_ABI = [
  'function currentSeason() external view returns (uint256)',
  'function getSeasonPlayers(uint256 _season) external view returns (address[])',
  'function getPlayerScore(uint256 _season, address _player) external view returns (uint256)',
] as const;
