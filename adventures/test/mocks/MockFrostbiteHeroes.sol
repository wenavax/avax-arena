// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Test/Fuji stand-in for the live FrostbiteHeroes
///         (0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523). Mirrors the pieces
///         FrostbiteAdventures consumes: the 10-field Hero struct (same order),
///         getHero() reverting for nonexistent tokens, and addXp() gated by
///         authorized[] with MAX_XP_PER_CALL = 1000.
contract MockFrostbiteHeroes is ERC721, Ownable {
    struct Hero {
        uint8 element;
        uint8 rarity;
        uint16 level;
        uint32 xp;
        uint16 atk;
        uint16 def;
        uint16 spd;
        uint16 baseAtk;
        uint16 baseDef;
        uint16 baseSpd;
    }

    uint32 public constant MAX_XP_PER_CALL = 1000;

    mapping(uint256 => Hero) public heroes;
    mapping(address => bool) public authorized;
    uint256 private _nextId = 1;

    error NotAuthorized();

    constructor() ERC721("Frostbite Heroes", "FBHERO") Ownable(msg.sender) {}

    function mint(address to, uint8 element, uint8 rarity, uint16 level, uint16 atk, uint16 def, uint16 spd)
        external
        returns (uint256 tokenId)
    {
        tokenId = _nextId++;
        heroes[tokenId] = Hero(element, rarity, level, 0, atk, def, spd, atk, def, spd);
        _safeMint(to, tokenId);
    }

    function getHero(uint256 tokenId) external view returns (Hero memory) {
        _requireOwned(tokenId);
        return heroes[tokenId];
    }

    function setAuthorized(address addr, bool status) external onlyOwner {
        authorized[addr] = status;
    }

    function addXp(uint256 tokenId, uint32 amount) external {
        if (!authorized[msg.sender]) revert NotAuthorized();
        require(amount <= MAX_XP_PER_CALL, "xp too large");
        _requireOwned(tokenId);
        heroes[tokenId].xp += amount;
    }

    function setLevel(uint256 tokenId, uint16 level) external {
        heroes[tokenId].level = level;
    }
}
