// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Stand-in for Trader Joe V1's router in unit tests: pulls the token,
///         keeps the AVAX, and records the graduation call.
contract MockJoeRouter {
    address public lastTo;
    uint256 public lastAmountToken;
    uint256 public lastAmountAVAX;
    bool public called;

    function factory() external view returns (address) { return address(this); }
    function WAVAX() external pure returns (address) { return address(0xEEEE); }

    function addLiquidityAVAX(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountAVAXMin,
        address to,
        uint256 /*deadline*/
    ) external payable returns (uint256, uint256, uint256) {
        require(msg.value >= amountAVAXMin, "AVAX min");
        require(amountTokenDesired >= amountTokenMin, "token min");
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        called = true;
        lastTo = to;
        lastAmountToken = amountTokenDesired;
        lastAmountAVAX = msg.value;
        return (amountTokenDesired, msg.value, 1e18);
    }
}
