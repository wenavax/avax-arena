// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Interface for the leaderboard contract called after game resolution.
interface ILeaderboard {
    function updateScore(address player, uint256 score) external;
}

/// @title GameEngine
/// @notice Main game contract for AVAX Arena supporting commit-reveal gameplay
///         across multiple game types (CoinFlip, DiceRoll, RPS, NumberGuess).
contract GameEngine is Ownable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    // Enums
    // -----------------------------------------------------------------------

    enum GameState { Waiting, Active, Finished }
    enum GameType  { CoinFlip, DiceRoll, RPS, NumberGuess, DragonTiger, ElementalClash, CrashDice }

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    struct Game {
        uint256   id;
        GameType  gameType;
        address   player1;
        address   player2;
        uint256   stake;
        GameState state;
        bytes32   p1Commit;
        bytes32   p2Commit;
        uint8     p1Move;
        uint8     p2Move;
        address   winner;
        uint256   createdAt;
        uint256   moveDeadline;
    }

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint256 public constant MIN_STAKE     = 0.01 ether;
    uint256 public constant PLATFORM_FEE  = 250;          // 2.5% (basis points)
    uint256 public constant FEE_BASE      = 10_000;
    uint256 public constant MOVE_TIMEOUT  = 5 minutes;

    // -----------------------------------------------------------------------
    // State variables
    // -----------------------------------------------------------------------

    uint256 public gameCounter;

    mapping(uint256 => Game)        public games;
    mapping(address => uint256[])   public playerGames;
    mapping(address => uint256)     public playerWins;
    mapping(address => uint256)     public playerTotalGames;

    address public rewardVault;
    address public leaderboard;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event GameCreated(
        uint256 indexed gameId,
        GameType gameType,
        address indexed player1,
        uint256 stake
    );

    event GameJoined(
        uint256 indexed gameId,
        address indexed player2
    );

    event MoveCommitted(
        uint256 indexed gameId,
        address indexed player
    );

    event MoveRevealed(
        uint256 indexed gameId,
        address indexed player,
        uint8 move
    );

    event GameFinished(
        uint256 indexed gameId,
        address indexed winner,
        uint256 prize
    );

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error StakeTooLow();
    error GameNotWaiting();
    error CannotJoinOwnGame();
    error StakeMismatch();
    error GameNotActive();
    error NotAPlayer();
    error AlreadyCommitted();
    error NotYetCommitted();
    error AlreadyRevealed();
    error InvalidReveal();
    error InvalidMove();
    error BothMovesNotRevealed();
    error TransferFailed();
    error ZeroAddress();

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// @param _rewardVault Address that receives the platform fee cut.
    /// @param _leaderboard Address of the ILeaderboard contract (can be address(0) initially).
    constructor(
        address _rewardVault,
        address _leaderboard
    ) Ownable(msg.sender) {
        if (_rewardVault == address(0)) revert ZeroAddress();
        rewardVault  = _rewardVault;
        leaderboard  = _leaderboard;
    }

    // -----------------------------------------------------------------------
    // External / Public functions
    // -----------------------------------------------------------------------

    /// @notice Create a new game and deposit the initial stake.
    /// @param _type The type of game to create.
    /// @return gameId The ID of the newly created game.
    function createGame(GameType _type) external payable returns (uint256 gameId) {
        if (msg.value < MIN_STAKE) revert StakeTooLow();

        gameCounter++;
        gameId = gameCounter;

        Game storage g = games[gameId];
        g.id        = gameId;
        g.gameType  = _type;
        g.player1   = msg.sender;
        g.stake     = msg.value;
        g.state     = GameState.Waiting;
        g.createdAt = block.timestamp;

        playerGames[msg.sender].push(gameId);

        emit GameCreated(gameId, _type, msg.sender, msg.value);
    }

    /// @notice Join an existing game by matching the creator's stake.
    /// @param _gameId The ID of the game to join.
    function joinGame(uint256 _gameId) external payable {
        Game storage g = games[_gameId];

        if (g.state != GameState.Waiting)  revert GameNotWaiting();
        if (g.player1 == msg.sender)       revert CannotJoinOwnGame();
        if (msg.value != g.stake)          revert StakeMismatch();

        g.player2      = msg.sender;
        g.state        = GameState.Active;
        g.moveDeadline = block.timestamp + MOVE_TIMEOUT;

        playerGames[msg.sender].push(_gameId);

        emit GameJoined(_gameId, msg.sender);
    }

    /// @notice Commit a hashed move for the game (commit phase of commit-reveal).
    /// @dev The commit is `keccak256(abi.encodePacked(move, salt))`.
    /// @param _gameId The game to commit a move for.
    /// @param _commit The keccak256 hash of (move, salt).
    function commitMove(uint256 _gameId, bytes32 _commit) external {
        Game storage g = games[_gameId];

        if (g.state != GameState.Active) revert GameNotActive();

        if (msg.sender == g.player1) {
            if (g.p1Commit != bytes32(0)) revert AlreadyCommitted();
            g.p1Commit = _commit;
        } else if (msg.sender == g.player2) {
            if (g.p2Commit != bytes32(0)) revert AlreadyCommitted();
            g.p2Commit = _commit;
        } else {
            revert NotAPlayer();
        }

        emit MoveCommitted(_gameId, msg.sender);
    }

    /// @notice Reveal a previously committed move. If both moves are revealed the
    ///         game is automatically resolved.
    /// @param _gameId The game to reveal a move for.
    /// @param _move   The plaintext move value.
    /// @param _salt   The salt used during the commit.
    function revealMove(uint256 _gameId, uint8 _move, bytes32 _salt) external {
        Game storage g = games[_gameId];

        if (g.state != GameState.Active) revert GameNotActive();

        _validateMove(g.gameType, _move);

        bytes32 computedHash = keccak256(abi.encodePacked(_move, _salt));

        if (msg.sender == g.player1) {
            if (g.p1Commit == bytes32(0)) revert NotYetCommitted();
            if (g.p1Move != 0)            revert AlreadyRevealed();
            if (computedHash != g.p1Commit) revert InvalidReveal();
            g.p1Move = _move;
        } else if (msg.sender == g.player2) {
            if (g.p2Commit == bytes32(0)) revert NotYetCommitted();
            if (g.p2Move != 0)            revert AlreadyRevealed();
            if (computedHash != g.p2Commit) revert InvalidReveal();
            g.p2Move = _move;
        } else {
            revert NotAPlayer();
        }

        emit MoveRevealed(_gameId, msg.sender, _move);

        // Auto-resolve when both players have revealed
        if (g.p1Move != 0 && g.p2Move != 0) {
            _resolveGame(_gameId);
        }
    }

    /// @notice Allows a player to claim victory if the opponent fails to reveal
    ///         before the move deadline.
    /// @param _gameId The game ID to claim timeout on.
    function claimTimeout(uint256 _gameId) external {
        Game storage g = games[_gameId];

        if (g.state != GameState.Active) revert GameNotActive();
        require(block.timestamp > g.moveDeadline, "Deadline not reached");

        // Both committed but only one revealed
        if (g.p1Move != 0 && g.p2Move == 0) {
            _finishGame(g, g.player1);
        } else if (g.p2Move != 0 && g.p1Move == 0) {
            _finishGame(g, g.player2);
        } else if (g.p1Commit != bytes32(0) && g.p2Commit == bytes32(0)) {
            // Player 2 never committed
            _finishGame(g, g.player1);
        } else if (g.p2Commit != bytes32(0) && g.p1Commit == bytes32(0)) {
            // Player 1 never committed
            _finishGame(g, g.player2);
        } else {
            // Neither committed or both didn't reveal -- refund both
            _refundGame(g);
        }
    }

    // -----------------------------------------------------------------------
    // Owner functions
    // -----------------------------------------------------------------------

    /// @notice Update the reward vault address.
    function setRewardVault(address _rewardVault) external onlyOwner {
        if (_rewardVault == address(0)) revert ZeroAddress();
        rewardVault = _rewardVault;
    }

    /// @notice Update the leaderboard contract address.
    function setLeaderboard(address _leaderboard) external onlyOwner {
        leaderboard = _leaderboard;
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// @notice Return the list of game IDs a player has participated in.
    function getPlayerGames(address _player) external view returns (uint256[] memory) {
        return playerGames[_player];
    }

    /// @notice Return the full Game struct for a given ID.
    function getGame(uint256 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }

    // -----------------------------------------------------------------------
    // Internal functions
    // -----------------------------------------------------------------------

    /// @dev Resolves the game, determines the winner, and distributes funds.
    function _resolveGame(uint256 _gameId) internal nonReentrant {
        Game storage g = games[_gameId];

        if (g.p1Move == 0 || g.p2Move == 0) revert BothMovesNotRevealed();

        address gameWinner = _determineWinner(
            g.gameType,
            g.p1Move,
            g.p2Move,
            g.player1,
            g.player2
        );

        if (gameWinner == address(0)) {
            // Draw -- refund both players their stake
            _refundGame(g);
        } else {
            _finishGame(g, gameWinner);
        }
    }

    /// @dev Pays the winner (minus fee) and sends the fee to the vault.
    function _finishGame(Game storage g, address _winner) internal {
        g.state  = GameState.Finished;
        g.winner = _winner;

        uint256 totalPot = g.stake * 2;
        uint256 fee      = (totalPot * PLATFORM_FEE) / FEE_BASE;
        uint256 prize    = totalPot - fee;

        // Update stats
        playerTotalGames[g.player1]++;
        playerTotalGames[g.player2]++;
        playerWins[_winner]++;

        // Transfer fee to vault
        (bool feeSuccess,) = rewardVault.call{value: fee}("");
        if (!feeSuccess) revert TransferFailed();

        // Transfer prize to winner
        (bool prizeSuccess,) = _winner.call{value: prize}("");
        if (!prizeSuccess) revert TransferFailed();

        // Update leaderboard (if configured)
        if (leaderboard != address(0)) {
            try ILeaderboard(leaderboard).updateScore(_winner, playerWins[_winner]) {} catch {}
        }

        emit GameFinished(g.id, _winner, prize);
    }

    /// @dev Refunds both players in the case of a draw or mutual timeout.
    function _refundGame(Game storage g) internal {
        g.state  = GameState.Finished;
        g.winner = address(0);

        playerTotalGames[g.player1]++;
        playerTotalGames[g.player2]++;

        uint256 refundAmount = g.stake;

        (bool s1,) = g.player1.call{value: refundAmount}("");
        if (!s1) revert TransferFailed();

        (bool s2,) = g.player2.call{value: refundAmount}("");
        if (!s2) revert TransferFailed();

        emit GameFinished(g.id, address(0), 0);
    }

    /// @dev Validates that a move is within the legal range for the game type.
    function _validateMove(GameType _type, uint8 _move) internal pure {
        if (_type == GameType.CoinFlip) {
            // 1 = Heads, 2 = Tails
            if (_move < 1 || _move > 2) revert InvalidMove();
        } else if (_type == GameType.RPS) {
            // 1 = Rock, 2 = Paper, 3 = Scissors
            if (_move < 1 || _move > 3) revert InvalidMove();
        } else if (_type == GameType.DiceRoll) {
            // 1-6 representing dice faces
            if (_move < 1 || _move > 6) revert InvalidMove();
        } else if (_type == GameType.NumberGuess) {
            // 1-100 number range
            if (_move < 1 || _move > 100) revert InvalidMove();
        } else if (_type == GameType.DragonTiger) {
            // 1-13 representing card values (Ace through King)
            if (_move < 1 || _move > 13) revert InvalidMove();
        } else if (_type == GameType.ElementalClash) {
            // 1=Fire, 2=Water, 3=Wind, 4=Ice, 5=Earth
            if (_move < 1 || _move > 5) revert InvalidMove();
        } else if (_type == GameType.CrashDice) {
            // 1-20 representing D20 faces
            if (_move < 1 || _move > 20) revert InvalidMove();
        }
    }

    /// @dev Determines the winner of a game based on its type and each player's move.
    /// @return winner The address of the winner, or address(0) for a draw.
    function _determineWinner(
        GameType _type,
        uint8 _p1Move,
        uint8 _p2Move,
        address _player1,
        address _player2
    ) internal pure returns (address winner) {
        if (_type == GameType.RPS) {
            // Rock-Paper-Scissors: 1=Rock, 2=Paper, 3=Scissors
            if (_p1Move == _p2Move) {
                return address(0); // draw
            }
            // Rock beats Scissors, Scissors beats Paper, Paper beats Rock
            if (
                (_p1Move == 1 && _p2Move == 3) ||
                (_p1Move == 2 && _p2Move == 1) ||
                (_p1Move == 3 && _p2Move == 2)
            ) {
                return _player1;
            }
            return _player2;
        }

        if (_type == GameType.CoinFlip) {
            // Even/odd sum determines the winner.
            // If the sum is even, player 1 wins; if odd, player 2 wins.
            uint8 total = _p1Move + _p2Move;
            if (total % 2 == 0) {
                return _player1;
            }
            return _player2;
        }

        // DiceRoll, NumberGuess, DragonTiger, and CrashDice: higher number wins, tie = draw
        if (
            _type == GameType.DiceRoll ||
            _type == GameType.NumberGuess ||
            _type == GameType.DragonTiger ||
            _type == GameType.CrashDice
        ) {
            if (_p1Move > _p2Move) {
                return _player1;
            } else if (_p2Move > _p1Move) {
                return _player2;
            }
            return address(0); // draw
        }

        // ElementalClash: 5-element circular beating pattern
        // Fire(1) beats Wind(3),Ice(4) | Water(2) beats Fire(1),Earth(5)
        // Wind(3) beats Water(2),Earth(5) | Ice(4) beats Water(2),Wind(3)
        // Earth(5) beats Fire(1),Ice(4)
        if (_type == GameType.ElementalClash) {
            if (_p1Move == _p2Move) {
                return address(0); // draw
            }
            bool p1Wins = (
                (_p1Move == 1 && (_p2Move == 3 || _p2Move == 4)) ||  // Fire beats Wind, Ice
                (_p1Move == 2 && (_p2Move == 1 || _p2Move == 5)) ||  // Water beats Fire, Earth
                (_p1Move == 3 && (_p2Move == 2 || _p2Move == 5)) ||  // Wind beats Water, Earth
                (_p1Move == 4 && (_p2Move == 2 || _p2Move == 3)) ||  // Ice beats Water, Wind
                (_p1Move == 5 && (_p2Move == 1 || _p2Move == 4))     // Earth beats Fire, Ice
            );
            return p1Wins ? _player1 : _player2;
        }
    }
}
