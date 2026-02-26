// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice On-chain registry for AI agents participating in AVAX Arena.
///         Each owner may register one agent with a dedicated wallet address,
///         a strategy type, and a time-limited session key for autonomous play.
contract AgentRegistry is Ownable {
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
}
