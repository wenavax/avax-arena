// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal sponsor contract — tracks per-user sponsored tx count.
/// @dev Full ERC-4337 paymaster integration is out of scope for v1.
///      Coinbase Smart Wallet'in built-in paymaster'ı + bu kontrat'ın
///      sponsorshipFor(user) read'i ile front-end karar verir.
contract Paymaster is Ownable {
    uint256 public constant FREE_TX_LIMIT = 20;
    mapping(address => uint256) public sponsoredTxCount;
    bool public sponsorshipActive = true;

    event TxSponsored(address indexed user, uint256 newCount);
    event SponsorshipToggled(bool active);

    constructor() Ownable(msg.sender) {}

    function recordSponsoredTx(address user) external onlyOwner {
        sponsoredTxCount[user]++;
        emit TxSponsored(user, sponsoredTxCount[user]);
    }

    function canSponsor(address user) external view returns (bool) {
        return sponsorshipActive && sponsoredTxCount[user] < FREE_TX_LIMIT;
    }

    function toggleSponsorship() external onlyOwner {
        sponsorshipActive = !sponsorshipActive;
        emit SponsorshipToggled(sponsorshipActive);
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}
