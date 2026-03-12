// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IArenaWarrior
 * @notice Minimal interface for the ArenaWarrior NFT contract.
 */
interface IArenaWarrior {
    enum Element { Fire, Water, Wind, Ice, Earth, Thunder, Shadow, Light }

    struct Warrior {
        uint8 attack;
        uint8 defense;
        uint8 speed;
        Element element;
        uint8 specialPower;
        uint16 level;
        uint256 experience;
        uint256 battleWins;
        uint256 battleLosses;
        uint256 powerScore;
    }

    function getWarrior(uint256 tokenId) external view returns (Warrior memory);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getWarriorPowerScore(uint256 tokenId) external view returns (uint256);
    function recordBattle(uint256 tokenId, bool won, uint256 expGained) external;
}

/**
 * @title QuestEngine
 * @notice PvE quest system for Frostbite Arena. Players send warriors on
 *         time-based quests across 8 elemental zones. Success is determined
 *         by warrior power, element advantage, and level bonus.
 *         Includes on-chain tier progression per wallet.
 */
contract QuestEngine is Ownable, ReentrancyGuard, Pausable {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum Difficulty { Easy, Medium, Hard, Boss }

    struct QuestDef {
        uint256 id;
        string name;
        uint8 zone;              // 0-7 (element id)
        Difficulty difficulty;
        uint256 duration;        // seconds
        uint256 winXP;           // XP on success
        uint256 lossXP;          // XP on failure
        uint16 minLevel;
        uint256 minPowerScore;
        uint16 baseDifficulty;   // 1-1000
        bool active;
    }

    struct ActiveQuest {
        uint256 questId;
        uint256 tokenId;
        address player;
        uint256 startedAt;
        uint256 endsAt;
        bool completed;
        bool won;
    }

    struct WalletProgression {
        uint256 tier;
        uint256 questsCompleted;
        uint256 questsWon;
        uint256 totalXP;
        uint256 tierProgress;     // 0 or 1 — quests completed in current tier
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    IArenaWarrior public immutable arenaWarrior;

    uint256 public questCount;
    mapping(uint256 => QuestDef) public quests;

    /// @notice tokenId => active quest data
    mapping(uint256 => ActiveQuest) public activeQuests;

    /// @notice tokenId => whether warrior is currently on a quest
    mapping(uint256 => bool) public isWarriorOnQuest;

    /// @notice Global stats
    uint256 public totalQuestsStarted;
    uint256 public totalQuestsCompleted;
    uint256 public totalQuestsWon;

    /// @notice Element advantages: element => element it beats
    mapping(uint8 => uint8) private _elementAdvantages;

    /// @notice Per-wallet tier progression
    mapping(address => WalletProgression) public walletProgression;

    /// @notice Quests required per tier to advance (default 2)
    uint256 public questsPerTier = 2;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event QuestAdded(uint256 indexed questId, string name, uint8 zone, uint8 difficulty);
    event QuestStarted(uint256 indexed questId, uint256 indexed tokenId, address indexed player, uint256 endsAt);
    event QuestCompleted(uint256 indexed questId, uint256 indexed tokenId, address indexed player, bool won, uint256 xpGained);
    event QuestAbandoned(uint256 indexed questId, uint256 indexed tokenId, address indexed player);
    event QuestToggled(uint256 indexed questId, bool active);
    event QuestUpdated(uint256 indexed questId);
    event TierAdvanced(address indexed player, uint256 newTier, uint256 totalCompleted, uint256 totalXP);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error QuestNotFound();
    error QuestNotActive();
    error WarriorAlreadyOnQuest();
    error NotWarriorOwner();
    error LevelTooLow();
    error PowerScoreTooLow();
    error QuestNotStarted();
    error QuestNotFinished();
    error QuestAlreadyCompleted();
    error NotQuestPlayer();
    error InvalidZone();
    error InvalidDuration();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _arenaWarrior) Ownable(msg.sender) {
        arenaWarrior = IArenaWarrior(_arenaWarrior);

        // Element advantage wheel:
        // Fire(0) > Wind(2), Wind(2) > Ice(3), Ice(3) > Water(1), Water(1) > Fire(0)
        // Earth(4) > Thunder(5), Thunder(5) > Shadow(6), Shadow(6) > Light(7), Light(7) > Earth(4)
        _elementAdvantages[0] = 2; // Fire beats Wind
        _elementAdvantages[2] = 3; // Wind beats Ice
        _elementAdvantages[3] = 1; // Ice beats Water
        _elementAdvantages[1] = 0; // Water beats Fire
        _elementAdvantages[4] = 5; // Earth beats Thunder
        _elementAdvantages[5] = 6; // Thunder beats Shadow
        _elementAdvantages[6] = 7; // Shadow beats Light
        _elementAdvantages[7] = 4; // Light beats Earth
    }

    // -------------------------------------------------------------------------
    // Quest Management (Owner)
    // -------------------------------------------------------------------------

    function addQuest(
        string calldata name,
        uint8 zone,
        Difficulty difficulty,
        uint256 duration,
        uint256 winXP,
        uint256 lossXP,
        uint16 minLevel,
        uint256 minPowerScore,
        uint16 baseDifficulty
    ) external onlyOwner {
        if (zone >= 8) revert InvalidZone();
        if (duration == 0) revert InvalidDuration();

        uint256 questId = questCount;
        questCount++;

        quests[questId] = QuestDef({
            id: questId,
            name: name,
            zone: zone,
            difficulty: difficulty,
            duration: duration,
            winXP: winXP,
            lossXP: lossXP,
            minLevel: minLevel,
            minPowerScore: minPowerScore,
            baseDifficulty: baseDifficulty,
            active: true
        });

        emit QuestAdded(questId, name, zone, uint8(difficulty));
    }

    function toggleQuest(uint256 questId, bool active) external onlyOwner {
        if (questId >= questCount) revert QuestNotFound();
        quests[questId].active = active;
        emit QuestToggled(questId, active);
    }

    function updateQuest(
        uint256 questId,
        uint256 duration,
        uint256 winXP,
        uint256 lossXP,
        uint16 minLevel,
        uint256 minPowerScore,
        uint16 baseDifficulty
    ) external onlyOwner {
        if (questId >= questCount) revert QuestNotFound();
        QuestDef storage quest = quests[questId];
        quest.duration = duration;
        quest.winXP = winXP;
        quest.lossXP = lossXP;
        quest.minLevel = minLevel;
        quest.minPowerScore = minPowerScore;
        quest.baseDifficulty = baseDifficulty;
        emit QuestUpdated(questId);
    }

    function setQuestsPerTier(uint256 _questsPerTier) external onlyOwner {
        questsPerTier = _questsPerTier;
    }

    // -------------------------------------------------------------------------
    // Core Quest Functions
    // -------------------------------------------------------------------------

    function startQuest(uint256 tokenId, uint256 questId) external nonReentrant whenNotPaused {
        if (questId >= questCount) revert QuestNotFound();

        QuestDef storage quest = quests[questId];
        if (!quest.active) revert QuestNotActive();
        if (isWarriorOnQuest[tokenId]) revert WarriorAlreadyOnQuest();
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotWarriorOwner();

        IArenaWarrior.Warrior memory w = arenaWarrior.getWarrior(tokenId);
        if (w.level < quest.minLevel) revert LevelTooLow();
        if (w.powerScore < quest.minPowerScore) revert PowerScoreTooLow();

        uint256 endsAt = block.timestamp + quest.duration;

        activeQuests[tokenId] = ActiveQuest({
            questId: questId,
            tokenId: tokenId,
            player: msg.sender,
            startedAt: block.timestamp,
            endsAt: endsAt,
            completed: false,
            won: false
        });

        isWarriorOnQuest[tokenId] = true;
        totalQuestsStarted++;

        emit QuestStarted(questId, tokenId, msg.sender, endsAt);
    }

    function completeQuest(uint256 tokenId) external nonReentrant whenNotPaused {
        ActiveQuest storage aq = activeQuests[tokenId];
        if (aq.player == address(0)) revert QuestNotStarted();
        if (aq.completed) revert QuestAlreadyCompleted();
        if (aq.player != msg.sender) revert NotQuestPlayer();
        if (block.timestamp < aq.endsAt) revert QuestNotFinished();

        QuestDef storage quest = quests[aq.questId];
        IArenaWarrior.Warrior memory w = arenaWarrior.getWarrior(tokenId);

        // Calculate success chance
        bool won = _calculateOutcome(tokenId, aq.questId, w, quest);
        uint256 xpGained = won ? quest.winXP : quest.lossXP;

        // Update quest state
        aq.completed = true;
        aq.won = won;
        isWarriorOnQuest[tokenId] = false;

        // Record on ArenaWarrior (XP + win/loss)
        arenaWarrior.recordBattle(tokenId, won, xpGained);

        totalQuestsCompleted++;
        if (won) totalQuestsWon++;

        // Update wallet tier progression
        WalletProgression storage wp = walletProgression[msg.sender];
        wp.questsCompleted++;
        if (won) wp.questsWon++;
        wp.totalXP += xpGained;
        wp.tierProgress++;

        if (wp.tierProgress >= questsPerTier) {
            wp.tier++;
            wp.tierProgress = 0;
            emit TierAdvanced(msg.sender, wp.tier, wp.questsCompleted, wp.totalXP);
        }

        emit QuestCompleted(aq.questId, tokenId, msg.sender, won, xpGained);
    }

    function abandonQuest(uint256 tokenId) external nonReentrant {
        ActiveQuest storage aq = activeQuests[tokenId];
        if (aq.player == address(0)) revert QuestNotStarted();
        if (aq.completed) revert QuestAlreadyCompleted();
        if (aq.player != msg.sender) revert NotQuestPlayer();

        uint256 questId = aq.questId;
        isWarriorOnQuest[tokenId] = false;
        aq.completed = true; // Mark as done (no reward)

        emit QuestAbandoned(questId, tokenId, msg.sender);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getQuest(uint256 questId) external view returns (QuestDef memory) {
        if (questId >= questCount) revert QuestNotFound();
        return quests[questId];
    }

    function getActiveQuest(uint256 tokenId) external view returns (ActiveQuest memory) {
        return activeQuests[tokenId];
    }

    function getWalletProgression(address wallet) external view returns (WalletProgression memory) {
        return walletProgression[wallet];
    }

    function getQuestsByZone(uint8 zone) external view returns (QuestDef[] memory) {
        // First count quests in this zone
        uint256 count = 0;
        for (uint256 i = 0; i < questCount; i++) {
            if (quests[i].zone == zone) count++;
        }

        QuestDef[] memory result = new QuestDef[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < questCount; i++) {
            if (quests[i].zone == zone) {
                result[idx] = quests[i];
                idx++;
            }
        }
        return result;
    }

    function getQuestStats() external view returns (
        uint256 _totalStarted,
        uint256 _totalCompleted,
        uint256 _totalWon,
        uint256 _questCount
    ) {
        return (totalQuestsStarted, totalQuestsCompleted, totalQuestsWon, questCount);
    }

    function getSuccessChance(uint256 tokenId, uint256 questId) external view returns (uint256) {
        if (questId >= questCount) revert QuestNotFound();
        IArenaWarrior.Warrior memory w = arenaWarrior.getWarrior(tokenId);
        QuestDef storage quest = quests[questId];
        return _calculateSuccessChance(w, quest);
    }

    // -------------------------------------------------------------------------
    // Pausable
    // -------------------------------------------------------------------------

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _calculateOutcome(
        uint256 tokenId,
        uint256 questId,
        IArenaWarrior.Warrior memory w,
        QuestDef storage quest
    ) internal view returns (bool) {
        uint256 chance = _calculateSuccessChance(w, quest);

        uint256 roll = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            block.number,
            msg.sender,
            w.powerScore,
            questId,
            tokenId,
            gasleft()
        ))) % 1000;

        return roll < chance;
    }

    function _calculateSuccessChance(
        IArenaWarrior.Warrior memory w,
        QuestDef storage quest
    ) internal view returns (uint256) {
        // Power contribution: powerScore * 1000 / (powerScore + baseDifficulty * 10)
        uint256 ps = w.powerScore;
        uint256 bd = uint256(quest.baseDifficulty) * 10;
        uint256 powerContribution = (ps * 1000) / (ps + bd);

        // Element bonus: +150 (15%) if warrior's element beats zone's element
        uint256 elementBonus = 0;
        uint8 warriorElement = uint8(w.element);
        if (_elementAdvantages[warriorElement] == quest.zone) {
            elementBonus = 150;
        }

        // Level bonus: (level - minLevel) * 5, capped at 250 (+25%)
        uint256 levelBonus = 0;
        if (w.level > quest.minLevel) {
            levelBonus = uint256(w.level - quest.minLevel) * 5;
            if (levelBonus > 250) levelBonus = 250;
        }

        // Total chance, capped at 950 (95%)
        uint256 totalChance = powerContribution + elementBonus + levelBonus;
        if (totalChance > 950) totalChance = 950;

        return totalChance;
    }
}
