// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal interface to the deployed FrostbiteHeroes ERC-721
///         (mainnet 0x8b43A80A8EeBC2bf27EAa934B870AF1742f1e523).
///         Struct field order MUST match contracts/FrostbiteHeroes.sol exactly —
///         it is consumed positionally via getHero().
interface IFrostbiteHeroes {
    struct Hero {
        uint8 element;   // 0=Fire 1=Water 2=Wind 3=Ice 4=Earth 5=Thunder 6=Shadow 7=Light
        uint8 rarity;    // 0=Common 1=Uncommon 2=Rare 3=Epic 4=Legendary
        uint16 level;    // max 69 on the live contract
        uint32 xp;
        uint16 atk;
        uint16 def;
        uint16 spd;
        uint16 baseAtk;
        uint16 baseDef;
        uint16 baseSpd;
    }

    function getHero(uint256 tokenId) external view returns (Hero memory);

    function ownerOf(uint256 tokenId) external view returns (address);

    function transferFrom(address from, address to, uint256 tokenId) external;

    /// @dev Gated by FrostbiteHeroes.authorized[msg.sender]. The repo source
    ///      enforces amount <= 1000 (MAX_XP_PER_CALL) but the LIVE deployed
    ///      contract predates that check — do not rely on it reverting.
    function addXp(uint256 tokenId, uint32 amount) external;
}
