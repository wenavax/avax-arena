// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FrostbiteReputationRegistry
 * @author Frostbite Team
 * @notice On-chain reputation tracking for Frostbite warrior agents.
 *         Authorized game contracts (BattleEngine, TeamBattleEngine, QuestEngine)
 *         post results that build each warrior's reputation score.
 *
 * @dev Overall score formula (0-1000):
 *   score = (winRate * 400) + (questCompletionRate * 200)
 *         + (activityBonus * 200) + (elementDiversity * 200)
 */
contract FrostbiteReputationRegistry is Ownable {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct Reputation {
        uint256 totalBattles;
        uint256 wins;
        uint256 losses;
        uint256 totalQuests;
        uint256 questsCompleted;
        uint256 questsFailed;
        uint256 totalXpEarned;
        uint256 totalAvaxEarned;
        uint256 totalAvaxLost;
        uint256[8] elementWins; // wins per element matchup (indexed by opponent element)
        uint256 lastActive;
        uint256 overallScore;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice tokenId => Reputation data
    mapping(uint256 => Reputation) private _reputations;

    /// @notice Contracts authorized to post results
    mapping(address => bool) public authorizedCallers;

    /// @notice Sorted leaderboard — tokenIds ordered by overallScore (descending)
    uint256[] private _leaderboard;

    /// @notice tokenId => index in _leaderboard (+ 1, so 0 = not present)
    mapping(uint256 => uint256) private _leaderboardIndex;

    /// @notice Maximum leaderboard size to maintain on-chain
    uint256 public constant MAX_LEADERBOARD_SIZE = 200;

    /// @notice Activity cap for bonus calculation
    uint256 public constant ACTIVITY_CAP = 500;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event BattleResultPosted(
        uint256 indexed tokenId,
        bool won,
        uint256 avaxStake,
        uint256 newScore
    );

    event QuestResultPosted(
        uint256 indexed tokenId,
        bool completed,
        uint256 xpGained,
        uint256 newScore
    );

    event AuthorizedCallerAdded(address indexed caller);
    event AuthorizedCallerRemoved(address indexed caller);
    event ReputationCleared(uint256 indexed tokenId);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotAuthorizedCaller();
    error InvalidAddress();
    error NotAuthorized();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert NotAuthorizedCaller();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    // -------------------------------------------------------------------------
    // Owner Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Add an authorized caller (e.g. BattleEngine, QuestEngine).
     * @param caller The contract address to authorize
     */
    function addAuthorizedCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert InvalidAddress();
        authorizedCallers[caller] = true;
        emit AuthorizedCallerAdded(caller);
    }

    /**
     * @notice Remove an authorized caller.
     * @param caller The contract address to de-authorize
     */
    function removeAuthorizedCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit AuthorizedCallerRemoved(caller);
    }

    // -------------------------------------------------------------------------
    // Authorized Functions — Battle Results
    // -------------------------------------------------------------------------

    /**
     * @notice Record a battle result for a warrior.
     * @param tokenId The warrior NFT token ID
     * @param won Whether the warrior won
     * @param avaxStake The AVAX amount at stake
     * @param opponentElement The opponent's element (0-7)
     */
    function postBattleResult(
        uint256 tokenId,
        bool won,
        uint256 avaxStake,
        uint8, /* warriorElement — reserved for future use */
        uint8 opponentElement
    ) external onlyAuthorized {
        Reputation storage rep = _reputations[tokenId];

        rep.totalBattles++;

        if (won) {
            rep.wins++;
            rep.totalAvaxEarned += avaxStake;
            // Track element matchup win (indexed by opponent element)
            if (opponentElement < 8) {
                rep.elementWins[opponentElement]++;
            }
        } else {
            rep.losses++;
            rep.totalAvaxLost += avaxStake;
        }

        rep.lastActive = block.timestamp;
        rep.overallScore = _calculateOverallScore(rep);

        _updateLeaderboard(tokenId, rep.overallScore);

        emit BattleResultPosted(tokenId, won, avaxStake, rep.overallScore);
    }

    // -------------------------------------------------------------------------
    // Authorized Functions — Quest Results
    // -------------------------------------------------------------------------

    /**
     * @notice Record a quest result for a warrior.
     * @param tokenId The warrior NFT token ID
     * @param completed Whether the quest was completed successfully
     * @param xpGained The XP gained from the quest
     */
    function postQuestResult(
        uint256 tokenId,
        bool completed,
        uint256 xpGained
    ) external onlyAuthorized {
        Reputation storage rep = _reputations[tokenId];

        rep.totalQuests++;

        if (completed) {
            rep.questsCompleted++;
        } else {
            rep.questsFailed++;
        }

        rep.totalXpEarned += xpGained;
        rep.lastActive = block.timestamp;
        rep.overallScore = _calculateOverallScore(rep);

        _updateLeaderboard(tokenId, rep.overallScore);

        emit QuestResultPosted(tokenId, completed, xpGained, rep.overallScore);
    }

    // -------------------------------------------------------------------------
    // Fusion Safety — Reputation Cleanup
    // -------------------------------------------------------------------------

    /**
     * @notice Clear all reputation data for a warrior (e.g., before fusion burn).
     *         Only callable by the contract owner.
     * @param tokenId The warrior NFT token ID
     */
    function clearReputation(uint256 tokenId) external {
        if (msg.sender != owner()) revert NotAuthorized();

        // Remove from leaderboard
        uint256 idx = _leaderboardIndex[tokenId];
        if (idx > 0) {
            _removeFromLeaderboard(idx - 1);
        }

        // Clear reputation data
        delete _reputations[tokenId];

        emit ReputationCleared(tokenId);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Get full reputation data for a warrior.
     * @param tokenId The warrior NFT token ID
     * @return rep The Reputation struct
     */
    function getReputation(uint256 tokenId) external view returns (Reputation memory) {
        return _reputations[tokenId];
    }

    /**
     * @notice Get just the overall score for a warrior.
     * @param tokenId The warrior NFT token ID
     * @return score The overall score (0-1000)
     */
    function getOverallScore(uint256 tokenId) external view returns (uint256) {
        return _reputations[tokenId].overallScore;
    }

    /**
     * @notice Get element mastery — win count against a specific element.
     * @param tokenId The warrior NFT token ID
     * @param element The opponent element to check (0-7)
     * @return wins Number of wins against that element
     */
    function getElementMastery(
        uint256 tokenId,
        uint8 element
    ) external view returns (uint256) {
        if (element >= 8) return 0;
        return _reputations[tokenId].elementWins[element];
    }

    /**
     * @notice Get the top N agents by overall score.
     * @param limit Maximum number of agents to return
     * @return tokenIds Array of token IDs sorted by score (descending)
     * @return scores Array of corresponding scores
     */
    function getTopAgents(uint256 limit) external view returns (
        uint256[] memory tokenIds,
        uint256[] memory scores
    ) {
        uint256 count = _leaderboard.length;
        if (limit > count) limit = count;

        tokenIds = new uint256[](limit);
        scores = new uint256[](limit);

        for (uint256 i = 0; i < limit; i++) {
            tokenIds[i] = _leaderboard[i];
            scores[i] = _reputations[_leaderboard[i]].overallScore;
        }
    }

    /**
     * @notice Get the total number of warriors on the leaderboard.
     * @return count Leaderboard size
     */
    function getLeaderboardSize() external view returns (uint256) {
        return _leaderboard.length;
    }

    // -------------------------------------------------------------------------
    // Internal — Score Calculation
    // -------------------------------------------------------------------------

    /**
     * @dev Calculate overall score (0-1000) from reputation data.
     *
     * Formula:
     *   winRate component     = (wins / totalBattles) * 400
     *   questCompletion comp  = (questsCompleted / totalQuests) * 200
     *   activity bonus        = min(totalBattles + totalQuests, 500) / 500 * 200
     *   element diversity     = (elements with >50% win rate) / 8 * 200
     */
    function _calculateOverallScore(
        Reputation storage rep
    ) internal view returns (uint256) {
        uint256 score = 0;

        // Win rate component (max 400)
        if (rep.totalBattles > 0) {
            score += (rep.wins * 400) / rep.totalBattles;
        }

        // Quest completion rate component (max 200)
        if (rep.totalQuests > 0) {
            score += (rep.questsCompleted * 200) / rep.totalQuests;
        }

        // Activity bonus (max 200)
        uint256 totalActivities = rep.totalBattles + rep.totalQuests;
        if (totalActivities > ACTIVITY_CAP) {
            totalActivities = ACTIVITY_CAP;
        }
        score += (totalActivities * 200) / ACTIVITY_CAP;

        // Element diversity (max 200)
        // Count elements where warrior has >50% win rate (need at least 1 battle vs that element)
        uint256 diverseElements = 0;
        for (uint8 i = 0; i < 8; i++) {
            uint256 winsVsElement = rep.elementWins[i];
            if (winsVsElement > 0) {
                // We only track wins, so we count elements where the warrior has won at least once.
                // For a more accurate >50% check we'd need losses per element.
                // Simplified: count elements with at least 2 wins as "mastered"
                if (winsVsElement >= 2) {
                    diverseElements++;
                }
            }
        }
        score += (diverseElements * 200) / 8;

        return score;
    }

    // -------------------------------------------------------------------------
    // Internal — Leaderboard Maintenance
    // -------------------------------------------------------------------------

    /**
     * @dev Insert or update a warrior's position in the sorted leaderboard.
     *      Uses insertion sort for O(n) worst case, which is acceptable for
     *      a capped leaderboard of MAX_LEADERBOARD_SIZE entries.
     */
    function _updateLeaderboard(uint256 tokenId, uint256 newScore) internal {
        uint256 idx = _leaderboardIndex[tokenId];

        if (idx > 0) {
            // Already in leaderboard — remove first, then re-insert
            _removeFromLeaderboard(idx - 1);
        }

        // Find insertion point (descending order)
        uint256 len = _leaderboard.length;
        uint256 insertAt = len; // default: append at end

        for (uint256 i = 0; i < len; i++) {
            if (newScore > _reputations[_leaderboard[i]].overallScore) {
                insertAt = i;
                break;
            }
        }

        // Check if score qualifies for leaderboard
        if (insertAt >= MAX_LEADERBOARD_SIZE) {
            // Score too low and leaderboard is full
            if (len >= MAX_LEADERBOARD_SIZE) return;
        }

        // Insert at position
        _leaderboard.push(0); // extend array
        len = _leaderboard.length;

        // Shift elements right from insertAt
        for (uint256 i = len - 1; i > insertAt; i--) {
            _leaderboard[i] = _leaderboard[i - 1];
            _leaderboardIndex[_leaderboard[i]] = i + 1; // 1-indexed
        }

        _leaderboard[insertAt] = tokenId;
        _leaderboardIndex[tokenId] = insertAt + 1; // 1-indexed

        // Trim if over max size
        if (_leaderboard.length > MAX_LEADERBOARD_SIZE) {
            uint256 removedTokenId = _leaderboard[_leaderboard.length - 1];
            delete _leaderboardIndex[removedTokenId];
            _leaderboard.pop();
        }
    }

    /**
     * @dev Remove an entry from the leaderboard at a given index.
     */
    function _removeFromLeaderboard(uint256 index) internal {
        uint256 len = _leaderboard.length;
        if (index >= len) return;

        uint256 removedTokenId = _leaderboard[index];
        delete _leaderboardIndex[removedTokenId];

        // Shift left
        for (uint256 i = index; i < len - 1; i++) {
            _leaderboard[i] = _leaderboard[i + 1];
            _leaderboardIndex[_leaderboard[i]] = i + 1; // 1-indexed
        }

        _leaderboard.pop();
    }
}
