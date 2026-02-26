// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GameRegistry
 * @notice Central registry of game types supported by AVAX Arena.
 *         Each game type has configurable stake limits, move timeout,
 *         and max-move parameters.  The constructor seeds four default
 *         game types: CoinFlip, DiceRoll, RPS, and NumberGuess.
 */
contract GameRegistry is Ownable {
    // -----------------------------------------------------------------------
    //  Types
    // -----------------------------------------------------------------------

    struct GameConfig {
        string name;
        bool active;
        uint256 minStake;
        uint256 maxStake;
        uint256 moveTimeout;
        uint256 maxMoves;
    }

    // -----------------------------------------------------------------------
    //  State
    // -----------------------------------------------------------------------

    /// @notice game type id => configuration.
    mapping(uint8 => GameConfig) public gameConfigs;

    /// @notice Number of registered game types.
    uint8 public gameTypeCount;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event GameTypeRegistered(
        uint8 indexed id,
        string name,
        uint256 minStake,
        uint256 maxStake,
        uint256 moveTimeout,
        uint256 maxMoves
    );

    event GameTypeUpdated(
        uint8 indexed id,
        bool active,
        uint256 minStake,
        uint256 maxStake
    );

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    constructor() Ownable(msg.sender) {
        // Seed the four default game types.
        // 1 - CoinFlip:    0.01 - 10 AVAX, 30 s timeout, 1 move
        _registerGameType("CoinFlip",    0.01 ether, 10 ether, 30, 1);

        // 2 - DiceRoll:    0.01 - 10 AVAX, 30 s timeout, 1 move
        _registerGameType("DiceRoll",    0.01 ether, 10 ether, 30, 1);

        // 3 - RPS:         0.01 - 5 AVAX,  60 s timeout, 3 moves
        _registerGameType("RPS",         0.01 ether,  5 ether, 60, 3);

        // 4 - NumberGuess: 0.01 - 5 AVAX,  45 s timeout, 5 moves
        _registerGameType("NumberGuess", 0.01 ether,  5 ether, 45, 5);

        // 5 - DragonTiger: 0.01 - 10 AVAX, 45 s timeout, 1 move
        _registerGameType("DragonTiger", 0.01 ether, 10 ether, 45, 1);

        // 6 - ElementalClash: 0.01 - 5 AVAX, 60 s timeout, 3 moves
        _registerGameType("ElementalClash", 0.01 ether, 5 ether, 60, 3);

        // 7 - CrashDice: 0.01 - 10 AVAX, 30 s timeout, 1 move
        _registerGameType("CrashDice", 0.01 ether, 10 ether, 30, 1);
    }

    // -----------------------------------------------------------------------
    //  External Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Register a new game type.
     * @param _name        Human-readable game name.
     * @param _minStake    Minimum stake in wei.
     * @param _maxStake    Maximum stake in wei.
     * @param _moveTimeout Seconds before a move times out.
     * @param _maxMoves    Maximum number of moves per game.
     */
    function registerGameType(
        string calldata _name,
        uint256 _minStake,
        uint256 _maxStake,
        uint256 _moveTimeout,
        uint256 _maxMoves
    ) external onlyOwner {
        _registerGameType(_name, _minStake, _maxStake, _moveTimeout, _maxMoves);
    }

    /**
     * @notice Update an existing game type's parameters.
     * @param _id       Game type identifier.
     * @param _active   Whether the game type is active.
     * @param _minStake New minimum stake.
     * @param _maxStake New maximum stake.
     */
    function updateGameType(
        uint8 _id,
        bool _active,
        uint256 _minStake,
        uint256 _maxStake
    ) external onlyOwner {
        require(_id > 0 && _id <= gameTypeCount, "GameRegistry: invalid id");
        require(_minStake <= _maxStake, "GameRegistry: min > max");

        GameConfig storage config = gameConfigs[_id];
        config.active = _active;
        config.minStake = _minStake;
        config.maxStake = _maxStake;

        emit GameTypeUpdated(_id, _active, _minStake, _maxStake);
    }

    // -----------------------------------------------------------------------
    //  View Helpers
    // -----------------------------------------------------------------------

    /**
     * @notice Check whether a game type is currently active.
     * @param _id Game type identifier.
     * @return True if the game type exists and is active.
     */
    function isGameTypeActive(uint8 _id) external view returns (bool) {
        return gameConfigs[_id].active;
    }

    /**
     * @notice Return the full configuration for a game type.
     * @param _id Game type identifier.
     * @return The GameConfig struct.
     */
    function getGameConfig(
        uint8 _id
    ) external view returns (GameConfig memory) {
        require(_id > 0 && _id <= gameTypeCount, "GameRegistry: invalid id");
        return gameConfigs[_id];
    }

    // -----------------------------------------------------------------------
    //  Internal Helpers
    // -----------------------------------------------------------------------

    /**
     * @dev Shared logic for registering a new game type.
     */
    function _registerGameType(
        string memory _name,
        uint256 _minStake,
        uint256 _maxStake,
        uint256 _moveTimeout,
        uint256 _maxMoves
    ) internal {
        require(bytes(_name).length > 0, "GameRegistry: empty name");
        require(_minStake <= _maxStake, "GameRegistry: min > max");
        require(_moveTimeout > 0, "GameRegistry: zero timeout");
        require(_maxMoves > 0, "GameRegistry: zero maxMoves");

        gameTypeCount++;
        uint8 id = gameTypeCount;

        gameConfigs[id] = GameConfig({
            name: _name,
            active: true,
            minStake: _minStake,
            maxStake: _maxStake,
            moveTimeout: _moveTimeout,
            maxMoves: _maxMoves
        });

        emit GameTypeRegistered(
            id,
            _name,
            _minStake,
            _maxStake,
            _moveTimeout,
            _maxMoves
        );
    }
}
