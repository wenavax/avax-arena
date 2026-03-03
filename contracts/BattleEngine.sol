// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IArenaWarrior {
    struct Warrior {
        uint8 attack;
        uint8 defense;
        uint8 speed;
        uint8 element;
        uint8 specialPower;
        uint16 level;
        uint256 experience;
        uint256 battleWins;
        uint256 battleLosses;
        uint256 powerScore;
    }

    function getWarrior(uint256 tokenId) external view returns (Warrior memory);
    function ownerOf(uint256 tokenId) external view returns (address);
    function recordBattle(uint256 tokenId, bool won, uint256 expGained) external;
}

contract BattleEngine is
    OwnableUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using ECDSA for bytes32;

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
    uint8 public constant ELEMENT_WATER = 1;
    uint8 public constant ELEMENT_WIND = 2;
    uint8 public constant ELEMENT_ICE = 3;
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

    // NEW: Multi-admin
    mapping(address => bool) public admins;

    // NEW: Platform stats
    uint256 public totalWagered;

    // NEW: Resolved battles tracking (for pagination)
    uint256[] private resolvedBattleIds;

    // NEW: Signature verification
    address public trustedSigner;
    mapping(address => uint256) public nonces;

    // NEW: Storage gap for future upgrades
    uint256[44] private __gap;

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

    // NEW: Admin events
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event TrustedSignerUpdated(address indexed signer);
    event ContractPaused(address indexed by);
    event ContractUnpaused(address indexed by);

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
    error NotAdmin();
    error InvalidSignature();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != owner() && !admins[msg.sender]) revert NotAdmin();
        _;
    }

    // -------------------------------------------------------------------------
    // Initializer (replaces constructor)
    // -------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _arenaWarrior,
        address _feeRecipient
    ) public initializer {
        if (_feeRecipient == address(0)) revert InvalidAddress();

        __Ownable_init(msg.sender);
        __Pausable_init();

        arenaWarrior = IArenaWarrior(_arenaWarrior);
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // UUPS Required
    // -------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // -------------------------------------------------------------------------
    // Admin Functions
    // -------------------------------------------------------------------------

    function addAdmin(address admin) external onlyOwner {
        if (admin == address(0)) revert InvalidAddress();
        admins[admin] = true;
        emit AdminAdded(admin);
    }

    function removeAdmin(address admin) external onlyOwner {
        admins[admin] = false;
        emit AdminRemoved(admin);
    }

    function pause() external onlyAdmin {
        _pause();
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyAdmin {
        _unpause();
        emit ContractUnpaused(msg.sender);
    }

    function setTrustedSigner(address _signer) external onlyOwner {
        trustedSigner = _signer;
        emit TrustedSignerUpdated(_signer);
    }

    // -------------------------------------------------------------------------
    // External / Public Functions
    // -------------------------------------------------------------------------

    function createBattle(
        uint256 tokenId,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        if (address(arenaWarrior) == address(0)) revert ArenaWarriorNotSet();
        if (msg.value < MIN_STAKE) revert InsufficientStake();
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();

        // Signature verification (optional — skipped if trustedSigner not set)
        _verifySignature(msg.sender, tokenId, nonces[msg.sender], signature);
        nonces[msg.sender]++;

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

        // Update platform stats
        totalWagered += msg.value;

        emit BattleCreated(battleId, msg.sender, tokenId, msg.value);
    }

    function joinBattle(
        uint256 battleId,
        uint256 tokenId,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        Battle storage battle = battles[battleId];

        if (battle.player1 == address(0)) revert BattleNotFound();
        if (battle.resolved) revert BattleAlreadyResolved();
        if (battle.player2 != address(0)) revert BattleNotOpen();
        if (battle.player1 == msg.sender) revert CannotBattleSelf();
        if (msg.value != battle.stake) revert StakeMismatch();
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotNFTOwner();

        // Signature verification (optional)
        _verifySignature(msg.sender, tokenId, nonces[msg.sender], signature);
        nonces[msg.sender]++;

        battle.player2 = msg.sender;
        battle.nft2 = tokenId;

        playerBattles[msg.sender].push(battleId);

        // Remove from open battles
        _removeOpenBattle(battleId);

        // Update platform stats
        totalWagered += msg.value;

        emit BattleJoined(battleId, msg.sender, tokenId);

        // Resolve the battle immediately
        _resolveBattle(battleId);
    }

    function cancelBattle(uint256 battleId) external nonReentrant whenNotPaused {
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

    function claimTimeout(uint256 battleId) external nonReentrant whenNotPaused {
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

    function withdrawFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;

        (bool success, ) = feeRecipient.call{value: fees}("");
        if (!success) revert TransferFailed();
    }

    function setArenaWarrior(address _arenaWarrior) external onlyOwner {
        if (_arenaWarrior == address(0)) revert InvalidAddress();
        arenaWarrior = IArenaWarrior(_arenaWarrior);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

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

    function getOpenBattleCount() external view returns (uint256) {
        return openBattleIds.length;
    }

    function getBattle(
        uint256 battleId
    ) external view returns (Battle memory) {
        return battles[battleId];
    }

    function getBattleHistory(
        address player
    ) external view returns (uint256[] memory) {
        return playerBattles[player];
    }

    // NEW: Platform Stats
    function getPlatformStats()
        external
        view
        returns (
            uint256 _totalBattles,
            uint256 _totalWagered,
            uint256 _totalFees
        )
    {
        return (battleCounter, totalWagered, accumulatedFees);
    }

    // NEW: Resolved battles pagination
    function getResolvedBattles(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 total = resolvedBattleIds.length;
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
            ids[i] = resolvedBattleIds[offset + i];
        }
    }

    function getResolvedBattleCount() external view returns (uint256) {
        return resolvedBattleIds.length;
    }

    // NEW: Player battles pagination
    function getPlayerBattlesPaginated(
        address player,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids) {
        uint256 total = playerBattles[player].length;
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
            ids[i] = playerBattles[player][offset + i];
        }
    }

    function getPlayerBattleCount(address player) external view returns (uint256) {
        return playerBattles[player].length;
    }

    // -------------------------------------------------------------------------
    // Internal Functions
    // -------------------------------------------------------------------------

    function _verifySignature(
        address player,
        uint256 tokenId,
        uint256 nonce,
        bytes calldata signature
    ) internal view {
        if (trustedSigner == address(0)) return; // disabled

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encodePacked(
                        player,
                        tokenId,
                        nonce,
                        block.chainid,
                        address(this)
                    )
                )
            )
        );
        if (ECDSA.recover(messageHash, signature) != trustedSigner)
            revert InvalidSignature();
    }

    function _resolveBattle(uint256 battleId) internal {
        Battle storage battle = battles[battleId];

        // Re-verify NFT ownership at resolution time
        require(
            arenaWarrior.ownerOf(battle.nft1) == battle.player1,
            "BattleEngine: player1 no longer owns NFT"
        );
        require(
            arenaWarrior.ownerOf(battle.nft2) == battle.player2,
            "BattleEngine: player2 no longer owns NFT"
        );

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

        // Determine winner
        address winnerAddr;
        address loserAddr;
        uint256 winnerNft;
        uint256 loserNft;

        if (score1 > score2) {
            winnerAddr = battle.player1;
            loserAddr = battle.player2;
            winnerNft = battle.nft1;
            loserNft = battle.nft2;
        } else if (score2 > score1) {
            winnerAddr = battle.player2;
            loserAddr = battle.player1;
            winnerNft = battle.nft2;
            loserNft = battle.nft1;
        } else {
            // Tie: random coin flip
            uint256 tieBreaker = _pseudoRandom(battle.nft1, battle.nft2, battleId) % 2;
            if (tieBreaker == 0) {
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
        }

        // --- Effects: all state changes BEFORE external calls ---
        battle.winner = winnerAddr;
        battle.resolved = true;
        battle.resolvedAt = block.timestamp;

        // Track resolved battle for pagination
        resolvedBattleIds.push(battleId);

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
                        block.number,
                        msg.sender,
                        tokenId1,
                        tokenId2,
                        salt,
                        battleCounter,
                        address(this).balance,
                        gasleft()
                    )
                )
            );
    }

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
