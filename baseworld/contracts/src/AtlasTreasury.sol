// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title  AtlasTreasury — threshold-triggered USDC forwarder
/// @notice Designed as the `treasury` of `PixelAtlas`. Mint USDC accumulates
///         here until balance ≥ `threshold`, then anyone can call `sweep()`
///         to forward the ENTIRE balance to the immutable `destination`.
///
/// @dev    Immutable destination + threshold = no admin rug. If you ever
///         need to change either, deploy a new treasury and call
///         `PixelAtlas.setTreasury(newTreasury)`.
contract AtlasTreasury {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public immutable destination;
    uint256 public immutable threshold;

    event Swept(address indexed by, uint256 amount);

    error BelowThreshold(uint256 balance, uint256 threshold);
    error ZeroAddress();
    error ZeroThreshold();

    constructor(address _usdc, address _destination, uint256 _threshold) {
        if (_usdc == address(0) || _destination == address(0)) revert ZeroAddress();
        if (_threshold == 0) revert ZeroThreshold();
        usdc = IERC20(_usdc);
        destination = _destination;
        threshold = _threshold;
    }

    /// @notice Forwards entire USDC balance to destination when balance ≥ threshold.
    ///         Permissionless — caller pays gas, contract pays USDC.
    function sweep() external {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal < threshold) revert BelowThreshold(bal, threshold);
        usdc.safeTransfer(destination, bal);
        emit Swept(msg.sender, bal);
    }

    /// @notice Current USDC balance (for UI display).
    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Convenience: is balance enough to trigger sweep?
    function canSweep() external view returns (bool) {
        return usdc.balanceOf(address(this)) >= threshold;
    }
}
