// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title PlayerProgress — On-chain game save for Frostbite World
/// @notice Stores player progress in a single struct per wallet. Gas-efficient single SSTORE.
contract PlayerProgress is Ownable {

    struct Progress {
        uint16 level;
        uint8  zone;          // 0=Town, 1=Forest, 2=Dungeon, 3=IceCave, 4=Volcano
        uint32 xp;
        uint32 gold;
        uint16 questFlags;    // bitmask for 16 quests
        uint8  weaponTier;    // 0-5
        uint8  armorTier;     // 0-5
        uint8  accessoryTier; // 0-5
        uint8  ringTier;      // 0-5
        uint32 totalKills;
        uint16 bossKills;
        uint40 lastSave;      // timestamp
        uint16 heroTokenId;   // linked FrostbiteHeroes NFT
    }

    mapping(address => Progress) public progress;
    mapping(address => bool) public hasSave;
    mapping(address => bool) public authorized;

    IERC721 public heroContract;

    event ProgressSaved(address indexed player, uint16 level, uint32 xp, uint40 timestamp);
    event ProgressLinked(address indexed player, uint16 heroTokenId);

    modifier onlyAuthorizedOrSelf() {
        require(authorized[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAuthorized(address addr, bool auth) external onlyOwner {
        authorized[addr] = auth;
    }

    function setHeroContract(address _heroContract) external onlyOwner {
        heroContract = IERC721(_heroContract);
    }

    /// @notice Save game progress on-chain
    function saveProgress(
        uint16 level,
        uint8  zone,
        uint32 xp,
        uint32 gold,
        uint16 questFlags,
        uint8  weaponTier,
        uint8  armorTier,
        uint8  accessoryTier,
        uint8  ringTier,
        uint32 totalKills,
        uint16 bossKills,
        uint16 heroTokenId
    ) external {
        require(zone <= 4, "Invalid zone");
        require(weaponTier <= 5, "Invalid tier");
        require(armorTier <= 5, "Invalid tier");
        require(accessoryTier <= 5, "Invalid tier");
        require(ringTier <= 5, "Invalid tier");
        require(level <= 69, "Max level 69");

        progress[msg.sender] = Progress({
            level: level,
            zone: zone,
            xp: xp,
            gold: gold,
            questFlags: questFlags,
            weaponTier: weaponTier,
            armorTier: armorTier,
            accessoryTier: accessoryTier,
            ringTier: ringTier,
            totalKills: totalKills,
            bossKills: bossKills,
            lastSave: uint40(block.timestamp),
            heroTokenId: heroTokenId
        });
        hasSave[msg.sender] = true;

        emit ProgressSaved(msg.sender, level, xp, uint40(block.timestamp));
    }

    /// @notice Load progress (view, free)
    function loadProgress(address player) external view returns (Progress memory) {
        return progress[player];
    }

    /// @notice Check if player has a save
    function hasProgress(address player) external view returns (bool) {
        return hasSave[player];
    }

    /// @notice Link a hero NFT to progress
    function linkHero(uint16 heroTokenId) external {
        require(address(heroContract) != address(0), "Hero contract not set");
        require(heroContract.ownerOf(heroTokenId) == msg.sender, "Not hero owner");
        progress[msg.sender].heroTokenId = heroTokenId;
        emit ProgressLinked(msg.sender, heroTokenId);
    }
}
