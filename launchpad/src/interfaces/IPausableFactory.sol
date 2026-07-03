// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The single read a pool needs from its factory: is the platform paused?
interface IPausableFactory {
    function paused() external view returns (bool);
}
