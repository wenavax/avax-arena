// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Trader Joe V1 (Uniswap-V2-style) router surface used at graduation.
interface IJoeRouter {
    function factory() external view returns (address);
    function WAVAX() external view returns (address);

    /// @dev Wraps the sent AVAX internally and adds liquidity for (token, WAVAX).
    function addLiquidityAVAX(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountAVAXMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountAVAX, uint256 liquidity);
}
