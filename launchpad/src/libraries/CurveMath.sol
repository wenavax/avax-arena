// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title CurveMath
/// @notice Virtual-reserve constant-product bonding curve. K = vAvax0 * y0.
///         AVAX side X = vAvax0 + realAvax; token virtual reserve Ycur = K / X.
///         All divisions floor, which favors the protocol (buyers get no free
///         tokens; sellers never over-withdraw).
library CurveMath {
    /// @notice Tokens out for `avaxIn` (already net of fees) at `realAvax`.
    function tokensOut(uint256 vAvax0, uint256 y0, uint256 realAvax, uint256 avaxIn)
        internal pure returns (uint256)
    {
        uint256 x = vAvax0 + realAvax;
        uint256 yCur = Math.mulDiv(vAvax0, y0, x);
        uint256 yNew = Math.mulDiv(vAvax0, y0, x + avaxIn);
        return yCur - yNew;
    }

    /// @notice Gross AVAX out (before fees) for `tokensIn` at `realAvax`.
    ///         Clamped to `realAvax` so sellers never over-withdraw the real pool.
    function avaxOut(uint256 vAvax0, uint256 y0, uint256 realAvax, uint256 tokensIn)
        internal pure returns (uint256)
    {
        uint256 x = vAvax0 + realAvax;
        uint256 yCur = Math.mulDiv(vAvax0, y0, x);
        uint256 yNew = yCur + tokensIn;
        uint256 xNew = Math.mulDiv(vAvax0, y0, yNew);
        uint256 gross = x - xNew;
        return gross > realAvax ? realAvax : gross;
    }
}
