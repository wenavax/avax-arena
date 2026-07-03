// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract MockJoePair {
    address public token0;
    address public token1;
    address public lastMintTo;
    uint256 public mintCalls;
    function initPair(address a, address b) external { token0 = a; token1 = b; }
    function mint(address to) external returns (uint256) { lastMintTo = to; mintCalls++; return 1e18; }
}
