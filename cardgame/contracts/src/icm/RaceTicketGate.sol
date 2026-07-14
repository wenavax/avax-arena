// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ITeleporterMessenger, ITeleporterReceiver, TeleporterMessageInput, TeleporterFeeInfo} from "./ITeleporter.sol";

/// @notice Echo L1 side of the CAR(D) GAME cross-chain ticket PoC. buyTicket()
///         sends the caller's address to the Fuji RaceTicketHub over ICM; the
///         hub posts race results back here. Holds no funds, free to call.
contract RaceTicketGate is ITeleporterReceiver {
    error NotMessenger();
    error BadOrigin();
    error ZeroAddress();

    event TicketSent(address indexed player);
    event ResultReceived(bytes32 indexed matchId);

    uint256 public constant TICKET_GAS_LIMIT = 200_000;

    address public immutable messenger;
    bytes32 public immutable fujiBlockchainID;
    address public immutable hub; // RaceTicketHub on Fuji (deployed first)

    bytes32 public lastMatchId;
    address[4] private lastRanking;
    uint64 public lastPostedAt;

    constructor(address messenger_, bytes32 fujiBlockchainID_, address hub_) {
        if (messenger_ == address(0) || hub_ == address(0)) revert ZeroAddress();
        messenger = messenger_;
        fujiBlockchainID = fujiBlockchainID_;
        hub = hub_;
    }

    /// @notice Buy a cross-chain race ticket: one tx on Echo → ICM → Fuji hub.
    function buyTicket() external {
        ITeleporterMessenger(messenger).sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: fujiBlockchainID,
                destinationAddress: hub,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: TICKET_GAS_LIMIT,
                allowedRelayerAddresses: new address[](0),
                message: abi.encode(msg.sender)
            })
        );
        emit TicketSent(msg.sender);
    }

    /// @inheritdoc ITeleporterReceiver
    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        if (msg.sender != messenger) revert NotMessenger();
        if (sourceBlockchainID != fujiBlockchainID || originSenderAddress != hub) revert BadOrigin();
        (bytes32 matchId, address[4] memory ranking) = abi.decode(message, (bytes32, address[4]));
        lastMatchId = matchId;
        lastRanking = ranking;
        lastPostedAt = uint64(block.timestamp);
        emit ResultReceived(matchId);
    }

    function lastResult() external view returns (bytes32, address[4] memory, uint64) {
        return (lastMatchId, lastRanking, lastPostedAt);
    }
}
