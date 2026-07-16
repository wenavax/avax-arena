// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title FrostbiteHeroes
/// @notice ERC-721 NFT collection with on-chain hero stats, elemental system, and level progression
/// @dev Max supply 5,000. Each hero has an element, rarity, level, XP, and combat stats.
contract FrostbiteHeroes is ERC721, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;
    using Strings for uint8;
    using Strings for uint16;
    using Strings for uint32;

    // ─── Types ───────────────────────────────────────────────────────────

    /// @notice On-chain hero data
    struct Hero {
        uint8 element;    // 0-7
        uint8 rarity;     // 0=Common, 1=Uncommon, 2=Rare, 3=Epic, 4=Legendary
        uint16 level;     // max 69
        uint32 xp;
        uint16 atk;
        uint16 def;
        uint16 spd;
        uint16 baseAtk;
        uint16 baseDef;
        uint16 baseSpd;
    }

    // ─── Constants ───────────────────────────────────────────────────────

    uint256 public constant MAX_SUPPLY = 5_000;
    uint256 public constant MINT_PRICE = 1 ether;
    uint256 public constant MAX_PER_TX = 5;
    uint16 public constant MAX_LEVEL = 69;
    uint32 public constant MAX_XP_PER_CALL = 1000;

    // ─── State ───────────────────────────────────────────────────────────

    uint256 private _totalSupply;

    /// @notice Hero data for each token
    mapping(uint256 => Hero) public heroes;

    /// @notice Addresses authorized to add XP (e.g. game contracts)
    mapping(address => bool) public authorized;

    // ─── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when a new hero is minted
    event HeroMinted(
        uint256 indexed tokenId,
        address indexed owner,
        uint8 element,
        uint8 rarity
    );

    /// @notice Emitted when XP is added to a hero
    event XpAdded(uint256 indexed tokenId, uint32 amount, uint32 newTotal);

    /// @notice Emitted when a hero levels up
    event LevelUp(
        uint256 indexed tokenId,
        uint16 newLevel,
        uint8 statChoice
    );

    /// @notice Emitted when authorization status changes
    event AuthorizationChanged(address indexed addr, bool status);

    // ─── Errors ──────────────────────────────────────────────────────────

    error InvalidElement();
    error InvalidQuantity();
    error InsufficientPayment();
    error MaxSupplyReached();
    error NotAuthorized();
    error NotTokenOwner();
    error MaxLevelReached();
    error InsufficientXp();
    error InvalidStatChoice();
    error WithdrawFailed();

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert NotAuthorized();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor() ERC721("FrostbiteHeroes", "HERO") Ownable(msg.sender) {}

    // ─── External / Public ───────────────────────────────────────────────

    /// @notice Mint 1-5 heroes with a chosen element
    /// @param element Element index (0-7)
    /// @param quantity Number of heroes to mint (1-5)
    function mint(uint8 element, uint256 quantity)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        if (element > 7) revert InvalidElement();
        if (quantity == 0 || quantity > MAX_PER_TX) revert InvalidQuantity();
        if (msg.value != MINT_PRICE * quantity) revert InsufficientPayment();
        if (_totalSupply + quantity > MAX_SUPPLY) revert MaxSupplyReached();

        for (uint256 i = 0; i < quantity; ) {
            uint256 tokenId = _totalSupply + 1;
            _totalSupply = tokenId;

            uint8 rarity = _determineRarity(tokenId);
            Hero memory hero = _buildHero(element, rarity);
            heroes[tokenId] = hero;

            _safeMint(msg.sender, tokenId);

            emit HeroMinted(tokenId, msg.sender, element, rarity);

            unchecked { ++i; }
        }
    }

    /// @notice Add XP to a hero (callable by authorized game contracts)
    /// @param tokenId The hero token ID
    /// @param amount XP to add
    function addXp(uint256 tokenId, uint32 amount) external onlyAuthorized {
        require(amount <= MAX_XP_PER_CALL, "XP exceeds max per call");
        _requireOwned(tokenId);
        heroes[tokenId].xp += amount;
        emit XpAdded(tokenId, amount, heroes[tokenId].xp);
    }

    /// @notice Level up a hero by spending XP
    /// @param tokenId The hero token ID
    /// @param statChoice Which stat to boost: 0=ATK, 1=DEF, 2=SPD
    function levelUp(uint256 tokenId, uint8 statChoice) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (statChoice > 2) revert InvalidStatChoice();

        Hero storage hero = heroes[tokenId];
        if (hero.level >= MAX_LEVEL) revert MaxLevelReached();

        uint32 xpCost = 100 + uint32(hero.level) * 20;
        if (hero.xp < xpCost) revert InsufficientXp();

        hero.xp -= xpCost;
        hero.level += 1;

        if (statChoice == 0) {
            hero.atk += 1;
        } else if (statChoice == 1) {
            hero.def += 1;
        } else {
            hero.spd += 1;
        }

        emit LevelUp(tokenId, hero.level, statChoice);
    }

    /// @notice Get the full hero data for a token
    /// @param tokenId The hero token ID
    /// @return The Hero struct
    function getHero(uint256 tokenId) external view returns (Hero memory) {
        _requireOwned(tokenId);
        return heroes[tokenId];
    }

    /// @notice Returns the total number of minted heroes
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Returns on-chain JSON metadata with base64 encoding
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);
        Hero memory hero = heroes[tokenId];

        string memory json = string.concat(
            '{"name":"Frostbite Hero #',
            tokenId.toString(),
            '","description":"An on-chain Frostbite Hero with elemental powers."',
            ',"attributes":[',
            _buildAttributes(hero),
            "]}"
        );

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        );
    }

    // ─── Owner Functions ─────────────────────────────────────────────────

    /// @notice Grant or revoke authorized status for game contracts
    /// @param addr The address to modify
    /// @param status True to authorize, false to revoke
    function setAuthorized(address addr, bool status) external onlyOwner {
        authorized[addr] = status;
        emit AuthorizationChanged(addr, status);
    }

    /// @notice Withdraw all AVAX to the contract owner
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert WithdrawFailed();
    }

    /// @notice Pause minting
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause minting
    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /// @dev Determine rarity via pseudo-random number from block data
    function _determineRarity(uint256 tokenId) private view returns (uint8) {
        uint256 rand = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    tokenId,
                    msg.sender
                )
            )
        ) % 10_000;

        if (rand < 5500) return 0;      // Common  55%
        if (rand < 8000) return 1;       // Uncommon 25%
        if (rand < 9200) return 2;       // Rare    12%
        if (rand < 9700) return 3;       // Epic     5%
        return 4;                         // Legendary 3%
    }

    /// @dev Build a Hero struct with element base stats + rarity bonus
    function _buildHero(uint8 element, uint8 rarity)
        private
        pure
        returns (Hero memory)
    {
        (uint16 bAtk, uint16 bDef, uint16 bSpd) = _baseStats(element);
        uint16 bonus = _rarityBonus(rarity);

        return Hero({
            element: element,
            rarity: rarity,
            level: 1,
            xp: 0,
            atk: bAtk + bonus,
            def: bDef + bonus,
            spd: bSpd + bonus,
            baseAtk: bAtk,
            baseDef: bDef,
            baseSpd: bSpd
        });
    }

    /// @dev Return base ATK/DEF/SPD for a given element
    function _baseStats(uint8 element)
        private
        pure
        returns (uint16 atk, uint16 def, uint16 spd)
    {
        if (element == 0) return (12, 6, 8);   // Fire
        if (element == 1) return (8, 10, 8);   // Water
        if (element == 2) return (8, 6, 12);   // Wind
        if (element == 3) return (10, 8, 8);   // Ice
        if (element == 4) return (6, 12, 8);   // Earth
        if (element == 5) return (10, 6, 10);  // Thunder
        if (element == 6) return (12, 4, 10);  // Shadow
        return (8, 8, 10);                      // Light
    }

    /// @dev Return the flat bonus applied to all stats for a rarity tier
    function _rarityBonus(uint8 rarity) private pure returns (uint16) {
        if (rarity == 0) return 0;   // Common
        if (rarity == 1) return 2;   // Uncommon
        if (rarity == 2) return 5;   // Rare
        if (rarity == 3) return 10;  // Epic
        return 20;                    // Legendary
    }

    /// @dev Build the JSON attributes array string for tokenURI
    function _buildAttributes(Hero memory hero)
        private
        pure
        returns (string memory)
    {
        string[8] memory elementNames = [
            "Fire", "Water", "Wind", "Ice",
            "Earth", "Thunder", "Shadow", "Light"
        ];
        string[5] memory rarityNames = [
            "Common", "Uncommon", "Rare", "Epic", "Legendary"
        ];

        return string.concat(
            '{"trait_type":"Element","value":"', elementNames[hero.element], '"},',
            '{"trait_type":"Rarity","value":"', rarityNames[hero.rarity], '"},',
            '{"trait_type":"Level","display_type":"number","value":', uint256(hero.level).toString(), '},',
            '{"trait_type":"XP","display_type":"number","value":', uint256(hero.xp).toString(), '},',
            '{"trait_type":"ATK","display_type":"number","value":', uint256(hero.atk).toString(), '},',
            '{"trait_type":"DEF","display_type":"number","value":', uint256(hero.def).toString(), '},',
            '{"trait_type":"SPD","display_type":"number","value":', uint256(hero.spd).toString(), '}'
        );
    }
}
