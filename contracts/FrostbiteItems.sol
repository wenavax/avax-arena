// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title FrostbiteItems
 * @author Frostbite Team
 * @notice ERC-1155 equipment NFTs for the Frostbite game. Items belong to one of
 *         five categories (Weapon, Armor, Helmet, Shield, Ring), carry an element
 *         matching the hero system, and have rarity-scaled ATK/DEF/SPD stats whose
 *         distribution is weighted by category. Two items of the same category and
 *         rarity can be upgraded (burned) into a single item of the next rarity tier.
 */
contract FrostbiteItems is ERC1155, Ownable, ReentrancyGuard, Pausable {
    using Strings for uint256;
    using Strings for uint8;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Equipment categories
    enum Category {
        Weapon,   // 0
        Armor,    // 1
        Helmet,   // 2
        Shield,   // 3
        Ring      // 4
    }

    /// @notice Elements (mirrors hero element system)
    enum Element {
        Fire,     // 0
        Water,    // 1
        Wind,     // 2
        Ice,      // 3
        Earth,    // 4
        Thunder,  // 5
        Shadow,   // 6
        Light     // 7
    }

    /// @notice Rarity tiers
    enum Rarity {
        Common,     // 0
        Uncommon,   // 1
        Rare,       // 2
        Epic,       // 3
        Legendary   // 4
    }

    /// @notice On-chain item attributes
    struct Item {
        uint8 category;   // 0-4 (Category)
        uint8 element;    // 0-7 (Element)
        uint8 rarity;     // 0-4 (Rarity)
        uint16 atk;
        uint16 def;
        uint16 spd;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Price to mint a single item
    uint256 public constant MINT_PRICE = 0.2 ether;

    /// @notice Maximum items that can be minted in a single transaction
    uint256 public constant MAX_PER_TX = 5;

    /// @notice Maximum supply per category
    uint256 public constant MAX_PER_CATEGORY = 5000;

    /// @notice Total number of categories
    uint256 public constant CATEGORY_COUNT = 5;

    /// @notice Total number of elements
    uint256 public constant ELEMENT_COUNT = 8;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Global token ID counter (starts at 1)
    uint256 public nextTokenId = 1;

    /// @notice Token ID => Item data
    mapping(uint256 => Item) private _items;

    /// @notice Category => minted count
    mapping(uint8 => uint256) public categorySupply;

    /// @notice Incrementing nonce used as extra entropy for pseudo-random generation
    uint256 private _nonce;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new item is minted
    event ItemMinted(
        address indexed owner,
        uint256 indexed tokenId,
        uint8 category,
        uint8 element,
        uint8 rarity,
        uint16 atk,
        uint16 def,
        uint16 spd
    );

    /// @notice Emitted when two items are upgraded (burned) into a new one
    event ItemUpgraded(
        address indexed owner,
        uint256 indexed burnedId1,
        uint256 indexed burnedId2,
        uint256 newTokenId,
        uint8 newRarity
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner Address that receives ownership (withdraw, pause)
     */
    constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

    // -------------------------------------------------------------------------
    // External / Public — Minting
    // -------------------------------------------------------------------------

    /**
     * @notice Mint 1-5 items of the given category and element.
     * @param category Equipment category (0-4)
     * @param element  Element type (0-7)
     * @param quantity Number of items to mint (1-5)
     */
    function mint(
        uint8 category,
        uint8 element,
        uint256 quantity
    ) external payable nonReentrant whenNotPaused {
        require(category < CATEGORY_COUNT, "Invalid category");
        require(element < ELEMENT_COUNT, "Invalid element");
        require(quantity > 0 && quantity <= MAX_PER_TX, "Quantity 1-5");
        require(msg.value == MINT_PRICE * quantity, "Incorrect AVAX sent");
        require(
            categorySupply[category] + quantity <= MAX_PER_CATEGORY,
            "Category supply exceeded"
        );

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId++;
            uint8 rarity = _rollRarity(tokenId);
            (uint16 atk, uint16 def, uint16 spd) = _rollStats(
                tokenId,
                category,
                rarity
            );

            _items[tokenId] = Item({
                category: category,
                element: element,
                rarity: rarity,
                atk: atk,
                def: def,
                spd: spd
            });

            categorySupply[category]++;
            _mint(msg.sender, tokenId, 1, "");

            emit ItemMinted(
                msg.sender,
                tokenId,
                category,
                element,
                rarity,
                atk,
                def,
                spd
            );
        }
    }

    // -------------------------------------------------------------------------
    // External / Public — Upgrade
    // -------------------------------------------------------------------------

    /**
     * @notice Burn two items of the same category and rarity to mint a new item
     *         one rarity tier higher. The new item inherits tokenId1's element.
     * @param tokenId1 First item (element donor)
     * @param tokenId2 Second item
     */
    function upgrade(
        uint256 tokenId1,
        uint256 tokenId2
    ) external nonReentrant whenNotPaused {
        require(tokenId1 != tokenId2, "Same token");
        require(
            balanceOf(msg.sender, tokenId1) >= 1,
            "Not owner of token1"
        );
        require(
            balanceOf(msg.sender, tokenId2) >= 1,
            "Not owner of token2"
        );

        Item memory item1 = _items[tokenId1];
        Item memory item2 = _items[tokenId2];

        require(item1.category == item2.category, "Category mismatch");
        require(item1.rarity == item2.rarity, "Rarity mismatch");
        require(
            item1.rarity < uint8(Rarity.Legendary),
            "Cannot upgrade Legendary"
        );

        // Burn both
        _burn(msg.sender, tokenId1, 1);
        _burn(msg.sender, tokenId2, 1);

        // Mint upgraded item
        uint256 newTokenId = nextTokenId++;
        uint8 newRarity = item1.rarity + 1;
        (uint16 atk, uint16 def, uint16 spd) = _rollStats(
            newTokenId,
            item1.category,
            newRarity
        );

        _items[newTokenId] = Item({
            category: item1.category,
            element: item1.element, // inherits from tokenId1
            rarity: newRarity,
            atk: atk,
            def: def,
            spd: spd
        });

        // Upgrade does not increase category supply (net -1 from burns)
        _mint(msg.sender, newTokenId, 1, "");

        emit ItemUpgraded(
            msg.sender,
            tokenId1,
            tokenId2,
            newTokenId,
            newRarity
        );
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Returns on-chain attributes for a given token.
     * @param tokenId The token to query
     * @return item The Item struct
     */
    function getItem(uint256 tokenId) external view returns (Item memory item) {
        require(tokenId > 0 && tokenId < nextTokenId, "Token does not exist");
        return _items[tokenId];
    }

    /**
     * @notice Returns the number of items minted in a category.
     * @param category Category index (0-4)
     * @return supply Current minted count
     */
    function getCategorySupply(
        uint8 category
    ) external view returns (uint256 supply) {
        require(category < CATEGORY_COUNT, "Invalid category");
        return categorySupply[category];
    }

    /**
     * @notice Returns a fully on-chain JSON metadata URI (data:application/json;base64,...).
     * @param tokenId The token to build metadata for
     */
    function uri(
        uint256 tokenId
    ) public view override returns (string memory) {
        require(tokenId > 0 && tokenId < nextTokenId, "Token does not exist");
        Item memory item = _items[tokenId];

        string memory json = string(
            abi.encodePacked(
                '{"name":"Frostbite Item #',
                tokenId.toString(),
                '","description":"On-chain equipment for Frostbite","attributes":[',
                '{"trait_type":"Category","value":"',
                _categoryName(item.category),
                '"},{"trait_type":"Element","value":"',
                _elementName(item.element),
                '"},{"trait_type":"Rarity","value":"',
                _rarityName(item.rarity),
                '"},{"trait_type":"ATK","display_type":"number","value":',
                uint256(item.atk).toString(),
                '},{"trait_type":"DEF","display_type":"number","value":',
                uint256(item.def).toString(),
                '},{"trait_type":"SPD","display_type":"number","value":',
                uint256(item.spd).toString(),
                "}]}"
            )
        );

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(bytes(json))
                )
            );
    }

    // -------------------------------------------------------------------------
    // Owner Functions
    // -------------------------------------------------------------------------

    /// @notice Withdraw all collected AVAX to the owner address.
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Transfer failed");
    }

    /// @notice Pause minting and upgrades.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause minting and upgrades.
    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // Internal — Randomness Helpers
    // -------------------------------------------------------------------------

    /**
     * @dev Generates a pseudo-random uint256. Not suitable for high-stakes
     *      randomness but acceptable for cosmetic/game attributes.
     */
    function _pseudoRandom(uint256 seed) private returns (uint256) {
        _nonce++;
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        msg.sender,
                        seed,
                        _nonce
                    )
                )
            );
    }

    /**
     * @dev Roll rarity based on the standard distribution:
     *      Common 50%, Uncommon 25%, Rare 15%, Epic 7%, Legendary 3%.
     */
    function _rollRarity(uint256 seed) private returns (uint8) {
        uint256 roll = _pseudoRandom(seed) % 10000;

        if (roll < 5000) return uint8(Rarity.Common);       // 0-4999   (50%)
        if (roll < 7500) return uint8(Rarity.Uncommon);      // 5000-7499 (25%)
        if (roll < 9000) return uint8(Rarity.Rare);          // 7500-8999 (15%)
        if (roll < 9700) return uint8(Rarity.Epic);          // 9000-9699 (7%)
        return uint8(Rarity.Legendary);                      // 9700-9999 (3%)
    }

    /**
     * @dev Roll total stat points for a given rarity, then distribute them
     *      across ATK/DEF/SPD according to the category weights.
     *
     * Stat point ranges per rarity:
     *   Common 1-3, Uncommon 4-6, Rare 7-10, Epic 11-15, Legendary 16-20
     *
     * Category weight tables (out of 100):
     *   Weapon:  ATK 80, DEF 10, SPD 10
     *   Armor:   ATK 10, DEF 80, SPD 10
     *   Helmet:  ATK 10, DEF 50, SPD 40
     *   Shield:  ATK  5, DEF 90, SPD  5
     *   Ring:    ATK 45, DEF 10, SPD 45
     */
    function _rollStats(
        uint256 seed,
        uint8 category,
        uint8 rarity
    ) private returns (uint16 atk, uint16 def, uint16 spd) {
        // Determine total stat points from rarity
        (uint256 minPts, uint256 rangePts) = _statRange(rarity);
        uint256 rand1 = _pseudoRandom(seed + 1);
        uint256 totalPoints = minPts + (rand1 % (rangePts + 1));

        // Category weight lookup: [atkWeight, defWeight, spdWeight] out of 100
        (uint256 wAtk, uint256 wDef, uint256 wSpd) = _categoryWeights(
            category
        );

        // Distribute points proportionally with randomised rounding
        uint256 rand2 = _pseudoRandom(seed + 2);
        uint256 rand3 = _pseudoRandom(seed + 3);

        uint256 rawAtk = (totalPoints * wAtk);
        uint256 rawDef = (totalPoints * wDef);
        uint256 rawSpd = (totalPoints * wSpd);

        // Use stochastic rounding: floor + maybe 1 based on remainder
        uint256 atkVal = rawAtk / 100;
        uint256 defVal = rawDef / 100;
        uint256 spdVal = rawSpd / 100;

        // Distribute remainders randomly to hit totalPoints exactly
        uint256 remainder = totalPoints - atkVal - defVal - spdVal;
        if (remainder > 0) {
            // Weighted random assignment of each leftover point
            uint256 remAtk = rawAtk % 100;
            uint256 remDef = rawDef % 100;
            uint256 remSpd = rawSpd % 100;

            // Sort remainder targets by fractional part, assign greedily
            // Simple approach: assign to the stat with the largest fractional part
            for (uint256 r = 0; r < remainder; r++) {
                uint256 pick = (rand2 + rand3 + r) % (remAtk + remDef + remSpd + 1);
                if (pick < remAtk) {
                    atkVal++;
                    remAtk = 0;
                } else if (pick < remAtk + remDef) {
                    defVal++;
                    remDef = 0;
                } else {
                    spdVal++;
                    remSpd = 0;
                }
            }

            // Final safety: if rounding still doesn't sum correctly, adjust atk
            uint256 sum = atkVal + defVal + spdVal;
            if (sum < totalPoints) {
                atkVal += totalPoints - sum;
            } else if (sum > totalPoints) {
                // Clamp from the heaviest stat
                if (atkVal >= sum - totalPoints) {
                    atkVal -= sum - totalPoints;
                } else {
                    defVal -= sum - totalPoints;
                }
            }
        }

        // Ensure every stat is at least 0 (totalPoints guarantees >= 1 total)
        atk = uint16(atkVal);
        def = uint16(defVal);
        spd = uint16(spdVal);
    }

    /**
     * @dev Returns (min, range) for stat points at a given rarity.
     */
    function _statRange(
        uint8 rarity
    ) private pure returns (uint256 min, uint256 range) {
        if (rarity == uint8(Rarity.Common)) return (1, 2);       // 1-3
        if (rarity == uint8(Rarity.Uncommon)) return (4, 2);     // 4-6
        if (rarity == uint8(Rarity.Rare)) return (7, 3);         // 7-10
        if (rarity == uint8(Rarity.Epic)) return (11, 4);        // 11-15
        return (16, 4);                                           // 16-20
    }

    /**
     * @dev Returns (atkWeight, defWeight, spdWeight) for a category (out of 100).
     */
    function _categoryWeights(
        uint8 category
    ) private pure returns (uint256 wAtk, uint256 wDef, uint256 wSpd) {
        if (category == uint8(Category.Weapon)) return (80, 10, 10);
        if (category == uint8(Category.Armor)) return (10, 80, 10);
        if (category == uint8(Category.Helmet)) return (10, 50, 40);
        if (category == uint8(Category.Shield)) return (5, 90, 5);
        return (45, 10, 45); // Ring
    }

    // -------------------------------------------------------------------------
    // Internal — Metadata Helpers
    // -------------------------------------------------------------------------

    function _categoryName(
        uint8 category
    ) private pure returns (string memory) {
        if (category == 0) return "Weapon";
        if (category == 1) return "Armor";
        if (category == 2) return "Helmet";
        if (category == 3) return "Shield";
        return "Ring";
    }

    function _elementName(
        uint8 element
    ) private pure returns (string memory) {
        if (element == 0) return "Fire";
        if (element == 1) return "Water";
        if (element == 2) return "Wind";
        if (element == 3) return "Ice";
        if (element == 4) return "Earth";
        if (element == 5) return "Thunder";
        if (element == 6) return "Shadow";
        return "Light";
    }

    function _rarityName(
        uint8 rarity
    ) private pure returns (string memory) {
        if (rarity == 0) return "Common";
        if (rarity == 1) return "Uncommon";
        if (rarity == 2) return "Rare";
        if (rarity == 3) return "Epic";
        return "Legendary";
    }
}
