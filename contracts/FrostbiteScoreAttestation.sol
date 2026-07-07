// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title FrostbiteScoreAttestation
/// @notice Permissionless self-attestation of an off-chain Frostbite NFT Score.
///         Any wallet records its OWN score on-chain — no owner, no identity, no
///         NFT ownership check, no fee. One tx, msg.sender-keyed. A self-attested
///         score is trust-me by nature; the value is the immutable public record +
///         a shareable tx. `ref` optionally holds a hash of the scoring inputs.
contract FrostbiteScoreAttestation {
    struct Attestation {
        uint256 score;
        uint64 timestamp;
        bytes32 ref;
    }

    mapping(address => Attestation) public attestations;

    event ScoreAttested(address indexed wallet, uint256 score, bytes32 ref, uint64 timestamp);

    /// @notice Record the caller's off-chain NFT Score. No prerequisites.
    function attest(uint256 score, bytes32 ref) external {
        attestations[msg.sender] = Attestation(score, uint64(block.timestamp), ref);
        emit ScoreAttested(msg.sender, score, ref, uint64(block.timestamp));
    }

    /// @notice Latest attested score for a wallet (0 if never attested).
    function scoreOf(address wallet) external view returns (uint256) {
        return attestations[wallet].score;
    }
}
