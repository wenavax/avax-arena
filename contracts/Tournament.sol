// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Tournament
 * @notice Manages on-chain tournaments for AVAX Arena GameFi.
 *         Players pay an entry fee in AVAX; the accumulated prize pool is
 *         distributed 60 / 25 / 15 % to the top-3 scorers.
 */
contract Tournament is Ownable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    //  Types
    // -----------------------------------------------------------------------

    struct TournamentInfo {
        uint256 id;
        string name;
        uint256 entryFee;
        uint256 maxPlayers;
        uint256 currentPlayers;
        uint256 prizePool;
        uint256 startTime;
        uint256 endTime;
        bool active;
        address[] players;
        mapping(address => uint256) scores;
        mapping(address => bool) claimed;
    }

    // -----------------------------------------------------------------------
    //  State
    // -----------------------------------------------------------------------

    uint256 public tournamentCount;
    mapping(uint256 => TournamentInfo) public tournaments;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event TournamentCreated(
        uint256 indexed id,
        string name,
        uint256 entryFee,
        uint256 maxPlayers,
        uint256 startTime,
        uint256 endTime
    );

    event PlayerJoined(uint256 indexed tournamentId, address indexed player);

    event ScoreSubmitted(
        uint256 indexed tournamentId,
        address indexed player,
        uint256 score
    );

    event PrizeClaimed(
        uint256 indexed tournamentId,
        address indexed player,
        uint256 amount
    );

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    // -----------------------------------------------------------------------
    //  External / Public Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Create a new tournament.
     * @param _name         Human-readable tournament name.
     * @param _entryFee     Entry fee in wei (AVAX).
     * @param _maxPlayers   Maximum number of participants.
     * @param _startTime    Unix timestamp when the tournament begins.
     * @param _endTime      Unix timestamp when the tournament ends.
     */
    function createTournament(
        string calldata _name,
        uint256 _entryFee,
        uint256 _maxPlayers,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner {
        require(_maxPlayers > 0, "Tournament: maxPlayers must be > 0");
        require(_startTime < _endTime, "Tournament: invalid time range");
        require(
            _startTime > block.timestamp,
            "Tournament: startTime must be in the future"
        );

        tournamentCount++;
        uint256 id = tournamentCount;

        TournamentInfo storage t = tournaments[id];
        t.id = id;
        t.name = _name;
        t.entryFee = _entryFee;
        t.maxPlayers = _maxPlayers;
        t.startTime = _startTime;
        t.endTime = _endTime;
        t.active = true;

        emit TournamentCreated(id, _name, _entryFee, _maxPlayers, _startTime, _endTime);
    }

    /**
     * @notice Join an active tournament by paying the entry fee.
     * @param _id Tournament identifier.
     */
    function joinTournament(uint256 _id) external payable {
        TournamentInfo storage t = tournaments[_id];

        require(t.active, "Tournament: not active");
        require(
            block.timestamp < t.startTime,
            "Tournament: already started"
        );
        require(msg.value == t.entryFee, "Tournament: incorrect entry fee");
        require(
            t.currentPlayers < t.maxPlayers,
            "Tournament: max capacity reached"
        );

        // Prevent double-join by checking score mapping default + player list
        for (uint256 i = 0; i < t.players.length; i++) {
            require(t.players[i] != msg.sender, "Tournament: already joined");
        }

        t.players.push(msg.sender);
        t.currentPlayers++;
        t.prizePool += msg.value;

        emit PlayerJoined(_id, msg.sender);
    }

    /**
     * @notice Submit (or update) a player's score.  Only the contract owner
     *         (game server / oracle) may call this.
     * @param _id     Tournament identifier.
     * @param _player Address of the player.
     * @param _score  Score value.
     */
    function submitScore(
        uint256 _id,
        address _player,
        uint256 _score
    ) external onlyOwner {
        TournamentInfo storage t = tournaments[_id];
        require(t.active, "Tournament: not active");
        require(
            block.timestamp >= t.startTime && block.timestamp <= t.endTime,
            "Tournament: outside play window"
        );

        t.scores[_player] = _score;

        emit ScoreSubmitted(_id, _player, _score);
    }

    /**
     * @notice End a tournament (no more score submissions).
     * @param _id Tournament identifier.
     */
    function endTournament(uint256 _id) external onlyOwner {
        TournamentInfo storage t = tournaments[_id];
        require(t.active, "Tournament: already ended");

        t.active = false;
    }

    /**
     * @notice Claim prize winnings for a finished tournament.
     *         Prizes: 1st = 60 %, 2nd = 25 %, 3rd = 15 % of prize pool.
     * @param _id Tournament identifier.
     */
    function claimPrize(uint256 _id) external nonReentrant {
        TournamentInfo storage t = tournaments[_id];
        require(!t.active, "Tournament: still active");
        require(!t.claimed[msg.sender], "Tournament: already claimed");

        (
            address first,
            address second,
            address third
        ) = _getTopPlayers(_id);

        uint256 prize = 0;
        if (msg.sender == first) {
            prize = (t.prizePool * 60) / 100;
        } else if (msg.sender == second) {
            prize = (t.prizePool * 25) / 100;
        } else if (msg.sender == third) {
            prize = (t.prizePool * 15) / 100;
        }

        require(prize > 0, "Tournament: not a winner");

        t.claimed[msg.sender] = true;

        (bool success, ) = payable(msg.sender).call{value: prize}("");
        require(success, "Tournament: transfer failed");

        emit PrizeClaimed(_id, msg.sender, prize);
    }

    // -----------------------------------------------------------------------
    //  View Helpers
    // -----------------------------------------------------------------------

    /**
     * @notice Get a player's score in a tournament.
     * @param _id     Tournament identifier.
     * @param _player Player address.
     * @return The player's score.
     */
    function getPlayerScore(
        uint256 _id,
        address _player
    ) external view returns (uint256) {
        return tournaments[_id].scores[_player];
    }

    /**
     * @notice Return the full list of players in a tournament.
     * @param _id Tournament identifier.
     * @return Array of player addresses.
     */
    function getTournamentPlayers(
        uint256 _id
    ) external view returns (address[] memory) {
        return tournaments[_id].players;
    }

    // -----------------------------------------------------------------------
    //  Internal Helpers
    // -----------------------------------------------------------------------

    /**
     * @dev Determine the top-3 players by score.
     *      If fewer than 3 players exist, remaining positions are address(0).
     */
    function _getTopPlayers(
        uint256 _id
    ) internal view returns (address first, address second, address third) {
        TournamentInfo storage t = tournaments[_id];
        uint256 len = t.players.length;

        uint256 firstScore;
        uint256 secondScore;
        uint256 thirdScore;

        for (uint256 i = 0; i < len; i++) {
            address player = t.players[i];
            uint256 score = t.scores[player];

            if (score > firstScore) {
                // Shift 1st -> 2nd -> 3rd
                third = second;
                thirdScore = secondScore;
                second = first;
                secondScore = firstScore;
                first = player;
                firstScore = score;
            } else if (score > secondScore) {
                // Shift 2nd -> 3rd
                third = second;
                thirdScore = secondScore;
                second = player;
                secondScore = score;
            } else if (score > thirdScore) {
                third = player;
                thirdScore = score;
            }
        }
    }
}
