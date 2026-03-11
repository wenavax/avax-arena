// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArenaWarrior
 * @notice ERC-721 NFT contract for the Avax Arena game. Each warrior has randomized
 *         on-chain attributes, a power score derived from those attributes, and
 *         battle statistics that are updated by an authorized battle contract.
 */
contract ArenaWarrior is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum Element {
        Fire,
        Water,
        Wind,
        Ice,
        Earth,
        Thunder,
        Shadow,
        Light
    }

    struct Warrior {
        uint8 attack;        // 1-100
        uint8 defense;       // 1-100
        uint8 speed;         // 1-100
        Element element;
        uint8 specialPower;  // 1-50
        uint16 level;        // starts at 1, uint16 to avoid overflow at 256
        uint256 experience;  // starts at 0
        uint256 battleWins;
        uint256 battleLosses;
        uint256 powerScore;  // attack*3 + defense*2 + speed*2 + specialPower*5
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant WINS_PER_LEVEL = 3;
    uint256 public mergePrice = 0.005 ether;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint256 private _nextTokenId;

    /// @notice Authorized battle contracts that may update warrior stats.
    mapping(address => bool) public battleContracts;

    /// @notice Base URI for token metadata.
    string private _baseTokenURI;

    /// @notice On-chain attributes for every minted warrior.
    mapping(uint256 => Warrior) private _warriors;

    /// @notice Per-token URI overrides.
    mapping(uint256 => string) private _tokenURIs;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event WarriorMinted(
        address indexed owner,
        uint256 indexed tokenId,
        uint8 attack,
        uint8 defense,
        uint8 speed,
        Element element,
        uint8 specialPower,
        uint256 powerScore
    );

    event BattleRecorded(
        uint256 indexed tokenId,
        bool won,
        uint256 newWins,
        uint256 newLosses
    );

    event LevelUp(
        uint256 indexed tokenId,
        uint16 newLevel,
        uint256 newPowerScore
    );

    event WarriorURIUpdated(
        uint256 indexed tokenId,
        string newURI
    );

    event BattleContractAdded(address indexed battleContract);
    event BattleContractRemoved(address indexed battleContract);

    event BaseURIUpdated(string newBaseURI);
    event MergePriceUpdated(uint256 newPrice);

    event WarriorsMerged(
        address indexed owner,
        uint256 indexed resultTokenId,
        uint256 burnedTokenId1,
        uint256 burnedTokenId2,
        uint8 attack,
        uint8 defense,
        uint8 speed,
        Element element,
        uint8 specialPower,
        uint16 level,
        uint256 powerScore
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InsufficientPayment();
    error TokenDoesNotExist();
    error NotAuthorizedBattleContract();
    error WithdrawFailed();
    error InvalidBattleContractAddress();
    error AddressIsNotContract();
    error NotOwnerOfToken(uint256 tokenId);
    error CannotMergeSameToken();
    error MergeInsufficientPayment();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyBattleContract() {
        if (!battleContracts[msg.sender]) revert NotAuthorizedBattleContract();
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor()
        ERC721("ArenaWarrior", "WARRIOR")
        Ownable(msg.sender)
    {}

    // -------------------------------------------------------------------------
    // Mint
    // -------------------------------------------------------------------------

    /**
     * @notice Mint a new warrior NFT with randomly generated on-chain attributes.
     * @dev Requires exactly MINT_PRICE (0.01 AVAX). Attributes are derived from
     *      block.timestamp, msg.sender, tokenId, and block.prevrandao.
     */
    function mint() external payable nonReentrant {
        if (msg.value < MINT_PRICE) revert InsufficientPayment();

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        // Generate pseudo-random seed with multiple entropy sources
        // to make contract-based stat mining significantly harder
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.number,
                    block.prevrandao,
                    msg.sender,
                    tokenId,
                    address(this).balance,
                    totalSupply(),
                    gasleft()
                )
            )
        );

        // Derive individual attributes from different portions of the seed
        uint8 attack      = uint8((seed % 100) + 1);               // 1-100
        uint8 defense     = uint8(((seed >> 8) % 100) + 1);        // 1-100
        uint8 speed       = uint8(((seed >> 16) % 100) + 1);       // 1-100
        Element element   = Element((seed >> 24) % 8);              // 0-7
        uint8 specialPower = uint8(((seed >> 32) % 50) + 1);       // 1-50

        uint256 powerScore = _calculatePowerScore(attack, defense, speed, specialPower);

        _warriors[tokenId] = Warrior({
            attack: attack,
            defense: defense,
            speed: speed,
            element: element,
            specialPower: specialPower,
            level: 1,
            experience: 0,
            battleWins: 0,
            battleLosses: 0,
            powerScore: powerScore
        });

        _safeMint(msg.sender, tokenId);

        emit WarriorMinted(
            msg.sender,
            tokenId,
            attack,
            defense,
            speed,
            element,
            specialPower,
            powerScore
        );

        // Refund overpayment
        uint256 excess = msg.value - MINT_PRICE;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            if (!success) revert WithdrawFailed();
        }
    }

    // -------------------------------------------------------------------------
    // Merge
    // -------------------------------------------------------------------------

    /**
     * @notice Merge (fuse) two warriors into a new, stronger warrior.
     *         Both source warriors are burned on-chain.
     * @param tokenId1 First warrior to merge.
     * @param tokenId2 Second warrior to merge.
     */
    function mergeWarriors(uint256 tokenId1, uint256 tokenId2) external payable nonReentrant {
        if (msg.value < mergePrice) revert MergeInsufficientPayment();
        if (tokenId1 == tokenId2) revert CannotMergeSameToken();
        if (ownerOf(tokenId1) != msg.sender) revert NotOwnerOfToken(tokenId1);
        if (ownerOf(tokenId2) != msg.sender) revert NotOwnerOfToken(tokenId2);

        // Read stats before burning
        Warrior memory w1 = _warriors[tokenId1];
        Warrior memory w2 = _warriors[tokenId2];

        // Burn both warriors
        _burn(tokenId1);
        _burn(tokenId2);

        // Clean up storage
        delete _warriors[tokenId1];
        delete _warriors[tokenId2];
        delete _tokenURIs[tokenId1];
        delete _tokenURIs[tokenId2];

        // Calculate merged stats: avg * 1.2, truncated (Solidity integer division)
        uint8 newAttack = _mergedStat(w1.attack, w2.attack, 100);
        uint8 newDefense = _mergedStat(w1.defense, w2.defense, 100);
        uint8 newSpeed = _mergedStat(w1.speed, w2.speed, 100);
        uint8 newSpecialPower = _mergedStat(w1.specialPower, w2.specialPower, 50);

        // Element: from the parent with higher power score
        Element newElement = w1.powerScore >= w2.powerScore ? w1.element : w2.element;

        // Level: max + 1
        uint16 newLevel = (w1.level >= w2.level ? w1.level : w2.level) + 1;

        // Aggregate experience and battle record
        uint256 newExperience = w1.experience + w2.experience;
        uint256 newWins = w1.battleWins + w2.battleWins;
        uint256 newLosses = w1.battleLosses + w2.battleLosses;

        uint256 newPowerScore = _calculatePowerScore(newAttack, newDefense, newSpeed, newSpecialPower);

        // Mint new warrior
        uint256 newTokenId = _nextTokenId;
        _nextTokenId++;

        _warriors[newTokenId] = Warrior({
            attack: newAttack,
            defense: newDefense,
            speed: newSpeed,
            element: newElement,
            specialPower: newSpecialPower,
            level: newLevel,
            experience: newExperience,
            battleWins: newWins,
            battleLosses: newLosses,
            powerScore: newPowerScore
        });

        _safeMint(msg.sender, newTokenId);

        emit WarriorsMerged(
            msg.sender,
            newTokenId,
            tokenId1,
            tokenId2,
            newAttack,
            newDefense,
            newSpeed,
            newElement,
            newSpecialPower,
            newLevel,
            newPowerScore
        );

        // Refund overpayment
        uint256 excess = msg.value - mergePrice;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            if (!success) revert WithdrawFailed();
        }
    }

    // -------------------------------------------------------------------------
    // Battle & Leveling (authorized battle contract only)
    // -------------------------------------------------------------------------

    /**
     * @notice Record the result of a battle for a warrior. Only callable by the
     *         authorized battle contract.
     * @param tokenId    The warrior whose stats are updated.
     * @param won        Whether the warrior won the battle.
     * @param expGained  Experience points to award.
     */
    function recordBattle(uint256 tokenId, bool won, uint256 expGained)
        external
        onlyBattleContract
        tokenExists(tokenId)
    {
        Warrior storage w = _warriors[tokenId];

        if (won) {
            w.battleWins++;
            w.experience += expGained;

            // Level up every WINS_PER_LEVEL wins
            if (w.battleWins % WINS_PER_LEVEL == 0) {
                _levelUp(tokenId);
            }
        } else {
            w.battleLosses++;
            w.experience += expGained;
        }

        emit BattleRecorded(tokenId, won, w.battleWins, w.battleLosses);
    }

    // -------------------------------------------------------------------------
    // Token URI
    // -------------------------------------------------------------------------

    /**
     * @notice Set or update the token URI for a given warrior.
     * @dev Callable by the contract owner or the authorized battle contract.
     * @param tokenId The token whose URI is being set.
     * @param uri     The new URI string.
     */
    function setTokenURI(uint256 tokenId, string calldata uri)
        external
        tokenExists(tokenId)
    {
        if (msg.sender != owner() && !battleContracts[msg.sender]) {
            revert NotAuthorizedBattleContract();
        }

        _tokenURIs[tokenId] = uri;

        emit WarriorURIUpdated(tokenId, uri);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /**
     * @notice Add an authorized battle contract address.
     * @param _battleContract The battle contract address to authorize.
     */
    function addBattleContract(address _battleContract) external onlyOwner {
        if (_battleContract == address(0)) revert InvalidBattleContractAddress();
        uint256 codeSize;
        assembly { codeSize := extcodesize(_battleContract) }
        if (codeSize == 0) revert AddressIsNotContract();
        battleContracts[_battleContract] = true;
        emit BattleContractAdded(_battleContract);
    }

    /**
     * @notice Remove an authorized battle contract address.
     * @param _battleContract The battle contract address to de-authorize.
     */
    function removeBattleContract(address _battleContract) external onlyOwner {
        battleContracts[_battleContract] = false;
        emit BattleContractRemoved(_battleContract);
    }

    /**
     * @notice Set the base URI for token metadata.
     * @param baseURI_ The new base URI string.
     */
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    /**
     * @notice Update the merge price.
     */
    function setMergePrice(uint256 _mergePrice) external onlyOwner {
        mergePrice = _mergePrice;
        emit MergePriceUpdated(_mergePrice);
    }

    /**
     * @notice Withdraw the contract's AVAX balance to the owner.
     */
    function withdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        if (!success) revert WithdrawFailed();
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Return the full Warrior struct for a given token.
     */
    function getWarrior(uint256 tokenId)
        external
        view
        tokenExists(tokenId)
        returns (Warrior memory)
    {
        return _warriors[tokenId];
    }

    /**
     * @notice Return all token IDs owned by `ownerAddr`.
     * @dev Uses ERC721Enumerable to iterate.
     */
    function getWarriorsByOwner(address ownerAddr)
        external
        view
        returns (uint256[] memory)
    {
        uint256 balance = balanceOf(ownerAddr);
        uint256[] memory tokenIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(ownerAddr, i);
        }
        return tokenIds;
    }

    /**
     * @notice Return the power score of a warrior.
     */
    function getWarriorPowerScore(uint256 tokenId)
        external
        view
        tokenExists(tokenId)
        returns (uint256)
    {
        return _warriors[tokenId].powerScore;
    }

    // -------------------------------------------------------------------------
    // Overrides (ERC721 + ERC721Enumerable)
    // -------------------------------------------------------------------------

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();

        string memory uri = _tokenURIs[tokenId];
        if (bytes(uri).length > 0) {
            return uri;
        }
        return super.tokenURI(tokenId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    /**
     * @dev Level up a warrior: increment level, apply small stat boosts,
     *      and recalculate the power score.
     */
    function _levelUp(uint256 tokenId) internal {
        Warrior storage w = _warriors[tokenId];
        w.level++;

        // Small stat boost per level (capped at max values)
        if (w.attack < 100) {
            w.attack = w.attack + 1 > 100 ? 100 : w.attack + 1;
        }
        if (w.defense < 100) {
            w.defense = w.defense + 1 > 100 ? 100 : w.defense + 1;
        }
        if (w.speed < 100) {
            w.speed = w.speed + 1 > 100 ? 100 : w.speed + 1;
        }
        if (w.specialPower < 50) {
            w.specialPower = w.specialPower + 1 > 50 ? 50 : w.specialPower + 1;
        }

        w.powerScore = _calculatePowerScore(w.attack, w.defense, w.speed, w.specialPower);

        emit LevelUp(tokenId, w.level, w.powerScore);
    }

    /**
     * @dev Compute power score: attack*3 + defense*2 + speed*2 + specialPower*5
     */
    function _calculatePowerScore(
        uint8 attack,
        uint8 defense,
        uint8 speed,
        uint8 specialPower
    ) internal pure returns (uint256) {
        return uint256(attack) * 3
            + uint256(defense) * 2
            + uint256(speed) * 2
            + uint256(specialPower) * 5;
    }

    /**
     * @dev Calculate a merged stat: (stat1 + stat2) * 6 / 10, capped at maxVal.
     *      Equivalent to avg * 1.2 with integer truncation.
     */
    function _mergedStat(uint8 stat1, uint8 stat2, uint8 maxVal) internal pure returns (uint8) {
        uint16 merged = (uint16(stat1) + uint16(stat2)) * 6 / 10;
        if (merged > maxVal) return maxVal;
        return uint8(merged);
    }
}
