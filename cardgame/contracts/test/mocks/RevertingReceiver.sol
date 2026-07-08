// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MatchEscrow} from "../../src/MatchEscrow.sol";

/// @notice A contract "player" that reverts on plain AVAX receipt. Proves that
///         pull payments mean such a player can NEVER brick a match's settlement:
///         settle() only credits pendingPayouts; the revert (if any) is isolated
///         to this contract's own withdrawPayout() call.
contract RevertingReceiver {
    MatchEscrow public immutable escrow;
    bool public acceptMoney;

    constructor(MatchEscrow escrow_) {
        escrow = escrow_;
    }

    function setAccept(bool v) external {
        acceptMoney = v;
    }

    function join(bytes32 matchId) external payable {
        escrow.joinMatch{value: msg.value}(matchId);
    }

    function withdraw() external {
        escrow.withdrawPayout();
    }

    function refund(bytes32 matchId) external {
        escrow.refund(matchId);
    }

    receive() external payable {
        require(acceptMoney, "receiver rejects AVAX");
    }
}
