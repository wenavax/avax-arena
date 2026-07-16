// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FrostbiteBattleRoyale
/// @notice Battle Royale with AVAX entry fee. Min 10 players, winner takes 95%, 5% platform fee.
/// @dev Server calls startBattle() when min players reached, then declareWinner() after battle ends.
contract FrostbiteBattleRoyale is Ownable, Pausable, ReentrancyGuard {

    // ─── Constants ──────────────────────────────────────────────────────
    uint256 public constant ENTRY_FEE = 1 ether;        // 1 AVAX
    uint256 public constant MIN_PLAYERS = 10;
    uint256 public constant MAX_PLAYERS = 50;
    uint256 public constant FEE_BPS = 500;               // 5% = 500 basis points
    uint256 public constant LOBBY_TIMEOUT = 2 hours;      // Auto-refund if battle doesn't start

    // ─── Types ──────────────────────────────────────────────────────────
    enum LobbyStatus { Open, InBattle, Finished, Cancelled }

    struct Lobby {
        uint256 id;
        LobbyStatus status;
        uint256 prizePool;
        uint256 playerCount;
        uint256 createdAt;
        uint256 startedAt;
        address winner;
        bool prizeClaimed;
    }

    // ─── State ──────────────────────────────────────────────────────────
    uint256 public nextLobbyId = 1;
    uint256 public currentLobbyId;           // Active open lobby (0 = none)
    uint256 public totalFeesCollected;
    address public treasury;

    mapping(uint256 => Lobby) public lobbies;
    mapping(uint256 => address[]) public lobbyPlayers;
    mapping(uint256 => mapping(address => bool)) public isInLobby;
    mapping(address => bool) public authorized;       // Server wallets that can call startBattle/declareWinner
    mapping(address => uint256) public pendingPayouts; // Pull-payment balances

    // ─── Events ─────────────────────────────────────────────────────────
    event LobbyCreated(uint256 indexed lobbyId, uint256 timestamp);
    event PlayerJoined(uint256 indexed lobbyId, address indexed player, uint256 playerCount, uint256 prizePool);
    event BattleStarted(uint256 indexed lobbyId, uint256 playerCount, uint256 prizePool);
    event WinnerDeclared(uint256 indexed lobbyId, address indexed winner, uint256 prize);
    event PrizeClaimed(uint256 indexed lobbyId, address indexed winner, uint256 amount);
    event PlayerRefunded(uint256 indexed lobbyId, address indexed player, uint256 amount);
    event LobbyCancelled(uint256 indexed lobbyId);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event AuthorizedChanged(address indexed addr, bool status);
    event TreasuryChanged(address indexed newTreasury);

    // ─── Errors ─────────────────────────────────────────────────────────
    error WrongEntryFee();
    error LobbyFull();
    error AlreadyInLobby();
    error NoOpenLobby();
    error NotEnoughPlayers();
    error LobbyNotOpen();
    error LobbyNotInBattle();
    error LobbyNotFinished();
    error NotAuthorized();
    error NotWinner();
    error AlreadyClaimed();
    error TransferFailed();
    error NotInLobby();
    error LobbyNotTimedOut();

    // ─── Modifiers ──────────────────────────────────────────────────────
    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────
    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
    }

    // ─── Player Functions ───────────────────────────────────────────────

    /// @notice Join the current open lobby (or create one if none exists)
    function joinLobby() external payable whenNotPaused nonReentrant {
        if (msg.value != ENTRY_FEE) revert WrongEntryFee();

        // Create new lobby if none is open
        if (currentLobbyId == 0 || lobbies[currentLobbyId].status != LobbyStatus.Open) {
            _createLobby();
        }

        uint256 lobbyId = currentLobbyId;
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.playerCount >= MAX_PLAYERS) revert LobbyFull();
        if (isInLobby[lobbyId][msg.sender]) revert AlreadyInLobby();

        lobby.playerCount++;
        lobby.prizePool += msg.value;
        lobbyPlayers[lobbyId].push(msg.sender);
        isInLobby[lobbyId][msg.sender] = true;

        emit PlayerJoined(lobbyId, msg.sender, lobby.playerCount, lobby.prizePool);

        // If lobby is full, auto-close and create fresh one for next batch
        if (lobby.playerCount >= MAX_PLAYERS) {
            currentLobbyId = 0;
        }
    }

    /// @notice Leave lobby before battle starts (get refund)
    function leaveLobby(uint256 lobbyId) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];
        if (lobby.status != LobbyStatus.Open) revert LobbyNotOpen();
        if (!isInLobby[lobbyId][msg.sender]) revert NotInLobby();

        isInLobby[lobbyId][msg.sender] = false;
        lobby.playerCount--;
        lobby.prizePool -= ENTRY_FEE;

        // Remove from players array
        address[] storage players = lobbyPlayers[lobbyId];
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == msg.sender) {
                players[i] = players[players.length - 1];
                players.pop();
                break;
            }
        }

        (bool ok, ) = payable(msg.sender).call{value: ENTRY_FEE}("");
        if (!ok) revert TransferFailed();

        emit PlayerRefunded(lobbyId, msg.sender, ENTRY_FEE);
    }

    // ─── Server Functions ───────────────────────────────────────────────

    /// @notice Start the battle (server calls when min players reached)
    function startBattle(uint256 lobbyId) external onlyAuthorized {
        Lobby storage lobby = lobbies[lobbyId];
        if (lobby.status != LobbyStatus.Open) revert LobbyNotOpen();
        if (lobby.playerCount < MIN_PLAYERS) revert NotEnoughPlayers();

        lobby.status = LobbyStatus.InBattle;
        lobby.startedAt = block.timestamp;

        // If this was the current open lobby, clear it
        if (currentLobbyId == lobbyId) {
            currentLobbyId = 0;
        }

        emit BattleStarted(lobbyId, lobby.playerCount, lobby.prizePool);
    }

    /// @notice Declare the winner (server calls after battle ends)
    function declareWinner(uint256 lobbyId, address winner) external onlyAuthorized nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];
        if (lobby.status != LobbyStatus.InBattle) revert LobbyNotInBattle();
        if (!isInLobby[lobbyId][winner]) revert NotInLobby();

        lobby.status = LobbyStatus.Finished;
        lobby.winner = winner;

        // Calculate prize and fee
        uint256 fee = (lobby.prizePool * FEE_BPS) / 10000;
        uint256 prize = lobby.prizePool - fee;
        totalFeesCollected += fee;

        // Pull-payment: accumulate payouts instead of pushing
        lobby.prizeClaimed = true;
        pendingPayouts[winner] += prize;
        if (fee > 0) {
            pendingPayouts[treasury] += fee;
        }

        emit WinnerDeclared(lobbyId, winner, prize);
        emit PrizeClaimed(lobbyId, winner, prize);
    }

    // ─── Timeout / Cancel ───────────────────────────────────────────────

    /// @notice Cancel a lobby that timed out (anyone can call after LOBBY_TIMEOUT)
    function cancelTimedOutLobby(uint256 lobbyId) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];
        if (lobby.status != LobbyStatus.Open) revert LobbyNotOpen();
        if (block.timestamp < lobby.createdAt + LOBBY_TIMEOUT) revert LobbyNotTimedOut();

        lobby.status = LobbyStatus.Cancelled;
        if (currentLobbyId == lobbyId) currentLobbyId = 0;

        // Pull-payment refunds for all players
        address[] storage players = lobbyPlayers[lobbyId];
        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            if (isInLobby[lobbyId][player]) {
                isInLobby[lobbyId][player] = false;
                pendingPayouts[player] += ENTRY_FEE;
                emit PlayerRefunded(lobbyId, player, ENTRY_FEE);
            }
        }

        emit LobbyCancelled(lobbyId);
    }

    // ─── Pull Payment ────────────────────────────────────────────────────

    /// @notice Withdraw accumulated payout (prizes, refunds, fees)
    function withdrawPayout() external nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        require(amount > 0, "No payout");
        pendingPayouts[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ─── Admin ──────────────────────────────────────────────────────────

    function setAuthorized(address addr, bool auth) external onlyOwner {
        authorized[addr] = auth;
        emit AuthorizedChanged(addr, auth);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Views ──────────────────────────────────────────────────────────

    function getLobbyPlayers(uint256 lobbyId) external view returns (address[] memory) {
        return lobbyPlayers[lobbyId];
    }

    function getCurrentLobby() external view returns (Lobby memory) {
        if (currentLobbyId == 0) {
            return Lobby(0, LobbyStatus.Open, 0, 0, 0, 0, address(0), false);
        }
        return lobbies[currentLobbyId];
    }

    function getCurrentLobbyId() external view returns (uint256) {
        return currentLobbyId;
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _createLobby() internal {
        uint256 id = nextLobbyId++;
        lobbies[id] = Lobby({
            id: id,
            status: LobbyStatus.Open,
            prizePool: 0,
            playerCount: 0,
            createdAt: block.timestamp,
            startedAt: 0,
            winner: address(0),
            prizeClaimed: false
        });
        currentLobbyId = id;
        emit LobbyCreated(id, block.timestamp);
    }
}
