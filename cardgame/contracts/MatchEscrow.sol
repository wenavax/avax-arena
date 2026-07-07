// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MatchEscrow
 * @notice On-chain escrow & settlement for CAR(D) GAME matches on Avalanche.
 *
 * Design (per the game design document, section 1.3 & 19):
 *   - Blockchain is used ONLY to (1) collect entry fees and (2) distribute rewards.
 *   - All gameplay is off-chain and server-authoritative.
 *   - The trusted game server signs the final ranking; this contract verifies
 *     that signature (EIP-191 personal_sign) before paying out. This keeps the
 *     result trustless-verifiable without putting gameplay on-chain.
 *
 * Flow:
 *   createMatch  -> server opens an escrow for 4 known players
 *   joinMatch    -> each of the 4 players deposits exactly ENTRY_FEE (1 AVAX)
 *   settle       -> anyone submits the server-signed ranking; rewards are paid,
 *                   platform fee is sent to the treasury, match is finalized.
 *   refund       -> if a match never fills / never settles before a deadline,
 *                   deposited players can reclaim their fee.
 *
 * Amounts (18-decimals AVAX): entry 1, pool 4, platform fee 0.2,
 * rewards 2.0 / 1.0 / 0.5 / 0.3  (sum 3.8 + 0.2 fee = 4.0).
 */
contract MatchEscrow {
    // --- Constants (from the design doc, section 19) ---
    uint256 public constant ENTRY_FEE     = 1 ether;      // 1 AVAX
    uint256 public constant PLAYERS       = 4;
    uint256 public constant PLATFORM_FEE  = 0.2 ether;
    // reward table, index 0..3 = position 1..4
    uint256[4] public REWARDS = [uint256(2 ether), 1 ether, 0.5 ether, 0.3 ether];

    address public immutable owner;       // deployer / admin
    address public trustedSigner;         // game server key that signs results
    address public treasury;              // receives platform fee
    uint256 public settleDeadlineWindow;  // seconds allowed before refunds open

    enum Status { NONE, OPEN, LOCKED, SETTLED, REFUNDING }

    struct MatchData {
        Status status;
        uint256 createdAt;
        uint256 deposited;                // total AVAX escrowed
        address[4] players;               // expected players
        mapping(address => bool) isPlayer;
        mapping(address => bool) hasPaid;
        uint256 paidCount;
    }

    mapping(bytes32 => MatchData) private matches;

    event MatchCreated(bytes32 indexed matchId, address[4] players);
    event PlayerJoined(bytes32 indexed matchId, address indexed player, uint256 paidCount);
    event MatchLocked(bytes32 indexed matchId);
    event MatchSettled(bytes32 indexed matchId, address[4] ranking);
    event RewardPaid(bytes32 indexed matchId, address indexed player, uint256 amount, uint8 position);
    event Refunded(bytes32 indexed matchId, address indexed player, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor(address _trustedSigner, address _treasury, uint256 _settleWindow) {
        require(_trustedSigner != address(0) && _treasury != address(0), "zero addr");
        owner = msg.sender;
        trustedSigner = _trustedSigner;
        treasury = _treasury;
        settleDeadlineWindow = _settleWindow; // e.g. 1 hours
    }

    function setTrustedSigner(address s) external onlyOwner { require(s != address(0)); trustedSigner = s; }
    function setTreasury(address t) external onlyOwner { require(t != address(0)); treasury = t; }

    // --- Match lifecycle ---

    function createMatch(bytes32 matchId, address[4] calldata players) external onlyOwner {
        MatchData storage m = matches[matchId];
        require(m.status == Status.NONE, "exists");
        m.status = Status.OPEN;
        m.createdAt = block.timestamp;
        m.players = players;
        for (uint256 i = 0; i < PLAYERS; i++) {
            require(players[i] != address(0), "zero player");
            require(!m.isPlayer[players[i]], "dup player");
            m.isPlayer[players[i]] = true;
        }
        emit MatchCreated(matchId, players);
    }

    function joinMatch(bytes32 matchId) external payable {
        MatchData storage m = matches[matchId];
        require(m.status == Status.OPEN, "not open");
        require(m.isPlayer[msg.sender], "not a listed player");
        require(!m.hasPaid[msg.sender], "already paid");
        require(msg.value == ENTRY_FEE, "wrong entry fee");

        m.hasPaid[msg.sender] = true;
        m.paidCount += 1;
        m.deposited += msg.value;
        emit PlayerJoined(matchId, msg.sender, m.paidCount);

        if (m.paidCount == PLAYERS) {
            m.status = Status.LOCKED;
            emit MatchLocked(matchId);
        }
    }

    /**
     * @notice Settle a locked match using the server-signed final ranking.
     * @param matchId  match identifier
     * @param ranking  positions 1..4 (index 0 = winner)
     * @param signature server signature over keccak256(matchId, ranking, address(this), chainid)
     */
    function settle(bytes32 matchId, address[4] calldata ranking, bytes calldata signature) external {
        MatchData storage m = matches[matchId];
        require(m.status == Status.LOCKED, "not locked");

        // rebuild the signed digest and recover the signer
        bytes32 digest = keccak256(abi.encode(matchId, ranking, address(this), block.chainid));
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        require(_recover(ethSigned, signature) == trustedSigner, "bad signature");

        // ranking must be exactly the 4 escrowed players (permutation)
        for (uint256 i = 0; i < PLAYERS; i++) {
            require(m.isPlayer[ranking[i]], "unknown player");
            for (uint256 j = i + 1; j < PLAYERS; j++) {
                require(ranking[i] != ranking[j], "dup in ranking");
            }
        }

        m.status = Status.SETTLED;

        // pay platform fee then rewards
        _send(treasury, PLATFORM_FEE);
        for (uint256 i = 0; i < PLAYERS; i++) {
            _send(ranking[i], REWARDS[i]);
            emit RewardPaid(matchId, ranking[i], REWARDS[i], uint8(i + 1));
        }
        emit MatchSettled(matchId, ranking);
    }

    /**
     * @notice Reclaim a deposit if the match never settled within the deadline
     *         window, or never filled. Callable by any paid player.
     */
    function refund(bytes32 matchId) external {
        MatchData storage m = matches[matchId];
        require(m.status == Status.OPEN || m.status == Status.LOCKED, "not refundable");
        require(block.timestamp > m.createdAt + settleDeadlineWindow, "too early");
        require(m.hasPaid[msg.sender], "nothing to refund");

        m.status = Status.REFUNDING;
        m.hasPaid[msg.sender] = false;
        _send(msg.sender, ENTRY_FEE);
        emit Refunded(matchId, msg.sender, ENTRY_FEE);
    }

    // Allow remaining players to pull their refund once REFUNDING is set
    function claimRefund(bytes32 matchId) external {
        MatchData storage m = matches[matchId];
        require(m.status == Status.REFUNDING, "not refunding");
        require(m.hasPaid[msg.sender], "nothing to refund");
        m.hasPaid[msg.sender] = false;
        _send(msg.sender, ENTRY_FEE);
        emit Refunded(matchId, msg.sender, ENTRY_FEE);
    }

    // --- Views ---
    function getStatus(bytes32 matchId) external view returns (Status) { return matches[matchId].status; }
    function hasPaid(bytes32 matchId, address p) external view returns (bool) { return matches[matchId].hasPaid[p]; }
    function paidCount(bytes32 matchId) external view returns (uint256) { return matches[matchId].paidCount; }

    // --- Internal ---
    function _send(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "transfer failed");
    }

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig len");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad v");
        return ecrecover(hash, v, r, s);
    }
}
