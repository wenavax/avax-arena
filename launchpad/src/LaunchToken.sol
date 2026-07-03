// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20Upgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// @title LaunchToken
/// @notice Fixed-supply ERC20 minted once to its bonding-curve pool. It has NO
///         owner, NO mint after init, NO blacklist, NO fee-on-transfer, and NO
///         transfer pause — so a launch creator cannot rug the token.
contract LaunchToken is ERC20Upgradeable {
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory name_, string memory symbol_, uint256 supply, address holder)
        external
        initializer
    {
        __ERC20_init(name_, symbol_);
        _mint(holder, supply);
    }
}
