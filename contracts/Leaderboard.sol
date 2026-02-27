// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Leaderboard
 * @notice Tracks per-season player scores for AVAX Arena.
 *         Only the authorised GameEngine contract may update scores.
 */
contract Leaderboard is Ownable {
    // -----------------------------------------------------------------------
    //  Types
    // -----------------------------------------------------------------------

    struct PlayerScore {
        address player;
        uint256 score;
        uint256 gamesPlayed;
        uint256 lastUpdated;
    }

    // -----------------------------------------------------------------------
    //  State
    // -----------------------------------------------------------------------

    /// @notice Current active season number (starts at 1).
    uint256 public currentSeason;

    /// @notice Address of the authorised GameEngine that may submit scores.
    address public gameEngine;

    /// @notice season => player => PlayerScore
    mapping(uint256 => mapping(address => PlayerScore)) public seasonScores;

    /// @notice season => ordered list of unique players who scored that season.
    mapping(uint256 => address[]) public seasonPlayers;

    /// @notice season => player => whether the player is already tracked.
    mapping(uint256 => mapping(address => bool)) public isInSeason;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event ScoreUpdated(
        uint256 indexed season,
        address indexed player,
        uint256 newScore,
        uint256 gamesPlayed
    );

    event SeasonStarted(uint256 indexed season);

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    constructor() Ownable(msg.sender) {
        currentSeason = 1;
        emit SeasonStarted(1);
    }

    // -----------------------------------------------------------------------
    //  Admin Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Set the authorised GameEngine address.
     * @param _gameEngine New GameEngine contract address.
     */
    function setGameEngine(address _gameEngine) external onlyOwner {
        require(
            _gameEngine != address(0),
            "Leaderboard: zero address"
        );
        gameEngine = _gameEngine;
    }

    /**
     * @notice Advance to the next season. Only the owner may call.
     */
    function startNewSeason() external onlyOwner {
        currentSeason++;
        emit SeasonStarted(currentSeason);
    }

    // -----------------------------------------------------------------------
    //  Score Management
    // -----------------------------------------------------------------------

    /**
     * @notice Add points to a player's score for the current season.
     *         Only the authorised GameEngine may call this.
     * @param _player Address of the player.
     * @param _points Points to add to the player's cumulative score.
     */
    function updateScore(address _player, uint256 _points) external {
        require(
            msg.sender == gameEngine,
            "Leaderboard: caller is not the game engine"
        );
        require(_player != address(0), "Leaderboard: zero address");
        require(_points > 0, "Leaderboard: points must be > 0");

        PlayerScore storage ps = seasonScores[currentSeason][_player];

        // First time this player scores in the current season
        if (!isInSeason[currentSeason][_player]) {
            isInSeason[currentSeason][_player] = true;
            seasonPlayers[currentSeason].push(_player);
            ps.player = _player;
        }

        ps.score += _points;
        ps.gamesPlayed++;
        ps.lastUpdated = block.timestamp;

        emit ScoreUpdated(currentSeason, _player, ps.score, ps.gamesPlayed);
    }

    // -----------------------------------------------------------------------
    //  View Helpers
    // -----------------------------------------------------------------------

    /**
     * @notice Retrieve a player's score data for a given season.
     * @param _season Season number.
     * @param _player Player address.
     * @return The PlayerScore struct.
     */
    function getPlayerScore(
        uint256 _season,
        address _player
    ) external view returns (PlayerScore memory) {
        return seasonScores[_season][_player];
    }

    /**
     * @notice Return a paginated slice of player addresses that participated in a season.
     * @param _season Season number.
     * @param _offset Starting index in the player list.
     * @param _limit  Maximum number of addresses to return.
     * @return players Array of player addresses.
     */
    function getSeasonPlayers(
        uint256 _season,
        uint256 _offset,
        uint256 _limit
    ) external view returns (address[] memory players) {
        uint256 total = seasonPlayers[_season].length;
        if (_offset >= total) {
            return new address[](0);
        }

        uint256 end = _offset + _limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - _offset;
        players = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            players[i] = seasonPlayers[_season][_offset + i];
        }
    }

    /**
     * @notice Return the total number of players in a season (useful for pagination).
     * @param _season Season number.
     * @return The number of players.
     */
    function getSeasonPlayerCount(
        uint256 _season
    ) external view returns (uint256) {
        return seasonPlayers[_season].length;
    }
}
