// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IArenaWarrior {
    struct Warrior {
        uint8 attack;
        uint8 defense;
        uint8 speed;
        uint8 element;
        uint8 specialPower;
        uint8 level;
        uint256 experience;
        uint256 battleWins;
        uint256 battleLosses;
        uint256 powerScore;
    }

    function getWarrior(uint256 tokenId) external view returns (Warrior memory);
    function ownerOf(uint256 tokenId) external view returns (address);
    function recordBattle(uint256 tokenId, bool won, uint256 expGained) external;
}

contract BattleEngine is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MIN_STAKE = 0.005 ether;
    uint256 public constant FEE_BASIS_POINTS = 250; // 2.5%
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant BATTLE_TIMEOUT = 1 hours;

    // Combat attribute weights
    uint256 public constant ATTACK_WEIGHT = 3;
    uint256 public constant DEFENSE_WEIGHT = 2;
    uint256 public constant SPEED_WEIGHT = 2;
    uint256 public constant SPECIAL_WEIGHT = 4;

    // Element constants
    uint8 public constant ELEMENT_FIRE = 0;
    uint8 public constant ELEMENT_WIND = 1;
    uint8 public constant ELEMENT_ICE = 2;
    uint8 public constant ELEMENT_WATER = 3;
    uint8 public constant ELEMENT_EARTH = 4;
    uint8 public constant ELEMENT_THUNDER = 5;
    uint8 public constant ELEMENT_SHADOW = 6;
    uint8 public constant ELEMENT_LIGHT = 7;

    // Experience rewards
    uint256 public constant WIN_EXPERIENCE = 100;
    uint256 public constant LOSS_EXPERIENCE = 25;

    // -------------------------------------------------------------------------
    // Data Structures
    // -------------------------------------------------------------------------

    struct Battle {
        uint256 id;
        address player1;
        address player2;
        uint256 nft1;
        uint256 nft2;
        uint256 stake;
        address winner;
        bool resolved;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    IArenaWarrior public arenaWarrior;
    address public feeRecipient;
    uint256 public battleCounter;
    uint256 public accumulatedFees;

    mapping(uint256 => Battle) public battles;
    mapping(address => uint256[]) private playerBattles;

    uint256[] private openBattleIds;
    mapping(uint256 => uint256) private openBattleIndex; // battleId => index in openBattleIds

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event BattleCreated(
        uint256 indexed battleId,
        address indexed player1,
        uint256 tokenId,
        uint256 stake
    );

    event BattleJoined(
        uint256 indexed battleId,
        address indexed player2,
        uint256 tokenId
    );

    event BattleResolved(
        uint256 indexed battleId,
        address indexed winner,
        address indexed loser,
        uint256 payout
    );

    event BattleCancelled(uint256 indexed battleId, address indexed player);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ArenaWarriorNotSet();
    error InsufficientStake();
    error NotNFTOwner();
    error BattleNotFound();
    error BattleAlreadyResolved();
    error BattleNotOpen();
    error CannotBattleSelf();
    error NotBattleCreator();
    error BattleHasOpponent();
    error BattleNotTimedOut();
    error InvalidAddress();
    error StakeMismatch();
    error NoFeesToWithdraw();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _arenaWarrior,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        arenaWarrior = IArenaWarrior(_arenaWarrior);
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // External / Public Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new battle by staking AVAX with your warrior NFT.
     * @param tokenId The token ID of the ArenaWarrior NFT to use in battle.
     */
    function createBattle(uint256 tokenId) external payable nonReentrant {
        if (address(arenaWarrior) == address(0)) revert ArenaWarriorNotSet();
        if (msg.value < MIN_STAKE) revert InsufficientStake();
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();

        uint256 battleId = battleCounter++;

        battles[battleId] = Battle({
            id: battleId,
            player1: msg.sender,
            player2: address(0),
            nft1: tokenId,
            nft2: 0,
            stake: msg.value,
            winner: address(0),
            resolved: false,
            createdAt: block.timestamp,
            resolvedAt: 0
        });

        playerBattles[msg.sender].push(battleId);

        // Track as open battle
        openBattleIndex[battleId] = openBattleIds.length;
        openBattleIds.push(battleId);

        emit BattleCreated(battleId, msg.sender, tokenId, msg.value);
    }

    /**
     * @notice Join an existing battle with your warrior NFT. The battle resolves
     *         automatically based on warrior attributes.
     * @param battleId The ID of the battle to join.
     * @param tokenId  The token ID of your ArenaWarrior NFT.
     */
    function joinBattle(
        uint256 battleId,
        uint256 tokenId
    ) external payable nonReentrant {
        Battle storage battle = battles[battleId];

        if (battle.player1 == address(0)) revert BattleNotFound();
        if (battle.resolved) revert BattleAlreadyResolved();
        if (battle.player2 != address(0)) revert BattleNotOpen();
        if (battle.player1 == msg.sender) revert CannotBattleSelf();
        if (msg.value != battle.stake) revert StakeMismatch();
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();

        battle.player2 = msg.sender;
        battle.nft2 = tokenId;

        playerBattles[msg.sender].push(battleId);

        // Remove from open battles
        _removeOpenBattle(battleId);

        emit BattleJoined(battleId, msg.sender, tokenId);

        // Resolve the battle immediately
        _resolveBattle(battleId);
    }

    /**
     * @notice Cancel a battle that has not been joined yet. Refunds the stake.
     * @param battleId The ID of the battle to cancel.
     */
    function cancelBattle(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];

        if (battle.player1 == address(0)) revert BattleNotFound();
        if (battle.player1 != msg.sender) revert NotBattleCreator();
        if (battle.player2 != address(0)) revert BattleHasOpponent();
        if (battle.resolved) revert BattleAlreadyResolved();

        battle.resolved = true;
        battle.resolvedAt = block.timestamp;

        // Remove from open battles
        _removeOpenBattle(battleId);

        emit BattleCancelled(battleId, msg.sender);

        // Refund the stake
        (bool success, ) = msg.sender.call{value: battle.stake}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Claim a timeout refund if a battle has been open for more than 1 hour
     *         without an opponent joining.
     * @param battleId The ID of the timed-out battle.
     */
    function claimTimeout(uint256 battleId) external nonReentrant {
        Battle storage battle = battles[battleId];

        if (battle.player1 == address(0)) revert BattleNotFound();
        if (battle.resolved) revert BattleAlreadyResolved();
        if (battle.player2 != address(0)) revert BattleHasOpponent();
        if (block.timestamp < battle.createdAt + BATTLE_TIMEOUT)
            revert BattleNotTimedOut();

        battle.resolved = true;
        battle.resolvedAt = block.timestamp;

        // Remove from open battles
        _removeOpenBattle(battleId);

        emit BattleCancelled(battleId, battle.player1);

        // Refund the stake to player1
        (bool success, ) = battle.player1.call{value: battle.stake}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Withdraw accumulated platform fees to the fee recipient.
     */
    function withdrawFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;

        (bool success, ) = feeRecipient.call{value: fees}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Set the ArenaWarrior NFT contract address.
     * @param _arenaWarrior The new ArenaWarrior contract address.
     */
    function setArenaWarrior(address _arenaWarrior) external onlyOwner {
        if (_arenaWarrior == address(0)) revert InvalidAddress();
        arenaWarrior = IArenaWarrior(_arenaWarrior);
    }

    /**
     * @notice Set the fee recipient address.
     * @param _feeRecipient The new fee recipient address.
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Get a paginated slice of currently open (unjoined) battle IDs.
     * @param offset The starting index in the openBattleIds array.
     * @param limit  The maximum number of IDs to return.
     * @return ids An array of battle IDs that are waiting for an opponent.
     */
    function getOpenBattles(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 total = openBattleIds.length;
        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - offset;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = openBattleIds[offset + i];
        }
    }

    /**
     * @notice Return the total number of open battles (useful for pagination).
     * @return The length of the openBattleIds array.
     */
    function getOpenBattleCount() external view returns (uint256) {
        return openBattleIds.length;
    }

    /**
     * @notice Get the full details of a battle.
     * @param battleId The ID of the battle.
     * @return The Battle struct.
     */
    function getBattle(
        uint256 battleId
    ) external view returns (Battle memory) {
        return battles[battleId];
    }

    /**
     * @notice Get all battle IDs a player has participated in.
     * @param player The player address.
     * @return An array of battle IDs.
     */
    function getBattleHistory(
        address player
    ) external view returns (uint256[] memory) {
        return playerBattles[player];
    }

    // -------------------------------------------------------------------------
    // Internal Functions
    // -------------------------------------------------------------------------

    /**
     * @dev Resolve a battle between two warriors based on their attributes.
     *      Calculates combat scores with element advantages and a random factor,
     *      then distributes winnings.
     * @param battleId The ID of the battle to resolve.
     */
    function _resolveBattle(uint256 battleId) internal {
        Battle storage battle = battles[battleId];

        IArenaWarrior.Warrior memory warrior1 = arenaWarrior.getWarrior(
            battle.nft1
        );
        IArenaWarrior.Warrior memory warrior2 = arenaWarrior.getWarrior(
            battle.nft2
        );

        // Calculate combat scores
        uint256 score1 = _calculateCombatScore(
            warrior1,
            warrior2.element,
            battle.nft1,
            battle.nft2,
            1
        );
        uint256 score2 = _calculateCombatScore(
            warrior2,
            warrior1.element,
            battle.nft2,
            battle.nft1,
            2
        );

        // Determine winner (player1 wins ties)
        address winnerAddr;
        address loserAddr;
        uint256 winnerNft;
        uint256 loserNft;

        if (score1 >= score2) {
            winnerAddr = battle.player1;
            loserAddr = battle.player2;
            winnerNft = battle.nft1;
            loserNft = battle.nft2;
        } else {
            winnerAddr = battle.player2;
            loserAddr = battle.player1;
            winnerNft = battle.nft2;
            loserNft = battle.nft1;
        }

        // --- Effects: all state changes BEFORE external calls ---
        battle.winner = winnerAddr;
        battle.resolved = true;
        battle.resolvedAt = block.timestamp;

        // Calculate payout: total pot minus platform fee
        uint256 totalPot = battle.stake * 2;
        uint256 fee = (totalPot * FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 payout = totalPot - fee;

        accumulatedFees += fee;

        // Emit event BEFORE external calls
        emit BattleResolved(battleId, winnerAddr, loserAddr, payout);

        // --- Interactions: external calls AFTER all state changes ---
        // Record battle results on the NFT contract
        arenaWarrior.recordBattle(winnerNft, true, WIN_EXPERIENCE);
        arenaWarrior.recordBattle(loserNft, false, LOSS_EXPERIENCE);

        // Transfer winnings to the winner
        (bool success, ) = winnerAddr.call{value: payout}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @dev Calculate the combat score for a warrior.
     *      score = (attack * ATTACK_WEIGHT + defense * DEFENSE_WEIGHT +
     *               speed * SPEED_WEIGHT + specialPower * SPECIAL_WEIGHT +
     *               element_bonus) * level_multiplier + random_factor
     *
     * @param warrior       The warrior's stats.
     * @param opponentElement The opponent's element type.
     * @param selfTokenId   This warrior's token ID (for randomness).
     * @param otherTokenId  Opponent's token ID (for randomness).
     * @param salt          Additional salt to differentiate random rolls.
     * @return The computed combat score.
     */
    function _calculateCombatScore(
        IArenaWarrior.Warrior memory warrior,
        uint8 opponentElement,
        uint256 selfTokenId,
        uint256 otherTokenId,
        uint256 salt
    ) internal view returns (uint256) {
        // Base weighted stats
        uint256 baseScore = uint256(warrior.attack) * ATTACK_WEIGHT +
            uint256(warrior.defense) * DEFENSE_WEIGHT +
            uint256(warrior.speed) * SPEED_WEIGHT +
            uint256(warrior.specialPower) * SPECIAL_WEIGHT;

        // Element advantage: 2x bonus to specialPower if this warrior's element
        // beats the opponent's element
        uint256 elementBonus = 0;
        if (_hasElementAdvantage(warrior.element, opponentElement)) {
            elementBonus = uint256(warrior.specialPower) * SPECIAL_WEIGHT; // effectively doubles special contribution
        }

        // Level multiplier: multiply by (100 + level) then divide by 100
        // so level 1 = 1.01x, level 10 = 1.10x, level 100 = 2.0x
        uint256 levelMultipliedScore = ((baseScore + elementBonus) *
            (100 + uint256(warrior.level))) / 100;

        // Random factor: 0-20 additional points
        uint256 randomFactor = _pseudoRandom(
            selfTokenId,
            otherTokenId,
            salt
        ) % 21;

        return levelMultipliedScore + randomFactor;
    }

    /**
     * @dev Determine if attackerElement has an advantage over defenderElement.
     *      Fire > Wind, Wind > Ice, Ice > Water, Water > Fire,
     *      Earth > Thunder, Thunder > Shadow, Shadow > Light, Light > Earth.
     */
    function _hasElementAdvantage(
        uint8 attackerElement,
        uint8 defenderElement
    ) internal pure returns (bool) {
        if (
            attackerElement == ELEMENT_FIRE &&
            defenderElement == ELEMENT_WIND
        ) return true;
        if (
            attackerElement == ELEMENT_WIND &&
            defenderElement == ELEMENT_ICE
        ) return true;
        if (
            attackerElement == ELEMENT_ICE &&
            defenderElement == ELEMENT_WATER
        ) return true;
        if (
            attackerElement == ELEMENT_WATER &&
            defenderElement == ELEMENT_FIRE
        ) return true;
        if (
            attackerElement == ELEMENT_EARTH &&
            defenderElement == ELEMENT_THUNDER
        ) return true;
        if (
            attackerElement == ELEMENT_THUNDER &&
            defenderElement == ELEMENT_SHADOW
        ) return true;
        if (
            attackerElement == ELEMENT_SHADOW &&
            defenderElement == ELEMENT_LIGHT
        ) return true;
        if (
            attackerElement == ELEMENT_LIGHT &&
            defenderElement == ELEMENT_EARTH
        ) return true;

        return false;
    }

    /**
     * @dev Generate a pseudo-random number using block.prevrandao, block.timestamp,
     *      and both token IDs.
     */
    function _pseudoRandom(
        uint256 tokenId1,
        uint256 tokenId2,
        uint256 salt
    ) internal view returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.prevrandao,
                        block.timestamp,
                        tokenId1,
                        tokenId2,
                        salt
                    )
                )
            );
    }

    /**
     * @dev Remove a battle from the open battles array using swap-and-pop.
     * @param battleId The battle ID to remove.
     */
    function _removeOpenBattle(uint256 battleId) internal {
        uint256 index = openBattleIndex[battleId];
        uint256 lastIndex = openBattleIds.length - 1;

        if (index != lastIndex) {
            uint256 lastBattleId = openBattleIds[lastIndex];
            openBattleIds[index] = lastBattleId;
            openBattleIndex[lastBattleId] = index;
        }

        openBattleIds.pop();
        delete openBattleIndex[battleId];
    }
}
