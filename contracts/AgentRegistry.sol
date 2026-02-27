// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentRegistry
/// @notice On-chain registry for AI agents participating in AVAX Arena.
///         Each owner may register one agent with a dedicated wallet address,
///         a strategy type, and a time-limited session key for autonomous play.
contract AgentRegistry is Ownable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    // Enums
    // -----------------------------------------------------------------------

    enum StrategyType { Aggressive, Defensive, Analytical, Random }

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    struct Agent {
        uint256      id;
        address      owner;
        address      agentWallet;
        string       name;
        StrategyType strategy;
        uint256      wins;
        uint256      losses;
        uint256      totalGames;
        uint256      totalTxGenerated;
        uint256      createdAt;
        bool         active;
        uint256      sessionKeyExpiry;
        uint256      dailySpendLimit;     // max AVAX the agent can spend per day (in wei)
        uint256      dailySpent;          // AVAX spent today (in wei)
        uint256      lastSpendReset;      // timestamp of last daily reset
        uint256      maxStakePerGame;     // max single game stake (in wei)
        uint256      totalDeposited;      // total AVAX deposited by owner for this agent
        uint256      profitWithdrawn;     // total profit withdrawn by owner
    }

    // -----------------------------------------------------------------------
    // State variables
    // -----------------------------------------------------------------------

    /// @notice Running count of registered agents (also used as the next ID).
    uint256 public agentCount;

    /// @notice Agent ID => Agent data.
    mapping(uint256 => Agent) public agents;

    /// @notice Owner address => Agent ID (one agent per owner).
    mapping(address => uint256) public ownerToAgent;

    /// @notice Agent wallet address => Agent ID (one agent per wallet).
    mapping(address => uint256) public walletToAgent;

    /// @notice Addresses that are allowed to call `recordGameResult`
    ///         (e.g., the GameEngine contract).
    mapping(address => bool) public authorizedCallers;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        address indexed agentWallet,
        string  name,
        StrategyType strategy
    );

    event StrategyUpdated(
        uint256 indexed agentId,
        StrategyType oldStrategy,
        StrategyType newStrategy
    );

    event SessionKeyGranted(
        uint256 indexed agentId,
        uint256 expiry
    );

    event AgentStatsUpdated(
        uint256 indexed agentId,
        uint256 wins,
        uint256 losses,
        uint256 totalGames
    );

    event AgentFunded(uint256 indexed agentId, uint256 amount);

    event AgentWithdrawn(uint256 indexed agentId, address indexed to, uint256 amount);

    event SpendLimitUpdated(uint256 indexed agentId, uint256 dailyLimit, uint256 maxStakePerGame);

    event EmergencyStop(uint256 indexed agentId);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error OwnerAlreadyRegistered();
    error WalletAlreadyRegistered();
    error EmptyName();
    error AgentNotFound();
    error NotAgentOwner();
    error UnauthorizedCaller();
    error InvalidDuration();
    error DailySpendLimitExceeded();
    error StakeExceedsMaxPerGame();
    error InsufficientAgentBalance();
    error AgentNotActive();
    error TransferFailed();

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------

    /// @notice Register a new AI agent.
    /// @param _agentWallet The wallet address the agent will use on-chain.
    /// @param _name        A human-readable name for the agent.
    /// @param _strategy    The initial strategy type.
    /// @return agentId     The ID assigned to the new agent.
    function registerAgent(
        address _agentWallet,
        string calldata _name,
        StrategyType _strategy
    ) external returns (uint256 agentId) {
        if (_agentWallet == address(0))       revert ZeroAddress();
        if (ownerToAgent[msg.sender] != 0)    revert OwnerAlreadyRegistered();
        if (walletToAgent[_agentWallet] != 0) revert WalletAlreadyRegistered();
        if (bytes(_name).length == 0)         revert EmptyName();

        agentCount++;
        agentId = agentCount;

        Agent storage a  = agents[agentId];
        a.id             = agentId;
        a.owner          = msg.sender;
        a.agentWallet    = _agentWallet;
        a.name           = _name;
        a.strategy       = _strategy;
        a.createdAt      = block.timestamp;
        a.active         = true;

        ownerToAgent[msg.sender]       = agentId;
        walletToAgent[_agentWallet]    = agentId;

        emit AgentRegistered(agentId, msg.sender, _agentWallet, _name, _strategy);
    }

    // -----------------------------------------------------------------------
    // Session key management
    // -----------------------------------------------------------------------

    /// @notice Grant a time-limited session key to the caller's agent.
    /// @param _duration Duration in seconds from now until the key expires.
    function grantSessionKey(uint256 _duration) external {
        if (_duration == 0) revert InvalidDuration();

        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();

        Agent storage a = agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();

        a.sessionKeyExpiry = block.timestamp + _duration;

        emit SessionKeyGranted(agentId, a.sessionKeyExpiry);
    }

    // -----------------------------------------------------------------------
    // Authorisation queries
    // -----------------------------------------------------------------------

    /// @notice Check whether an agent wallet is currently authorised to act
    ///         (i.e., the agent is active and the session key has not expired).
    /// @param _wallet The agent wallet address to check.
    /// @return authorised True if the agent is active and the session key is valid.
    function isAgentAuthorized(address _wallet) external view returns (bool authorised) {
        uint256 agentId = walletToAgent[_wallet];
        if (agentId == 0) return false;

        Agent storage a = agents[agentId];
        return a.active && block.timestamp <= a.sessionKeyExpiry;
    }

    // -----------------------------------------------------------------------
    // Strategy management
    // -----------------------------------------------------------------------

    /// @notice Update the strategy of the caller's registered agent.
    /// @param _strategy The new strategy type.
    function updateStrategy(StrategyType _strategy) external {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();

        Agent storage a = agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();

        StrategyType oldStrategy = a.strategy;
        a.strategy = _strategy;

        emit StrategyUpdated(agentId, oldStrategy, _strategy);
    }

    // -----------------------------------------------------------------------
    // Game result recording (authorised callers only)
    // -----------------------------------------------------------------------

    /// @notice Record the outcome of a game for an agent. Only callable by
    ///         addresses whitelisted via `setAuthorizedCaller`.
    /// @param _agentWallet The wallet of the agent that participated.
    /// @param _won         True if the agent won, false otherwise.
    function recordGameResult(address _agentWallet, bool _won) external {
        if (!authorizedCallers[msg.sender]) revert UnauthorizedCaller();

        uint256 agentId = walletToAgent[_agentWallet];
        if (agentId == 0) revert AgentNotFound();

        Agent storage a = agents[agentId];
        a.totalGames++;
        a.totalTxGenerated++;

        if (_won) {
            a.wins++;
        } else {
            a.losses++;
        }

        emit AgentStatsUpdated(agentId, a.wins, a.losses, a.totalGames);
    }

    // -----------------------------------------------------------------------
    // Owner functions
    // -----------------------------------------------------------------------

    /// @notice Whitelist or remove an address as an authorised caller for
    ///         `recordGameResult`.
    /// @param _caller    The address to authorise or revoke.
    /// @param _authorised True to grant, false to revoke.
    function setAuthorizedCaller(address _caller, bool _authorised) external onlyOwner {
        if (_caller == address(0)) revert ZeroAddress();
        authorizedCallers[_caller] = _authorised;
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// @notice Return the full Agent struct for a given ID.
    function getAgent(uint256 _agentId) external view returns (Agent memory) {
        return agents[_agentId];
    }

    /// @notice Return the full Agent struct for a given wallet address.
    function getAgentByWallet(address _wallet) external view returns (Agent memory) {
        uint256 agentId = walletToAgent[_wallet];
        if (agentId == 0) revert AgentNotFound();
        return agents[agentId];
    }

    /// @notice Return the full Agent struct for the caller's registered agent.
    function getMyAgent() external view returns (Agent memory) {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();
        return agents[agentId];
    }

    // -----------------------------------------------------------------------
    // Agent funding
    // -----------------------------------------------------------------------

    /// @notice Owner deposits AVAX to their agent's balance.
    function fundAgent() external payable {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();
        agents[agentId].totalDeposited += msg.value;
        emit AgentFunded(agentId, msg.value);
    }

    /// @notice Owner withdraws AVAX from agent.
    /// @param _amount The amount of AVAX (in wei) to withdraw.
    function withdrawFromAgent(uint256 _amount) external nonReentrant {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();
        Agent storage a = agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();
        require(address(this).balance >= _amount, "Insufficient balance");

        // Transfer from contract to owner
        a.profitWithdrawn += _amount;
        (bool success,) = msg.sender.call{value: _amount}("");
        if (!success) revert TransferFailed();
        emit AgentWithdrawn(agentId, msg.sender, _amount);
    }

    // -----------------------------------------------------------------------
    // Spending limits
    // -----------------------------------------------------------------------

    /// @notice Owner sets daily spend limit and max stake per game for their agent.
    /// @param _dailyLimit      Maximum AVAX the agent can spend per day (in wei).
    /// @param _maxStakePerGame Maximum single game stake (in wei).
    function setSpendLimits(uint256 _dailyLimit, uint256 _maxStakePerGame) external {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();
        Agent storage a = agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();

        a.dailySpendLimit = _dailyLimit;
        a.maxStakePerGame = _maxStakePerGame;
        emit SpendLimitUpdated(agentId, _dailyLimit, _maxStakePerGame);
    }

    /// @notice Called by GameEngine before each game to enforce spending limits.
    /// @param _wallet The agent wallet address.
    /// @param _amount The amount the agent wants to spend (in wei).
    function checkAndRecordSpend(address _wallet, uint256 _amount) external nonReentrant {
        if (!authorizedCallers[msg.sender]) revert UnauthorizedCaller();

        uint256 agentId = walletToAgent[_wallet];
        if (agentId == 0) revert AgentNotFound();

        Agent storage a = agents[agentId];
        if (!a.active) revert AgentNotActive();
        if (block.timestamp > a.sessionKeyExpiry) revert AgentNotActive();

        // Check max stake per game
        if (a.maxStakePerGame > 0 && _amount > a.maxStakePerGame) revert StakeExceedsMaxPerGame();

        // Reset daily counter if needed (new day = 24h since last reset)
        if (block.timestamp >= a.lastSpendReset + 1 days) {
            a.dailySpent = 0;
            a.lastSpendReset = block.timestamp;
        }

        // Check daily limit
        if (a.dailySpendLimit > 0 && a.dailySpent + _amount > a.dailySpendLimit) revert DailySpendLimitExceeded();

        a.dailySpent += _amount;
    }

    // -----------------------------------------------------------------------
    // Emergency controls
    // -----------------------------------------------------------------------

    /// @notice Owner immediately deactivates their agent.
    function emergencyStop() external {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();
        Agent storage a = agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();

        a.active = false;
        a.sessionKeyExpiry = 0;
        emit EmergencyStop(agentId);
    }

    /// @notice Owner reactivates their agent after an emergency stop.
    function reactivateAgent() external {
        uint256 agentId = ownerToAgent[msg.sender];
        if (agentId == 0) revert AgentNotFound();
        Agent storage a = agents[agentId];
        if (a.owner != msg.sender) revert NotAgentOwner();
        a.active = true;
    }

    // -----------------------------------------------------------------------
    // Balance view
    // -----------------------------------------------------------------------

    /// @notice Return the tracked balance for a given agent.
    /// @dev Agent balance = total deposited - profit withdrawn.
    ///      The actual AVAX sits in the agent wallet, not this contract.
    /// @param _agentId The ID of the agent.
    /// @return The tracked balance in wei.
    function getAgentBalance(uint256 _agentId) external view returns (uint256) {
        Agent storage a = agents[_agentId];
        return a.totalDeposited - a.profitWithdrawn;
    }

    // -----------------------------------------------------------------------
    // Receive AVAX
    // -----------------------------------------------------------------------

    /// @notice Allow the contract to receive AVAX directly.
    receive() external payable {}
}
