// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal Trader Joe V1 (Uniswap-V2-style) router surface used at graduation.
interface IJoeRouter {
    function factory() external view returns (address);
    function WAVAX() external view returns (address);
}

/// @notice Minimal Trader Joe V1 factory surface for get-or-create pair.
interface IJoeFactoryLike {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}

/// @notice Minimal Uniswap-V2-style pair surface for direct LP seeding.
interface IJoePair {
    function mint(address to) external returns (uint256 liquidity);
}

/// @notice Minimal WAVAX (wrapped native) surface.
interface IWAVAX {
    function deposit() external payable;
}
