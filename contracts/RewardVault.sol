// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RewardVault
 * @notice Holds AVAX rewards for AVAX Arena players.
 *         The owner (GameEngine / admin) deposits rewards on behalf of players;
 *         players claim their pending balance at any time.
 */
contract RewardVault is Ownable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    //  State
    // -----------------------------------------------------------------------

    /// @notice Address of the ArenaToken (stored for reference / future use).
    address public arenaToken;

    /// @notice Pending AVAX reward balance per player.
    mapping(address => uint256) public pendingRewards;

    /// @notice Total AVAX distributed (claimed) to date.
    uint256 public totalDistributed;

    /// @notice Sum of all pending (unclaimed) rewards across all players.
    uint256 public totalPendingRewards;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event RewardDeposited(address indexed player, uint256 amount);
    event RewardClaimed(address indexed player, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event EmergencyWithdrawWarning(uint256 withdrawnAmount, uint256 remainingBalance, string message);

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _arenaToken Address of the Arena ERC-20 token contract.
     */
    constructor(address _arenaToken) Ownable(msg.sender) {
        require(_arenaToken != address(0), "RewardVault: zero address");
        arenaToken = _arenaToken;
    }

    // -----------------------------------------------------------------------
    //  Receive
    // -----------------------------------------------------------------------

    /**
     * @notice Accept plain AVAX transfers (e.g. fees forwarded by GameEngine).
     */
    receive() external payable {}

    // -----------------------------------------------------------------------
    //  External Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Credit a player with a pending reward.
     *         The contract must already hold enough AVAX to cover all pending
     *         rewards; this function only updates the accounting.
     * @param _player Player address to credit.
     * @param _amount Amount of AVAX (in wei) to credit.
     */
    function depositReward(
        address _player,
        uint256 _amount
    ) external payable onlyOwner {
        require(_player != address(0), "RewardVault: zero address");
        require(_amount > 0, "RewardVault: amount must be > 0");
        require(msg.value == _amount, "RewardVault: msg.value must equal _amount");

        pendingRewards[_player] += _amount;
        totalPendingRewards += _amount;

        emit RewardDeposited(_player, _amount);
    }

    /**
     * @notice Claim all pending AVAX rewards.
     */
    function claimReward() external nonReentrant {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "RewardVault: no pending rewards");
        require(address(this).balance >= amount, "Insufficient vault balance");

        pendingRewards[msg.sender] = 0;
        totalDistributed += amount;
        totalPendingRewards -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "RewardVault: transfer failed");

        emit RewardClaimed(msg.sender, amount);
    }

    /**
     * @notice Emergency withdrawal of AVAX by the owner.
     * @param _amount Amount of AVAX (in wei) to withdraw.
     */
    function withdrawEmergency(uint256 _amount) external onlyOwner {
        require(_amount > 0, "RewardVault: amount must be > 0");
        require(
            address(this).balance >= _amount,
            "RewardVault: insufficient balance"
        );
        require(
            address(this).balance - _amount >= totalPendingRewards,
            "RewardVault: would leave insufficient funds for pending rewards"
        );

        (bool success, ) = payable(owner()).call{value: _amount}("");
        require(success, "RewardVault: transfer failed");

        emit FundsWithdrawn(owner(), _amount);
    }

    // -----------------------------------------------------------------------
    //  View Helpers
    // -----------------------------------------------------------------------

    /**
     * @notice Return the current AVAX balance held by the vault.
     * @return The balance in wei.
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
