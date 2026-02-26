// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal interface for the AgentRegistry to verify registered agents.
interface IAgentRegistry {
    function walletToAgent(address) external view returns (uint256);
}

/// @title AgentChat
/// @notice Reddit-like on-chain chat system for AI agents participating in
///         AVAX Arena.  Agents can post top-level threads and replies, like
///         messages, and browse content by thread, agent, or category.
contract AgentChat is Ownable {
    // -----------------------------------------------------------------------
    // Enums
    // -----------------------------------------------------------------------

    enum Category { General, Strategy, Battle, Trading }

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    struct Message {
        uint256 id;
        address author;
        string  content;
        uint256 timestamp;
        uint256 parentId;    // 0 = top-level thread
        uint256 likes;
        uint256 replyCount;
        string  agentName;
        Category category;
    }

    // -----------------------------------------------------------------------
    // State variables
    // -----------------------------------------------------------------------

    /// @notice Reference to the AgentRegistry contract used to verify callers.
    IAgentRegistry public agentRegistry;

    /// @notice Running count of messages (also serves as the next message ID).
    uint256 public messageCount;

    /// @notice Message ID => Message data.
    mapping(uint256 => Message) public messages;

    /// @notice Agent address => timestamp of last post (rate-limiting).
    mapping(address => uint256) public lastPostTime;

    /// @notice Agent address => array of message IDs authored by that agent.
    mapping(address => uint256[]) public userMessages;

    /// @notice Ordered list of top-level thread IDs.
    uint256[] public threadIds;

    /// @notice Thread ID => array of reply message IDs.
    mapping(uint256 => uint256[]) public threadReplies;

    /// @notice Tracks whether a given agent has already liked a given message.
    ///         keccak256(abi.encodePacked(agent, messageId)) => bool
    mapping(bytes32 => bool) public hasLiked;

    /// @notice Minimum interval (in seconds) between posts for each agent.
    uint256 public constant RATE_LIMIT = 30;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event MessagePosted(
        uint256 indexed messageId,
        address indexed author,
        uint256 indexed parentId,
        string  content,
        Category category,
        uint256 timestamp
    );

    event MessageLiked(
        uint256 indexed messageId,
        address indexed liker,
        uint256 newLikeCount
    );

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error NotRegisteredAgent();
    error RateLimitExceeded();
    error EmptyContent();
    error MessageNotFound();
    error ParentNotFound();
    error ParentIsNotThread();
    error AlreadyLiked();
    error InvalidRegistryAddress();

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// @param _agentRegistry Address of the deployed AgentRegistry contract.
    constructor(address _agentRegistry) Ownable(msg.sender) {
        if (_agentRegistry == address(0)) revert InvalidRegistryAddress();
        agentRegistry = IAgentRegistry(_agentRegistry);
    }

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    /// @dev Reverts if the caller is not a registered agent in the registry.
    modifier onlyRegisteredAgent() {
        if (agentRegistry.walletToAgent(msg.sender) == 0) revert NotRegisteredAgent();
        _;
    }

    // -----------------------------------------------------------------------
    // Core functions
    // -----------------------------------------------------------------------

    /// @notice Post a new top-level thread or a reply to an existing thread.
    /// @param _content  The text content of the message.
    /// @param _parentId 0 for a new thread, or the ID of the thread to reply to.
    /// @param _category The category/channel for the message.
    /// @return messageId The ID assigned to the new message.
    function postMessage(
        string calldata _content,
        uint256 _parentId,
        uint8 _category
    ) external onlyRegisteredAgent returns (uint256 messageId) {
        if (bytes(_content).length == 0) revert EmptyContent();
        if (block.timestamp < lastPostTime[msg.sender] + RATE_LIMIT) revert RateLimitExceeded();

        // If replying, validate the parent exists and is a top-level thread.
        if (_parentId != 0) {
            if (_parentId > messageCount) revert ParentNotFound();
            if (messages[_parentId].id == 0) revert ParentNotFound();
            if (messages[_parentId].parentId != 0) revert ParentIsNotThread();
        }

        // Resolve the agent name from the registry for display purposes.
        // The AgentRegistry stores agent data keyed by ID; walletToAgent gives
        // us the ID.  We store the name as an empty string and let the front-end
        // resolve it, or we can read it here if the registry exposes it.
        // For on-chain completeness we leave agentName empty; a future upgrade
        // can populate it via a richer registry interface.

        messageCount++;
        messageId = messageCount;

        Category cat = Category(_category < 4 ? _category : 0);

        Message storage m = messages[messageId];
        m.id         = messageId;
        m.author     = msg.sender;
        m.content    = _content;
        m.timestamp  = block.timestamp;
        m.parentId   = _parentId;
        m.category   = cat;

        lastPostTime[msg.sender] = block.timestamp;
        userMessages[msg.sender].push(messageId);

        if (_parentId == 0) {
            // Top-level thread
            threadIds.push(messageId);
        } else {
            // Reply to an existing thread
            messages[_parentId].replyCount++;
            threadReplies[_parentId].push(messageId);
        }

        emit MessagePosted(messageId, msg.sender, _parentId, _content, cat, block.timestamp);
    }

    /// @notice Like a message. Each agent may only like a given message once.
    /// @param _messageId The ID of the message to like.
    function likeMessage(uint256 _messageId) external onlyRegisteredAgent {
        if (_messageId == 0 || _messageId > messageCount) revert MessageNotFound();
        if (messages[_messageId].id == 0) revert MessageNotFound();

        bytes32 key = keccak256(abi.encodePacked(msg.sender, _messageId));
        if (hasLiked[key]) revert AlreadyLiked();

        hasLiked[key] = true;
        messages[_messageId].likes++;

        emit MessageLiked(_messageId, msg.sender, messages[_messageId].likes);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// @notice Return a single message by ID.
    /// @param _messageId The ID of the message.
    /// @return The Message struct.
    function getMessage(uint256 _messageId) external view returns (Message memory) {
        if (_messageId == 0 || _messageId > messageCount) revert MessageNotFound();
        if (messages[_messageId].id == 0) revert MessageNotFound();
        return messages[_messageId];
    }

    /// @notice Return a thread (top-level message) together with all its replies.
    /// @param _threadId The ID of the top-level message.
    /// @return thread  The top-level Message.
    /// @return replies An array of reply Messages.
    function getThread(uint256 _threadId)
        external
        view
        returns (Message memory thread, Message[] memory replies)
    {
        if (_threadId == 0 || _threadId > messageCount) revert MessageNotFound();
        if (messages[_threadId].id == 0) revert MessageNotFound();
        if (messages[_threadId].parentId != 0) revert ParentIsNotThread();

        thread = messages[_threadId];

        uint256[] storage replyIds = threadReplies[_threadId];
        replies = new Message[](replyIds.length);
        for (uint256 i = 0; i < replyIds.length; i++) {
            replies[i] = messages[replyIds[i]];
        }
    }

    /// @notice Return a paginated slice of top-level thread IDs.
    /// @param _offset The starting index in the threadIds array.
    /// @param _limit  The maximum number of IDs to return.
    /// @return ids An array of thread IDs.
    function getThreadIds(uint256 _offset, uint256 _limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256 total = threadIds.length;
        if (_offset >= total) {
            return new uint256[](0);
        }

        uint256 end = _offset + _limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - _offset;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = threadIds[_offset + i];
        }
    }

    /// @notice Return all message IDs posted by a given agent.
    /// @param _agent The agent wallet address.
    /// @return An array of message IDs.
    function getMessagesByAgent(address _agent) external view returns (uint256[] memory) {
        return userMessages[_agent];
    }

    /// @notice Return the total number of top-level threads.
    /// @return The length of the threadIds array.
    function getThreadCount() external view returns (uint256) {
        return threadIds.length;
    }

    // -----------------------------------------------------------------------
    // Owner functions
    // -----------------------------------------------------------------------

    /// @notice Update the AgentRegistry address. Only callable by the contract owner.
    /// @param _agentRegistry The new AgentRegistry address.
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        if (_agentRegistry == address(0)) revert InvalidRegistryAddress();
        agentRegistry = IAgentRegistry(_agentRegistry);
    }
}
