// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArenaWarrior
 * @notice ERC-721 NFT contract for the Avax Arena game. Each warrior has randomized
 *         on-chain attributes, a power score derived from those attributes, and
 *         battle statistics that are updated by an authorized battle contract.
 */
contract ArenaWarrior is ERC721, ERC721Enumerable, Ownable {
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
        uint8 level;         // starts at 1
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

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint256 private _nextTokenId;

    /// @notice Authorized battle contract that may update warrior stats.
    address public battleContract;

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
        uint8 newLevel,
        uint256 newPowerScore
    );

    event WarriorURIUpdated(
        uint256 indexed tokenId,
        string newURI
    );

    event BattleContractUpdated(address indexed newBattleContract);

    event BaseURIUpdated(string newBaseURI);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InsufficientPayment();
    error TokenDoesNotExist();
    error NotAuthorizedBattleContract();
    error WithdrawFailed();
    error InvalidBattleContractAddress();
    error AddressIsNotContract();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyBattleContract() {
        if (msg.sender != battleContract) revert NotAuthorizedBattleContract();
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
    function mint() external payable {
        if (msg.value < MINT_PRICE) revert InsufficientPayment();

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        // Generate pseudo-random seed components
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    msg.sender,
                    tokenId,
                    block.prevrandao
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
    }

    // -------------------------------------------------------------------------
    // Battle & Leveling (authorized battle contract only)
    // -------------------------------------------------------------------------

    /**
     * @notice Record the result of a battle for a warrior. Only callable by the
     *         authorized battle contract.
     * @param tokenId The warrior whose stats are updated.
     * @param won     Whether the warrior won the battle.
     */
    function recordBattle(uint256 tokenId, bool won)
        external
        onlyBattleContract
        tokenExists(tokenId)
    {
        Warrior storage w = _warriors[tokenId];

        if (won) {
            w.battleWins++;
            w.experience += 10;

            // Level up every WINS_PER_LEVEL wins
            if (w.battleWins % WINS_PER_LEVEL == 0) {
                _levelUp(tokenId);
            }
        } else {
            w.battleLosses++;
            w.experience += 3;
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
        if (msg.sender != owner() && msg.sender != battleContract) {
            revert NotAuthorizedBattleContract();
        }

        _tokenURIs[tokenId] = uri;

        emit WarriorURIUpdated(tokenId, uri);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /**
     * @notice Set the authorized battle contract address.
     * @param _battleContract The new battle contract address.
     */
    function setBattleContract(address _battleContract) external onlyOwner {
        if (_battleContract == address(0)) revert InvalidBattleContractAddress();
        uint256 codeSize;
        assembly { codeSize := extcodesize(_battleContract) }
        if (codeSize == 0) revert AddressIsNotContract();
        battleContract = _battleContract;
        emit BattleContractUpdated(_battleContract);
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
}
