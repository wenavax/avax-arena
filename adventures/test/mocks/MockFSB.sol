// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test/Fuji stand-in for the live FSB (FrostbiteToken,
///         0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214). Fidelity notes:
///         the real token has NO burn()/burnFrom() and no hooks — this mock
///         deliberately adds neither. Open mint is test-only convenience.
contract MockFSB is ERC20 {
    constructor() ERC20("Frostbite", "FSB") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
