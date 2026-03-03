// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IArenaWarriorTeam {
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

contract TeamBattleEngine is
    OwnableUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using ECDSA for bytes32;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MIN_STAKE = 0.01 ether;
    uint256 public constant FEE_BASIS_POINTS = 250; // 2.5%
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant BATTLE_TIMEOUT = 1 hours;
    uint256 public constant TEAM_SIZE = 3;
    uint256 public constant WINS_TO_WIN = 2; // Best of 3

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

    struct TeamBattle {
        uint256 id;
        address player1;
        address player2;
        uint256[3] team1;       // player1's 3 warrior NFT IDs
        uint256[3] team2;       // player2's 3 warrior NFT IDs
        uint256 stake;
        uint8 score1;           // player1 rounds won (0-3)
        uint8 score2;           // player2 rounds won (0-3)
        uint8[3] matchups;      // random matchup order (team2 indices)
        address winner;
        bool resolved;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------

    IArenaWarriorTeam public arenaWarrior;
    address public feeRecipient;
    uint256 public battleCounter;
    uint256 public accumulatedFees;

    mapping(uint256 => TeamBattle) public teamBattles;
    mapping(address => uint256[]) private playerBattles;

    uint256[] private openBattleIds;
    mapping(uint256 => uint256) private openBattleIndex;

    // Multi-admin
    mapping(address => bool) public admins;

    // Platform stats
    uint256 public totalWagered;

    // Resolved battles tracking
    uint256[] private resolvedBattleIds;

    // Signature verification
    address public trustedSigner;
    mapping(address => uint256) public nonces;

    // Storage gap for future upgrades
    uint256[44] private __gap;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TeamBattleCreated(
        uint256 indexed battleId,
        address indexed player1,
        uint256[3] team,
        uint256 stake
    );

    event TeamBattleJoined(
        uint256 indexed battleId,
        address indexed player2,
        uint256[3] team
    );

    event TeamBattleResolved(
        uint256 indexed battleId,
        address indexed winner,
        address indexed loser,
        uint8 score1,
        uint8 score2,
        uint256 payout
    );

    event TeamBattleCancelled(uint256 indexed battleId, address indexed player);

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
    error DuplicateTokenIds();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != owner() && !admins[msg.sender]) revert NotAdmin();
        _;
    }

    // -------------------------------------------------------------------------
    // Initializer
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

        arenaWarrior = IArenaWarriorTeam(_arenaWarrior);
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
    // Core Functions
    // -------------------------------------------------------------------------

    function createTeamBattle(
        uint256[3] calldata tokenIds,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        if (address(arenaWarrior) == address(0)) revert ArenaWarriorNotSet();
        if (msg.value < MIN_STAKE) revert InsufficientStake();

        // Validate all 3 NFTs are owned by sender and are unique
        _validateTeam(tokenIds, msg.sender);

        // Signature verification (optional)
        _verifySignature(msg.sender, tokenIds[0], nonces[msg.sender], signature);
        nonces[msg.sender]++;

        uint256 battleId = battleCounter++;

        TeamBattle storage tb = teamBattles[battleId];
        tb.id = battleId;
        tb.player1 = msg.sender;
        tb.team1 = tokenIds;
        tb.stake = msg.value;
        tb.createdAt = block.timestamp;

        playerBattles[msg.sender].push(battleId);

        // Track as open battle
        openBattleIndex[battleId] = openBattleIds.length;
        openBattleIds.push(battleId);

        // Update platform stats
        totalWagered += msg.value;

        emit TeamBattleCreated(battleId, msg.sender, tokenIds, msg.value);
    }

    function joinTeamBattle(
        uint256 battleId,
        uint256[3] calldata tokenIds,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        TeamBattle storage tb = teamBattles[battleId];

        if (tb.player1 == address(0)) revert BattleNotFound();
        if (tb.resolved) revert BattleAlreadyResolved();
        if (tb.player2 != address(0)) revert BattleNotOpen();
        if (tb.player1 == msg.sender) revert CannotBattleSelf();
        if (msg.value != tb.stake) revert StakeMismatch();

        // Validate all 3 NFTs are owned by sender and are unique
        _validateTeam(tokenIds, msg.sender);

        // Signature verification (optional)
        _verifySignature(msg.sender, tokenIds[0], nonces[msg.sender], signature);
        nonces[msg.sender]++;

        tb.player2 = msg.sender;
        tb.team2 = tokenIds;

        playerBattles[msg.sender].push(battleId);

        // Remove from open battles
        _removeOpenBattle(battleId);

        // Update platform stats
        totalWagered += msg.value;

        emit TeamBattleJoined(battleId, msg.sender, tokenIds);

        // Generate matchups and resolve
        _generateMatchups(battleId);
        _resolveTeamBattle(battleId);
    }

    function cancelTeamBattle(uint256 battleId) external nonReentrant whenNotPaused {
        TeamBattle storage tb = teamBattles[battleId];

        if (tb.player1 == address(0)) revert BattleNotFound();
        if (tb.player1 != msg.sender) revert NotBattleCreator();
        if (tb.player2 != address(0)) revert BattleHasOpponent();
        if (tb.resolved) revert BattleAlreadyResolved();

        tb.resolved = true;
        tb.resolvedAt = block.timestamp;

        _removeOpenBattle(battleId);

        emit TeamBattleCancelled(battleId, msg.sender);

        (bool success, ) = msg.sender.call{value: tb.stake}("");
        if (!success) revert TransferFailed();
    }

    function claimTimeout(uint256 battleId) external nonReentrant whenNotPaused {
        TeamBattle storage tb = teamBattles[battleId];

        if (tb.player1 == address(0)) revert BattleNotFound();
        if (tb.resolved) revert BattleAlreadyResolved();
        if (tb.player2 != address(0)) revert BattleHasOpponent();
        if (block.timestamp < tb.createdAt + BATTLE_TIMEOUT)
            revert BattleNotTimedOut();

        tb.resolved = true;
        tb.resolvedAt = block.timestamp;

        _removeOpenBattle(battleId);

        emit TeamBattleCancelled(battleId, tb.player1);

        (bool success, ) = tb.player1.call{value: tb.stake}("");
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
        arenaWarrior = IArenaWarriorTeam(_arenaWarrior);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _feeRecipient;
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getOpenTeamBattles(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
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

    function getOpenTeamBattleCount() external view returns (uint256) {
        return openBattleIds.length;
    }

    function getTeamBattle(uint256 battleId)
        external
        view
        returns (
            uint256 id,
            address player1,
            address player2,
            uint256[3] memory team1,
            uint256[3] memory team2,
            uint256 stake,
            uint8 score1,
            uint8 score2,
            uint8[3] memory matchups,
            address winner,
            bool resolved,
            uint256 createdAt,
            uint256 resolvedAt
        )
    {
        TeamBattle storage tb = teamBattles[battleId];
        return (
            tb.id,
            tb.player1,
            tb.player2,
            tb.team1,
            tb.team2,
            tb.stake,
            tb.score1,
            tb.score2,
            tb.matchups,
            tb.winner,
            tb.resolved,
            tb.createdAt,
            tb.resolvedAt
        );
    }

    function getTeamBattleHistory(address player) external view returns (uint256[] memory) {
        return playerBattles[player];
    }

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

    function getResolvedTeamBattles(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
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

    function getResolvedTeamBattleCount() external view returns (uint256) {
        return resolvedBattleIds.length;
    }

    function getPlayerTeamBattlesPaginated(
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

    function getPlayerTeamBattleCount(address player) external view returns (uint256) {
        return playerBattles[player].length;
    }

    // -------------------------------------------------------------------------
    // Internal Functions
    // -------------------------------------------------------------------------

    function _validateTeam(uint256[3] calldata tokenIds, address player) internal view {
        // Check uniqueness
        if (tokenIds[0] == tokenIds[1] || tokenIds[0] == tokenIds[2] || tokenIds[1] == tokenIds[2]) {
            revert DuplicateTokenIds();
        }

        // Check ownership
        for (uint256 i = 0; i < TEAM_SIZE; i++) {
            if (arenaWarrior.ownerOf(tokenIds[i]) != player) revert NotNFTOwner();
        }
    }

    function _generateMatchups(uint256 battleId) internal {
        TeamBattle storage tb = teamBattles[battleId];

        // Fisher-Yates shuffle for [0, 1, 2]
        uint8[3] memory order = [uint8(0), uint8(1), uint8(2)];

        for (uint256 i = 2; i > 0; i--) {
            uint256 rand = _pseudoRandom(
                tb.team1[0],
                tb.team2[0],
                battleId * 100 + i
            );
            uint256 j = rand % (i + 1);
            // Swap
            uint8 temp = order[i];
            order[i] = order[j];
            order[j] = temp;
        }

        tb.matchups = order;
    }

    function _resolveTeamBattle(uint256 battleId) internal {
        TeamBattle storage tb = teamBattles[battleId];

        // Re-verify NFT ownership for all 6 warriors
        for (uint256 i = 0; i < TEAM_SIZE; i++) {
            require(
                arenaWarrior.ownerOf(tb.team1[i]) == tb.player1,
                "TeamBattle: player1 no longer owns NFT"
            );
            require(
                arenaWarrior.ownerOf(tb.team2[i]) == tb.player2,
                "TeamBattle: player2 no longer owns NFT"
            );
        }

        uint8 s1 = 0;
        uint8 s2 = 0;

        // Play up to 3 rounds (early exit when someone reaches 2 wins)
        for (uint256 round = 0; round < TEAM_SIZE; round++) {
            uint256 team1TokenId = tb.team1[round];
            uint256 team2Index = tb.matchups[round];
            uint256 team2TokenId = tb.team2[team2Index];

            IArenaWarriorTeam.Warrior memory w1 = arenaWarrior.getWarrior(team1TokenId);
            IArenaWarriorTeam.Warrior memory w2 = arenaWarrior.getWarrior(team2TokenId);

            uint256 score1 = _calculateCombatScore(
                w1, w2.element, team1TokenId, team2TokenId, round + 1
            );
            uint256 score2 = _calculateCombatScore(
                w2, w1.element, team2TokenId, team1TokenId, round + 1 + TEAM_SIZE
            );

            if (score1 > score2) {
                s1++;
            } else if (score2 > score1) {
                s2++;
            } else {
                // Tie: coin flip using pseudo-random
                uint256 tieBreaker = _pseudoRandom(team1TokenId, team2TokenId, round + TEAM_SIZE * 2) % 2;
                if (tieBreaker == 0) {
                    s1++;
                } else {
                    s2++;
                }
            }

            // Early exit if someone already won
            if (s1 >= WINS_TO_WIN || s2 >= WINS_TO_WIN) {
                break;
            }
        }

        tb.score1 = s1;
        tb.score2 = s2;

        // Determine winner
        address winnerAddr;
        address loserAddr;

        if (s1 >= WINS_TO_WIN) {
            winnerAddr = tb.player1;
            loserAddr = tb.player2;
        } else {
            winnerAddr = tb.player2;
            loserAddr = tb.player1;
        }

        // --- Effects ---
        tb.winner = winnerAddr;
        tb.resolved = true;
        tb.resolvedAt = block.timestamp;

        resolvedBattleIds.push(battleId);

        // Calculate payout
        uint256 totalPot = tb.stake * 2;
        uint256 fee = (totalPot * FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 payout = totalPot - fee;

        accumulatedFees += fee;

        emit TeamBattleResolved(battleId, winnerAddr, loserAddr, s1, s2, payout);

        // --- Interactions: record battle results for all 6 warriors ---
        bool player1Won = (winnerAddr == tb.player1);

        for (uint256 i = 0; i < TEAM_SIZE; i++) {
            arenaWarrior.recordBattle(tb.team1[i], player1Won, player1Won ? WIN_EXPERIENCE : LOSS_EXPERIENCE);
            arenaWarrior.recordBattle(tb.team2[i], !player1Won, !player1Won ? WIN_EXPERIENCE : LOSS_EXPERIENCE);
        }

        // Transfer winnings
        (bool success, ) = winnerAddr.call{value: payout}("");
        if (!success) revert TransferFailed();
    }

    function _calculateCombatScore(
        IArenaWarriorTeam.Warrior memory warrior,
        uint8 opponentElement,
        uint256 selfTokenId,
        uint256 otherTokenId,
        uint256 salt
    ) internal view returns (uint256) {
        uint256 baseScore = uint256(warrior.attack) * ATTACK_WEIGHT +
            uint256(warrior.defense) * DEFENSE_WEIGHT +
            uint256(warrior.speed) * SPEED_WEIGHT +
            uint256(warrior.specialPower) * SPECIAL_WEIGHT;

        uint256 elementBonus = 0;
        if (_hasElementAdvantage(warrior.element, opponentElement)) {
            elementBonus = uint256(warrior.specialPower) * SPECIAL_WEIGHT;
        }

        uint256 levelMultipliedScore = ((baseScore + elementBonus) *
            (100 + uint256(warrior.level))) / 100;

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
        if (attackerElement == ELEMENT_FIRE && defenderElement == ELEMENT_WIND) return true;
        if (attackerElement == ELEMENT_WIND && defenderElement == ELEMENT_ICE) return true;
        if (attackerElement == ELEMENT_ICE && defenderElement == ELEMENT_WATER) return true;
        if (attackerElement == ELEMENT_WATER && defenderElement == ELEMENT_FIRE) return true;
        if (attackerElement == ELEMENT_EARTH && defenderElement == ELEMENT_THUNDER) return true;
        if (attackerElement == ELEMENT_THUNDER && defenderElement == ELEMENT_SHADOW) return true;
        if (attackerElement == ELEMENT_SHADOW && defenderElement == ELEMENT_LIGHT) return true;
        if (attackerElement == ELEMENT_LIGHT && defenderElement == ELEMENT_EARTH) return true;

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
