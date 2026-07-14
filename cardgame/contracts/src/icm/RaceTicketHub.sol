// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ITeleporterMessenger, ITeleporterReceiver, TeleporterMessageInput, TeleporterFeeInfo} from "./ITeleporter.sol";

/// @notice Fuji C-Chain side of the CAR(D) GAME cross-chain ticket PoC.
///         Receives ticket messages from the Echo RaceTicketGate over ICM and
///         keeps the last 32 in a ring buffer for the site's ICM Lab panel;
///         the owner posts race results back to Echo. Holds no funds.
contract RaceTicketHub is ITeleporterReceiver {
    error NotMessenger();
    error NotOwner();
    error BadOrigin();
    error GateAlreadySet();
    error ZeroAddress();

    event CrossChainTicket(address indexed player, uint64 at);
    event ResultPosted(bytes32 indexed matchId);

    uint8 public constant CAPACITY = 32;
    uint256 public constant RESULT_GAS_LIMIT = 200_000;

    address public immutable messenger;
    bytes32 public immutable echoBlockchainID;
    address public owner;
    address public gate; // RaceTicketGate on Echo — set once post-deploy

    address[32] private players;
    uint64[32] private times;
    uint8 private count; // saturates at CAPACITY
    uint8 private head;  // next write slot

    constructor(address messenger_, bytes32 echoBlockchainID_) {
        if (messenger_ == address(0)) revert ZeroAddress();
        messenger = messenger_;
        echoBlockchainID = echoBlockchainID_;
        owner = msg.sender;
    }

    function setGate(address gate_) external {
        if (msg.sender != owner) revert NotOwner();
        if (gate != address(0)) revert GateAlreadySet();
        if (gate_ == address(0)) revert ZeroAddress();
        gate = gate_;
    }

    /// @inheritdoc ITeleporterReceiver
    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        if (msg.sender != messenger) revert NotMessenger();
        if (sourceBlockchainID != echoBlockchainID || originSenderAddress != gate || gate == address(0)) revert BadOrigin();
        address player = abi.decode(message, (address));
        players[head] = player;
        times[head] = uint64(block.timestamp);
        head = uint8((head + 1) % CAPACITY);
        if (count < CAPACITY) count += 1;
        emit CrossChainTicket(player, uint64(block.timestamp));
    }

    /// @notice One call renders the panel: fixed arrays + count + next-write head.
    function getTickets() external view returns (address[32] memory, uint64[32] memory, uint8, uint8) {
        return (players, times, count, head);
    }

    /// @notice Post a settled race's ranking back to the Echo gate over ICM.
    function postResult(bytes32 matchId, address[4] calldata ranking) external {
        if (msg.sender != owner) revert NotOwner();
        ITeleporterMessenger(messenger).sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: echoBlockchainID,
                destinationAddress: gate,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: RESULT_GAS_LIMIT,
                allowedRelayerAddresses: new address[](0),
                message: abi.encode(matchId, ranking)
            })
        );
        emit ResultPosted(matchId);
    }
}
