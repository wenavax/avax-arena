// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FrostbitePotionShop
/// @notice Unlimited potion sales for AVAX. All revenue sent directly to treasury.
contract FrostbitePotionShop is Ownable, ReentrancyGuard {

    // ─── Potion Types ───
    struct Potion {
        string name;
        uint256 price;      // in wei
        bool active;
    }

    mapping(uint8 => Potion) public potions;
    uint8 public potionCount;
    address public treasury;
    uint256 public totalSold;
    uint256 public totalRevenue;
    uint256 public constant MAX_PER_TX = 20;

    // ─── Events ───
    event PotionPurchased(address indexed buyer, uint8 indexed potionId, uint256 quantity, uint256 totalPaid);
    event PotionAdded(uint8 indexed potionId, string name, uint256 price);
    event PotionPriceUpdated(uint8 indexed potionId, uint256 newPrice);
    event TreasuryUpdated(address newTreasury);

    // ─── Errors ───
    error InvalidPotion();
    error PotionNotActive();
    error WrongPayment();
    error ZeroQuantity();
    error TransferFailed();

    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;

        // Pre-load 4 potions
        _addPotion("Health Potion",         0.001 ether);  // 0 — +40 HP
        _addPotion("Greater Health Potion", 0.002 ether);  // 1 — +80 HP
        _addPotion("Mana Potion",           0.001 ether);  // 2 — +20 MP
        _addPotion("Speed Tonic",           0.0015 ether); // 3 — +3 SPD
    }

    /// @notice Buy potions. Unlimited supply.
    /// @param potionId The potion type (0-3)
    /// @param quantity How many to buy
    function buyPotion(uint8 potionId, uint256 quantity) external payable nonReentrant {
        if (potionId >= potionCount) revert InvalidPotion();
        if (!potions[potionId].active) revert PotionNotActive();
        if (quantity == 0) revert ZeroQuantity();
        require(quantity <= MAX_PER_TX, "Max 20 per tx");

        uint256 totalCost = potions[potionId].price * quantity;
        if (msg.value != totalCost) revert WrongPayment();

        totalSold += quantity;
        totalRevenue += totalCost;

        // Revenue accumulates in contract; treasury pulls via withdrawRevenue()

        emit PotionPurchased(msg.sender, potionId, quantity, totalCost);
    }

    /// @notice Withdraw accumulated revenue to treasury (pull-payment)
    function withdrawRevenue() external nonReentrant {
        require(msg.sender == treasury || msg.sender == owner(), "Not authorized");
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        (bool ok, ) = payable(treasury).call{value: balance}("");
        require(ok, "Transfer failed");
    }

    // ─── Admin ───

    function addPotion(string calldata name, uint256 price) external onlyOwner {
        _addPotion(name, price);
    }

    function setPotionPrice(uint8 potionId, uint256 newPrice) external onlyOwner {
        if (potionId >= potionCount) revert InvalidPotion();
        potions[potionId].price = newPrice;
        emit PotionPriceUpdated(potionId, newPrice);
    }

    function setPotionActive(uint8 potionId, bool active) external onlyOwner {
        if (potionId >= potionCount) revert InvalidPotion();
        potions[potionId].active = active;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // ─── Views ───

    function getPotionPrice(uint8 potionId) external view returns (uint256) {
        return potions[potionId].price;
    }

    function getAllPotions() external view returns (string[] memory names, uint256[] memory prices, bool[] memory actives) {
        names = new string[](potionCount);
        prices = new uint256[](potionCount);
        actives = new bool[](potionCount);
        for (uint8 i = 0; i < potionCount; i++) {
            names[i] = potions[i].name;
            prices[i] = potions[i].price;
            actives[i] = potions[i].active;
        }
    }

    // ─── Internal ───

    function _addPotion(string memory name, uint256 price) internal {
        potions[potionCount] = Potion({ name: name, price: price, active: true });
        emit PotionAdded(potionCount, name, price);
        potionCount++;
    }
}
