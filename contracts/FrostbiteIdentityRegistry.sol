// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IERC6551Registry
 * @notice Minimal interface for the canonical ERC-6551 Registry.
 */
interface IERC6551Registry {
    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}

/**
 * @title IERC721Minimal
 * @notice Minimal ERC-721 interface for ownership checks.
 */
interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title FrostbiteIdentityRegistry
 * @author Frostbite Team
 * @notice ERC-8004 inspired Identity Registry for Frostbite warrior agents.
 *         Each warrior NFT can be registered as an autonomous agent via its
 *         ERC-6551 Token Bound Account. Supports metadata, auto-mode toggling,
 *         and on-chain agent discovery.
 *
 *         Audit fixes applied:
 *         - H-4: tokenId 0 reverse lookup guard in getAgentByAddress
 *         - Fusion safety: deregisterAgent + preFusionCleanup
 *         - nonReentrant on updateMetadata and setAutoMode
 *         - Constructor zero-address checks
 */
contract FrostbiteIdentityRegistry is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct Agent {
        uint256 agentId;
        uint256 tokenId;
        address tbaAddress;
        string metadataURI;
        uint256 registeredAt;
        bool autoMode;
    }

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Canonical ERC-6551 Registry
    IERC6551Registry public immutable erc6551Registry;

    /// @notice FrostbiteAccount implementation address
    address public immutable frostbiteAccountImpl;

    /// @notice ArenaWarrior NFT contract
    IERC721Minimal public immutable arenaWarrior;

    /// @notice Salt used for TBA address computation (default: 0)
    bytes32 public constant TBA_SALT = bytes32(0);

    /// @notice Chain ID used for TBA address computation
    uint256 public immutable tbaChainId;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Auto-incrementing agent counter
    uint256 private _agentCounter;

    /// @notice tokenId => Agent data
    mapping(uint256 => Agent) private _agents;

    /// @notice TBA address => tokenId (reverse lookup)
    mapping(address => uint256) private _tbaToTokenId;

    /// @notice List of tokenIds with autoMode enabled
    uint256[] private _autoModeTokenIds;

    /// @notice tokenId => index in _autoModeTokenIds (+ 1, so 0 means not present)
    mapping(uint256 => uint256) private _autoModeIndex;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AgentRegistered(
        uint256 indexed agentId,
        uint256 indexed tokenId,
        address indexed tbaAddress,
        string metadataURI
    );

    event MetadataUpdated(uint256 indexed tokenId, string newURI);

    event AutoModeToggled(uint256 indexed tokenId, bool enabled);

    event AgentDeregistered(uint256 indexed tokenId);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotWarriorOwner();
    error AlreadyRegistered();
    error NotRegistered();
    error EmptyMetadataURI();
    error ZeroAddress();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param _erc6551Registry Address of the canonical ERC-6551 Registry
     * @param _frostbiteAccountImpl Address of the FrostbiteAccount implementation
     * @param _arenaWarrior Address of the ArenaWarrior NFT contract
     */
    constructor(
        address _erc6551Registry,
        address _frostbiteAccountImpl,
        address _arenaWarrior
    ) Ownable(msg.sender) {
        if (_erc6551Registry == address(0)) revert ZeroAddress();
        if (_frostbiteAccountImpl == address(0)) revert ZeroAddress();
        if (_arenaWarrior == address(0)) revert ZeroAddress();

        erc6551Registry = IERC6551Registry(_erc6551Registry);
        frostbiteAccountImpl = _frostbiteAccountImpl;
        arenaWarrior = IERC721Minimal(_arenaWarrior);
        tbaChainId = block.chainid;
    }

    // -------------------------------------------------------------------------
    // External — Registration
    // -------------------------------------------------------------------------

    /**
     * @notice Register a warrior's TBA as an agent.
     * @param tokenId The ArenaWarrior NFT token ID
     * @param metadataURI URI pointing to agent metadata (IPFS, HTTP, etc.)
     */
    function registerAgent(
        uint256 tokenId,
        string calldata metadataURI
    ) external nonReentrant {
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotWarriorOwner();
        if (_agents[tokenId].registeredAt != 0) revert AlreadyRegistered();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();

        // Compute TBA address deterministically from ERC-6551 Registry
        address tba = erc6551Registry.account(
            frostbiteAccountImpl,
            TBA_SALT,
            tbaChainId,
            address(arenaWarrior),
            tokenId
        );

        uint256 agentId = _agentCounter++;

        _agents[tokenId] = Agent({
            agentId: agentId,
            tokenId: tokenId,
            tbaAddress: tba,
            metadataURI: metadataURI,
            registeredAt: block.timestamp,
            autoMode: false
        });

        _tbaToTokenId[tba] = tokenId;

        emit AgentRegistered(agentId, tokenId, tba, metadataURI);
    }

    /**
     * @notice Update the metadata URI for an agent.
     * @param tokenId The ArenaWarrior NFT token ID
     * @param newURI New metadata URI
     */
    function updateMetadata(
        uint256 tokenId,
        string calldata newURI
    ) external nonReentrant {
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotWarriorOwner();
        if (_agents[tokenId].registeredAt == 0) revert NotRegistered();
        if (bytes(newURI).length == 0) revert EmptyMetadataURI();

        _agents[tokenId].metadataURI = newURI;

        emit MetadataUpdated(tokenId, newURI);
    }

    /**
     * @notice Toggle autonomous battle mode for an agent.
     * @param tokenId The ArenaWarrior NFT token ID
     * @param enabled Whether auto-mode should be enabled
     */
    function setAutoMode(uint256 tokenId, bool enabled) external nonReentrant {
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotWarriorOwner();
        if (_agents[tokenId].registeredAt == 0) revert NotRegistered();

        Agent storage agent = _agents[tokenId];

        if (agent.autoMode == enabled) return; // no-op

        agent.autoMode = enabled;

        if (enabled) {
            // Add to auto-mode list
            _autoModeTokenIds.push(tokenId);
            _autoModeIndex[tokenId] = _autoModeTokenIds.length; // 1-indexed
        } else {
            // Remove from auto-mode list (swap-and-pop)
            _removeFromAutoMode(tokenId);
        }

        emit AutoModeToggled(tokenId, enabled);
    }

    // -------------------------------------------------------------------------
    // Fusion Safety — Deregistration
    // -------------------------------------------------------------------------

    /**
     * @notice Deregister an agent. Callable by the warrior owner.
     * @param tokenId The ArenaWarrior NFT token ID
     */
    function deregisterAgent(uint256 tokenId) external {
        if (arenaWarrior.ownerOf(tokenId) != msg.sender) revert NotWarriorOwner();
        _removeAgent(tokenId);
    }

    /**
     * @notice Pre-fusion cleanup — called before a warrior is burned in merge.
     *         Can be called by the warrior owner or the ArenaWarrior contract itself.
     * @param tokenId The ArenaWarrior NFT token ID about to be burned
     */
    function preFusionCleanup(uint256 tokenId) external {
        // Allow either warrior owner or ArenaWarrior contract to call
        if (msg.sender != address(arenaWarrior) && arenaWarrior.ownerOf(tokenId) != msg.sender)
            revert NotWarriorOwner();
        _removeAgent(tokenId);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Get full agent info for a warrior.
     * @param tokenId The ArenaWarrior NFT token ID
     * @return agent The Agent struct
     */
    function getAgent(uint256 tokenId) external view returns (Agent memory) {
        return _agents[tokenId];
    }

    /**
     * @notice Lookup agent by TBA address.
     * @dev H-4 fix: guards against tokenId 0 false positive in reverse lookup.
     * @param tba The Token Bound Account address
     * @return agent The Agent struct (returns empty struct if not found)
     */
    function getAgentByAddress(address tba) external view returns (Agent memory) {
        uint256 tokenId = _tbaToTokenId[tba];
        // H-4 fix: default mapping value is 0, which could collide with tokenId 0.
        // Check that the agent is actually registered before returning.
        if (_agents[tokenId].registeredAt == 0) {
            return Agent(0, 0, address(0), "", 0, false);
        }
        return _agents[tokenId];
    }

    /**
     * @notice Check if a warrior is registered as an agent.
     * @param tokenId The ArenaWarrior NFT token ID
     * @return registered True if registered
     */
    function isRegistered(uint256 tokenId) external view returns (bool) {
        return _agents[tokenId].registeredAt != 0;
    }

    /**
     * @notice Get total number of registered agents.
     * @return count Total agent count
     */
    function totalAgents() external view returns (uint256) {
        return _agentCounter;
    }

    /**
     * @notice Get all token IDs with auto-mode enabled (for bot system).
     * @return tokenIds Array of token IDs
     */
    function getAutoModeAgents() external view returns (uint256[] memory) {
        return _autoModeTokenIds;
    }

    /**
     * @notice Get the number of auto-mode agents.
     * @return count Number of auto-mode agents
     */
    function getAutoModeAgentCount() external view returns (uint256) {
        return _autoModeTokenIds.length;
    }

    /**
     * @notice Compute the TBA address for a given token ID without registering.
     * @param tokenId The ArenaWarrior NFT token ID
     * @return tba The computed TBA address
     */
    function computeTBA(uint256 tokenId) external view returns (address) {
        return erc6551Registry.account(
            frostbiteAccountImpl,
            TBA_SALT,
            tbaChainId,
            address(arenaWarrior),
            tokenId
        );
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /**
     * @dev Remove an agent from all state (identity, auto-mode, reverse lookup).
     *      Safe to call if agent is not registered (no-op).
     */
    function _removeAgent(uint256 tokenId) internal {
        Agent storage agent = _agents[tokenId];
        if (agent.registeredAt == 0) return; // not registered, nothing to do

        // Remove from auto-mode array if needed
        if (agent.autoMode) {
            _removeFromAutoMode(tokenId);
        }

        // Clear reverse lookup
        delete _tbaToTokenId[agent.tbaAddress];

        // Clear agent data
        delete _agents[tokenId];

        emit AgentDeregistered(tokenId);
    }

    /**
     * @dev Remove a tokenId from the auto-mode array (swap-and-pop).
     */
    function _removeFromAutoMode(uint256 tokenId) internal {
        uint256 idx = _autoModeIndex[tokenId];
        if (idx > 0) {
            uint256 lastIdx = _autoModeTokenIds.length;
            if (idx != lastIdx) {
                uint256 lastTokenId = _autoModeTokenIds[lastIdx - 1];
                _autoModeTokenIds[idx - 1] = lastTokenId;
                _autoModeIndex[lastTokenId] = idx;
            }
            _autoModeTokenIds.pop();
            delete _autoModeIndex[tokenId];
        }
    }
}
