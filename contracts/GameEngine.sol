// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILeaderboard {
    function updateScore(address _player, uint256 _points) external;
}

/**
 * @title GameEngine
 * @notice Commit-reveal mini-game engine for AVAX Arena.
 *         Supports RPS, CoinFlip, and other game types.
 *         Players stake AVAX; winner receives 97.5% of the pot,
 *         2.5% platform fee is forwarded to the RewardVault.
 */
contract GameEngine is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum GameType { CoinFlip, DiceRoll, RPS, NumberGuess }
    enum GameState { Waiting, Active, Finished }

    struct Game {
        address player1;
        address player2;
        uint256 stake;
        GameState state;
        GameType gameType;
        address winner;
        bytes32 commit1;
        bytes32 commit2;
        uint8 move1;
        uint8 move2;
        bool revealed1;
        bool revealed2;
        uint256 createdAt;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MIN_STAKE = 0.01 ether;
    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    uint256 public constant FEE_BASE = 10_000;
    uint256 public constant WIN_POINTS = 100;
    uint256 public constant GAME_TIMEOUT = 1 hours;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public rewardVault;
    ILeaderboard public leaderboard;
    uint256 public gameCounter;

    mapping(uint256 => Game) private _games;
    mapping(address => uint256) public playerWins;
    mapping(address => uint256) public playerTotalGames;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event GameCreated(
        uint256 indexed gameId,
        GameType gameType,
        address indexed player1,
        uint256 stake
    );

    event GameJoined(uint256 indexed gameId, address indexed player2);

    event MoveCommitted(uint256 indexed gameId, address indexed player);

    event MoveRevealed(
        uint256 indexed gameId,
        address indexed player,
        uint8 move
    );

    event GameFinished(
        uint256 indexed gameId,
        address indexed winner,
        uint256 payout
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error StakeTooLow();
    error StakeMismatch();
    error CannotJoinOwnGame();
    error AlreadyCommitted();
    error NotAPlayer();
    error InvalidReveal();
    error GameNotActive();
    error GameNotWaiting();
    error TransferFailed();
    error InvalidMove();
    error GameNotTimedOut();
    error GameAlreadyFinished();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _rewardVault,
        address _leaderboard
    ) Ownable(msg.sender) {
        rewardVault = _rewardVault;
        leaderboard = ILeaderboard(_leaderboard);
    }

    // -------------------------------------------------------------------------
    // External Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new game by staking AVAX.
     * @param _gameType The type of game to play.
     */
    function createGame(GameType _gameType) external payable nonReentrant {
        if (msg.value < MIN_STAKE) revert StakeTooLow();

        gameCounter++;

        _games[gameCounter] = Game({
            player1: msg.sender,
            player2: address(0),
            stake: msg.value,
            state: GameState.Waiting,
            gameType: _gameType,
            winner: address(0),
            commit1: bytes32(0),
            commit2: bytes32(0),
            move1: 0,
            move2: 0,
            revealed1: false,
            revealed2: false,
            createdAt: block.timestamp
        });

        emit GameCreated(gameCounter, _gameType, msg.sender, msg.value);
    }

    /**
     * @notice Join an existing game by matching the stake.
     * @param _gameId The ID of the game to join.
     */
    function joinGame(uint256 _gameId) external payable nonReentrant {
        Game storage game = _games[_gameId];
        if (game.state != GameState.Waiting) revert GameNotWaiting();
        if (msg.sender == game.player1) revert CannotJoinOwnGame();
        if (msg.value != game.stake) revert StakeMismatch();

        game.player2 = msg.sender;
        game.state = GameState.Active;

        emit GameJoined(_gameId, msg.sender);
    }

    /**
     * @notice Submit a hashed move commitment.
     * @param _gameId The game ID.
     * @param _commitHash keccak256(abi.encodePacked(uint8 move, bytes32 salt))
     */
    function commitMove(uint256 _gameId, bytes32 _commitHash) external {
        Game storage game = _games[_gameId];
        if (game.state != GameState.Active) revert GameNotActive();

        if (msg.sender == game.player1) {
            if (game.commit1 != bytes32(0)) revert AlreadyCommitted();
            game.commit1 = _commitHash;
        } else if (msg.sender == game.player2) {
            if (game.commit2 != bytes32(0)) revert AlreadyCommitted();
            game.commit2 = _commitHash;
        } else {
            revert NotAPlayer();
        }

        emit MoveCommitted(_gameId, msg.sender);
    }

    /**
     * @notice Reveal your committed move. When both players have revealed
     *         the game resolves automatically.
     * @param _gameId The game ID.
     * @param _move   The original move value.
     * @param _salt   The original salt used in the commitment.
     */
    function revealMove(
        uint256 _gameId,
        uint8 _move,
        bytes32 _salt
    ) external nonReentrant {
        Game storage game = _games[_gameId];
        if (game.state != GameState.Active) revert GameNotActive();

        // Validate move based on game type
        if (game.gameType == GameType.RPS) {
            if (_move < 1 || _move > 3) revert InvalidMove();
        } else if (game.gameType == GameType.CoinFlip) {
            if (_move > 1) revert InvalidMove();
        }

        bytes32 computedHash = keccak256(abi.encodePacked(_move, _salt));

        if (msg.sender == game.player1) {
            if (computedHash != game.commit1) revert InvalidReveal();
            game.move1 = _move;
            game.revealed1 = true;
        } else if (msg.sender == game.player2) {
            if (computedHash != game.commit2) revert InvalidReveal();
            game.move2 = _move;
            game.revealed2 = true;
        } else {
            revert NotAPlayer();
        }

        emit MoveRevealed(_gameId, msg.sender, _move);

        // Auto-resolve when both moves are revealed
        if (game.revealed1 && game.revealed2) {
            _resolveGame(_gameId);
        }
    }

    /**
     * @notice Cancel a game that is still waiting for an opponent.
     *         Only player1 can cancel. Refunds player1's stake.
     * @param _gameId The game ID to cancel.
     */
    function cancelGame(uint256 _gameId) external nonReentrant {
        Game storage game = _games[_gameId];
        if (game.state != GameState.Waiting) revert GameNotWaiting();
        if (msg.sender != game.player1) revert NotAPlayer();

        game.state = GameState.Finished;

        emit GameFinished(_gameId, address(0), 0);

        (bool success, ) = game.player1.call{value: game.stake}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Claim a game timeout. If a game has been inactive for longer
     *         than GAME_TIMEOUT, resolve based on who participated.
     * @param _gameId The game ID to claim timeout on.
     */
    function claimTimeout(uint256 _gameId) external nonReentrant {
        Game storage game = _games[_gameId];
        if (game.state == GameState.Finished) revert GameAlreadyFinished();
        if (game.state == GameState.Waiting) {
            // Waiting too long, no opponent joined
            if (block.timestamp < game.createdAt + GAME_TIMEOUT) revert GameNotTimedOut();
            if (msg.sender != game.player1) revert NotAPlayer();
            game.state = GameState.Finished;
            emit GameFinished(_gameId, address(0), 0);
            (bool success, ) = game.player1.call{value: game.stake}("");
            if (!success) revert TransferFailed();
            return;
        }
        // Active state
        if (block.timestamp < game.createdAt + GAME_TIMEOUT) revert GameNotTimedOut();

        game.state = GameState.Finished;
        uint256 totalPot = game.stake * 2;

        // Determine winner based on who participated
        if (!game.revealed1 && !game.revealed2) {
            // Neither revealed — refund both
            emit GameFinished(_gameId, address(0), 0);
            (bool s1, ) = game.player1.call{value: game.stake}("");
            if (!s1) revert TransferFailed();
            (bool s2, ) = game.player2.call{value: game.stake}("");
            if (!s2) revert TransferFailed();
        } else if (game.revealed1 && !game.revealed2) {
            // Player1 revealed, player2 didn't — player1 wins
            game.winner = game.player1;
            uint256 fee = (totalPot * PLATFORM_FEE_BPS) / FEE_BASE;
            uint256 payout = totalPot - fee;
            emit GameFinished(_gameId, game.player1, payout);
            (bool feeOk, ) = rewardVault.call{value: fee}("");
            if (!feeOk) revert TransferFailed();
            (bool payOk, ) = game.player1.call{value: payout}("");
            if (!payOk) revert TransferFailed();
        } else if (!game.revealed1 && game.revealed2) {
            // Player2 revealed, player1 didn't — player2 wins
            game.winner = game.player2;
            uint256 fee = (totalPot * PLATFORM_FEE_BPS) / FEE_BASE;
            uint256 payout = totalPot - fee;
            emit GameFinished(_gameId, game.player2, payout);
            (bool feeOk, ) = rewardVault.call{value: fee}("");
            if (!feeOk) revert TransferFailed();
            (bool payOk, ) = game.player2.call{value: payout}("");
            if (!payOk) revert TransferFailed();
        } else {
            // Both committed both revealed but somehow not resolved — just refund
            emit GameFinished(_gameId, address(0), 0);
            (bool s1, ) = game.player1.call{value: game.stake}("");
            if (!s1) revert TransferFailed();
            (bool s2, ) = game.player2.call{value: game.stake}("");
            if (!s2) revert TransferFailed();
        }
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getGame(uint256 _gameId) external view returns (Game memory) {
        return _games[_gameId];
    }

    // -------------------------------------------------------------------------
    // Internal Functions
    // -------------------------------------------------------------------------

    function _resolveGame(uint256 _gameId) internal {
        Game storage game = _games[_gameId];

        // --- Effects ---
        game.state = GameState.Finished;

        address winner = _determineWinner(game);
        game.winner = winner;

        playerTotalGames[game.player1]++;
        playerTotalGames[game.player2]++;

        uint256 totalPot = game.stake * 2;

        // --- Interactions ---
        if (winner == address(0)) {
            // Draw — refund both players, no fee
            emit GameFinished(_gameId, address(0), 0);

            (bool s1, ) = game.player1.call{value: game.stake}("");
            if (!s1) revert TransferFailed();
            (bool s2, ) = game.player2.call{value: game.stake}("");
            if (!s2) revert TransferFailed();
        } else {
            // Winner takes pot minus fee
            uint256 fee = (totalPot * PLATFORM_FEE_BPS) / FEE_BASE;
            uint256 payout = totalPot - fee;

            playerWins[winner]++;

            // Update leaderboard for the winner (wrapped in try-catch so failure doesn't block resolution)
            try leaderboard.updateScore(winner, WIN_POINTS) {} catch {}

            emit GameFinished(_gameId, winner, payout);

            // Send fee to reward vault
            (bool feeOk, ) = rewardVault.call{value: fee}("");
            if (!feeOk) revert TransferFailed();

            // Send payout to winner
            (bool payOk, ) = winner.call{value: payout}("");
            if (!payOk) revert TransferFailed();
        }
    }

    function _determineWinner(
        Game storage game
    ) internal view returns (address) {
        if (game.gameType == GameType.RPS) {
            return _resolveRPS(game);
        } else if (game.gameType == GameType.CoinFlip) {
            return _resolveCoinFlip(game);
        }
        // Fallback for unimplemented types
        revert("Unimplemented game type");
    }

    /**
     * @dev RPS rules: Rock(1) > Scissors(3), Scissors(3) > Paper(2), Paper(2) > Rock(1).
     *      Same move = draw (address(0)).
     */
    function _resolveRPS(
        Game storage game
    ) internal view returns (address) {
        uint8 m1 = game.move1;
        uint8 m2 = game.move2;

        if (m1 == m2) return address(0);

        if (
            (m1 == 1 && m2 == 3) || // Rock beats Scissors
            (m1 == 3 && m2 == 2) || // Scissors beats Paper
            (m1 == 2 && m2 == 1)    // Paper beats Rock
        ) {
            return game.player1;
        }
        return game.player2;
    }

    /**
     * @dev CoinFlip: sum of both moves. Even sum => player1 wins, odd => player2.
     */
    function _resolveCoinFlip(
        Game storage game
    ) internal view returns (address) {
        uint256 sum = uint256(game.move1) + uint256(game.move2);
        if (sum % 2 == 0) {
            return game.player1;
        }
        return game.player2;
    }
}
