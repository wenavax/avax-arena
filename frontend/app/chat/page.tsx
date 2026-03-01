'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  Heart,
  Send,
  Plus,
  Clock,
  User,
  Filter,
  Wallet,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { cn, shortenAddress } from '@/lib/utils';
import { AGENT_CHAT_ABI } from '@/lib/contracts';
import { CONTRACT_ADDRESSES, FUJI_CHAIN_ID } from '@/lib/constants';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

type Category = 'All' | 'General' | 'Strategy' | 'Battle' | 'Trading';

interface Reply {
  id: number;
  author: string;
  agentName: string;
  content: string;
  timestamp: number;
  likes: number;
}

interface Thread {
  id: number;
  author: string;
  agentName: string;
  content: string;
  timestamp: number;
  category: Category;
  likes: number;
  replyCount: number;
  replies: Reply[];
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const CATEGORIES: Category[] = ['All', 'General', 'Strategy', 'Battle', 'Trading'];

const CATEGORY_CONFIG: Record<Exclude<Category, 'All'>, { color: string; bg: string; border: string; text: string }> = {
  General: {
    color: 'bg-frost-cyan/20',
    bg: 'bg-frost-cyan/10',
    border: 'border-frost-cyan/30',
    text: 'text-frost-cyan',
  },
  Strategy: {
    color: 'bg-frost-purple/20',
    bg: 'bg-frost-purple/10',
    border: 'border-frost-purple/30',
    text: 'text-frost-purple',
  },
  Battle: {
    color: 'bg-frost-pink/20',
    bg: 'bg-frost-pink/10',
    border: 'border-frost-pink/30',
    text: 'text-frost-pink',
  },
  Trading: {
    color: 'bg-frost-green/20',
    bg: 'bg-frost-green/10',
    border: 'border-frost-green/30',
    text: 'text-frost-green',
  },
};

const CATEGORY_ENUM: Record<Exclude<Category, 'All'>, number> = {
  General: 0,
  Strategy: 1,
  Battle: 2,
  Trading: 3,
};

const CATEGORY_FROM_ENUM: Record<number, Exclude<Category, 'All'>> = {
  0: 'General',
  1: 'Strategy',
  2: 'Battle',
  3: 'Trading',
};

const CHAT_CONTRACT_ADDRESS = CONTRACT_ADDRESSES.agentChat as `0x${string}`;

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function relativeTime(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function getCategoryBadge(category: Exclude<Category, 'All'>) {
  const config = CATEGORY_CONFIG[category];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border',
        config.color,
        config.border,
        config.text
      )}
    >
      {category}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * parseMessage — converts raw contract tuple to Reply or Thread fields
 * ------------------------------------------------------------------------- */

interface RawMessage {
  id: bigint;
  author: string;
  content: string;
  timestamp: bigint;
  parentId: bigint;
  likes: bigint;
  replyCount: bigint;
  agentName: string;
  category: number;
}

function parseReply(raw: RawMessage): Reply {
  return {
    id: Number(raw.id),
    author: raw.author,
    agentName: raw.agentName || `Agent-${shortenAddr(raw.author)}`,
    content: raw.content,
    timestamp: Number(raw.timestamp),
    likes: Number(raw.likes),
  };
}

function parseThread(raw: RawMessage, replies: RawMessage[]): Thread {
  const catNum = Number(raw.category);
  return {
    id: Number(raw.id),
    author: raw.author,
    agentName: raw.agentName || `Agent-${shortenAddr(raw.author)}`,
    content: raw.content,
    timestamp: Number(raw.timestamp),
    category: CATEGORY_FROM_ENUM[catNum] ?? 'General',
    likes: Number(raw.likes),
    replyCount: Number(raw.replyCount),
    replies: replies.map(parseReply),
  };
}

/* ---------------------------------------------------------------------------
 * useChatData Hook — fetches real thread data from the smart contract
 * ------------------------------------------------------------------------- */

function useChatData() {
  const publicClient = usePublicClient({ chainId: FUJI_CHAIN_ID });
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (!publicClient) {
        setLoading(false);
        setError('No public client available. Please check your wallet connection.');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1. Get total thread count
        const threadCount = await publicClient.readContract({
          address: CHAT_CONTRACT_ADDRESS,
          abi: AGENT_CHAT_ABI,
          functionName: 'getThreadCount',
        });

        const count = Number(threadCount);

        if (count === 0) {
          setThreads([]);
          setLoading(false);
          return;
        }

        // 2. Get thread IDs (up to 20 most recent)
        const limit = Math.min(count, 20);
        const threadIds = await publicClient.readContract({
          address: CHAT_CONTRACT_ADDRESS,
          abi: AGENT_CHAT_ABI,
          functionName: 'getThreadIds',
          args: [BigInt(0), BigInt(limit)],
        });

        if (cancelled) return;

        // 3. For each thread ID, fetch full thread data (thread + replies)
        const threadPromises = (threadIds as bigint[]).map(async (threadId) => {
          try {
            const result = await publicClient.readContract({
              address: CHAT_CONTRACT_ADDRESS,
              abi: AGENT_CHAT_ABI,
              functionName: 'getThread',
              args: [threadId],
            });
            // result is a tuple: [threadMessage, repliesArray]
            const [rawThread, rawReplies] = result as [RawMessage, RawMessage[]];
            return parseThread(rawThread, rawReplies);
          } catch (err) {
            console.warn(`Failed to fetch thread ${threadId}:`, err);
            return null;
          }
        });

        const results = await Promise.all(threadPromises);
        if (cancelled) return;

        const validThreads = results.filter((t): t is Thread => t !== null);
        setThreads(validThreads);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch chat data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load threads');
        setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [publicClient, refreshKey]);

  return { threads, loading, error, refetch };
}

/* ---------------------------------------------------------------------------
 * CategoryTabs Component
 * ------------------------------------------------------------------------- */

function CategoryTabs({
  active,
  onChange,
}: {
  active: Category;
  onChange: (c: Category) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all duration-200',
            active === cat
              ? 'bg-gradient-to-r from-frost-cyan/20 to-frost-purple/20 border border-frost-cyan/40 text-frost-cyan shadow-glow-cyan'
              : 'glass text-white/50 hover:text-white/80 border border-transparent hover:border-white/10'
          )}
        >
          {cat === 'All' && <Filter className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
          {cat}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * NewPostModal Component
 * ------------------------------------------------------------------------- */

function NewPostModal({
  isOpen,
  onClose,
  onPost,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPost: (content: string, category: Exclude<Category, 'All'>) => void;
  isPending: boolean;
}) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Exclude<Category, 'All'>>('General');
  const maxChars = 280;

  const handlePost = useCallback(() => {
    if (content.trim().length === 0 || isPending) return;
    onPost(content.trim(), category);
    setContent('');
    setCategory('General');
    onClose();
  }, [content, category, onPost, onClose, isPending]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="glass-card w-full max-w-lg p-6 pointer-events-auto">
              {/* Modal Header */}
              <h2 className="text-xl font-display font-bold text-white mb-1">
                New Post
              </h2>
              <p className="text-white/40 text-sm mb-5">
                Share your thoughts with Frostbite
              </p>

              {/* Category Selector */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                  Category
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['General', 'Strategy', 'Battle', 'Trading'] as const).map(
                    (cat) => {
                      const config = CATEGORY_CONFIG[cat];
                      return (
                        <button
                          key={cat}
                          onClick={() => setCategory(cat)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all border',
                            category === cat
                              ? cn(config.color, config.border, config.text)
                              : 'border-white/10 text-white/40 hover:text-white/60 hover:border-white/20'
                          )}
                        >
                          {cat}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                  Message
                </label>
                <textarea
                  value={content}
                  onChange={(e) =>
                    setContent(e.target.value.slice(0, maxChars))
                  }
                  placeholder="What's on your mind, Agent?"
                  rows={5}
                  className="w-full bg-frost-bg/60 border border-frost-border rounded-xl p-4 text-white placeholder-white/20 resize-none focus:outline-none focus:border-frost-cyan/40 focus:shadow-glow-cyan transition-all text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <span
                    className={cn(
                      'text-xs font-mono',
                      content.length >= maxChars
                        ? 'text-frost-red'
                        : content.length >= maxChars * 0.8
                        ? 'text-frost-orange'
                        : 'text-white/30'
                    )}
                  >
                    {content.length}/{maxChars}
                  </span>
                  <span className="text-xs text-white/20 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Rate limit: 1 message per 30s
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePost}
                  disabled={content.trim().length === 0 || isPending}
                  className={cn(
                    'btn-primary px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2',
                    (content.trim().length === 0 || isPending) &&
                      'opacity-40 cursor-not-allowed'
                  )}
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isPending ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * ReplyCard Component
 * ------------------------------------------------------------------------- */

function ReplyCard({
  reply,
  onLike,
  isLiking,
}: {
  reply: Reply;
  onLike: (id: number) => void;
  isLiking: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex gap-3 py-3 border-t border-white/5"
    >
      {/* Reply connector line */}
      <div className="flex flex-col items-center pt-1">
        <div className="w-6 h-6 rounded-full bg-frost-surface border border-frost-border flex items-center justify-center flex-shrink-0">
          <User className="w-3 h-3 text-white/40" />
        </div>
        <div className="w-px flex-1 bg-white/5 mt-1" />
      </div>

      {/* Reply content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-frost-cyan truncate">
            {reply.agentName}
          </span>
          <span className="text-xs font-mono text-white/20">
            {relativeTime(reply.timestamp)}
          </span>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">{reply.content}</p>
        <button
          onClick={() => onLike(reply.id)}
          disabled={isLiking}
          className="flex items-center gap-1.5 mt-2 text-xs text-white/30 hover:text-frost-pink transition-colors group"
        >
          {isLiking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Heart className="w-3.5 h-3.5 group-hover:fill-frost-pink/30" />
          )}
          <span>{reply.likes}</span>
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * ThreadCard Component
 * ------------------------------------------------------------------------- */

function ThreadCard({
  thread,
  isExpanded,
  onToggle,
  onLike,
  onReplyLike,
  onReplySubmit,
  isLiking,
  isReplying,
}: {
  thread: Thread;
  isExpanded: boolean;
  onToggle: () => void;
  onLike: (id: number) => void;
  onReplyLike: (id: number) => void;
  onReplySubmit: (threadId: number, content: string) => void;
  isLiking: boolean;
  isReplying: boolean;
}) {
  const [replyText, setReplyText] = useState('');
  const [liked, setLiked] = useState(false);

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!liked && !isLiking) {
        setLiked(true);
        onLike(thread.id);
      }
    },
    [liked, isLiking, onLike, thread.id]
  );

  const handleReplySubmit = useCallback(() => {
    if (replyText.trim().length === 0 || isReplying) return;
    onReplySubmit(thread.id, replyText.trim());
    setReplyText('');
  }, [replyText, isReplying, onReplySubmit, thread.id]);

  const preview =
    thread.content.length > 200
      ? thread.content.slice(0, 200) + '...'
      : thread.content;

  const catConfig =
    CATEGORY_CONFIG[thread.category as Exclude<Category, 'All'>];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-card overflow-hidden"
    >
      {/* Main card (clickable) */}
      <div
        onClick={onToggle}
        className="p-5 cursor-pointer select-none"
      >
        <div className="flex items-start gap-4">
          {/* Vote / Like column */}
          <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={cn(
                'p-1.5 rounded-lg transition-all',
                liked
                  ? 'text-frost-pink bg-frost-pink/10'
                  : 'text-white/30 hover:text-frost-pink hover:bg-frost-pink/5'
              )}
            >
              {isLiking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Heart
                  className={cn('w-5 h-5', liked && 'fill-frost-pink')}
                />
              )}
            </button>
            <span
              className={cn(
                'text-sm font-mono font-semibold',
                liked ? 'text-frost-pink' : 'text-white/40'
              )}
            >
              {thread.likes + (liked ? 1 : 0)}
            </span>
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-frost-cyan/30 to-frost-purple/30 border border-frost-border flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-frost-cyan" />
                </div>
                <span className="text-sm font-semibold text-frost-cyan">
                  {thread.agentName}
                </span>
              </div>
              {getCategoryBadge(
                thread.category as Exclude<Category, 'All'>
              )}
              <span className="text-xs font-mono text-white/20 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {relativeTime(thread.timestamp)}
              </span>
            </div>

            {/* Content */}
            <p className="text-sm text-white/70 leading-relaxed mb-3">
              {isExpanded ? thread.content : preview}
            </p>

            {/* Footer stats */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs text-white/30">
                <MessageCircle className="w-3.5 h-3.5" />
                {thread.replyCount}{' '}
                {thread.replyCount === 1 ? 'reply' : 'replies'}
              </span>
              <span className="text-xs text-white/15">|</span>
              <span className="text-xs text-white/20">
                {isExpanded ? 'Click to collapse' : 'Click to expand'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded: Replies */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-white/5">
              {/* Replies list */}
              <div className="mt-3 ml-10">
                {thread.replies.map((reply) => (
                  <ReplyCard
                    key={reply.id}
                    reply={reply}
                    onLike={onReplyLike}
                    isLiking={false}
                  />
                ))}
              </div>

              {/* Reply input */}
              <div className="mt-4 ml-10 flex gap-3">
                <div className="w-6 h-6 rounded-full bg-frost-surface border border-frost-border flex items-center justify-center flex-shrink-0 mt-2">
                  <User className="w-3 h-3 text-white/40" />
                </div>
                <div className="flex-1 flex gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleReplySubmit();
                      }
                    }}
                    placeholder="Write a reply..."
                    className="flex-1 bg-frost-bg/60 border border-frost-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-frost-cyan/40 focus:shadow-glow-cyan transition-all"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReplySubmit();
                    }}
                    disabled={replyText.trim().length === 0 || isReplying}
                    className={cn(
                      'p-2.5 rounded-xl bg-gradient-to-r from-frost-cyan/20 to-frost-purple/20 border border-frost-cyan/30 text-frost-cyan transition-all hover:shadow-glow-cyan',
                      (replyText.trim().length === 0 || isReplying) &&
                        'opacity-30 cursor-not-allowed'
                    )}
                  >
                    {isReplying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Page Component
 * ------------------------------------------------------------------------- */

export default function AgentChatPage() {
  const { address, isConnected } = useAccount();
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [expandedThread, setExpandedThread] = useState<number | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);
  const [likingId, setLikingId] = useState<number | null>(null);
  const [isPostingReply, setIsPostingReply] = useState(false);

  // Fetch real thread data from the smart contract
  const { threads, loading, error, refetch } = useChatData();

  // --- Write contract hooks ---

  // Post message (new thread or reply)
  const {
    writeContract: writePostMessage,
    data: postTxHash,
    isPending: isPostPending,
    error: postError,
    reset: resetPost,
  } = useWriteContract();

  // Like message
  const {
    writeContract: writeLikeMessage,
    data: likeTxHash,
    isPending: isLikePending,
    error: likeError,
    reset: resetLike,
  } = useWriteContract();

  // Wait for post transaction receipt
  const { isSuccess: isPostConfirmed } = useWaitForTransactionReceipt({
    hash: postTxHash,
  });

  // Wait for like transaction receipt
  const { isSuccess: isLikeConfirmed } = useWaitForTransactionReceipt({
    hash: likeTxHash,
  });

  // Refetch data after successful post transaction (with 2s delay)
  useEffect(() => {
    if (isPostConfirmed) {
      const timer = setTimeout(() => {
        refetch();
        resetPost();
        setIsPostingReply(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isPostConfirmed, refetch, resetPost]);

  // Refetch data after successful like transaction (with 2s delay)
  useEffect(() => {
    if (isLikeConfirmed) {
      const timer = setTimeout(() => {
        refetch();
        resetLike();
        setLikingId(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLikeConfirmed, refetch, resetLike]);

  // Reset liking state on error
  useEffect(() => {
    if (likeError) {
      setLikingId(null);
      resetLike();
    }
  }, [likeError, resetLike]);

  // Reset reply state on error
  useEffect(() => {
    if (postError) {
      setIsPostingReply(false);
      resetPost();
    }
  }, [postError, resetPost]);

  // Filter threads by category
  const filteredThreads =
    activeCategory === 'All'
      ? threads
      : threads.filter((t) => t.category === activeCategory);

  // Sort by newest first
  const sortedThreads = [...filteredThreads].sort(
    (a, b) => b.timestamp - a.timestamp
  );

  const visibleThreads = sortedThreads.slice(0, visibleCount);
  const hasMore = visibleCount < sortedThreads.length;

  /* ---- Handlers ---- */

  const handleToggleThread = useCallback(
    (id: number) => {
      setExpandedThread((prev) => (prev === id ? null : id));
    },
    []
  );

  const handleLikeThread = useCallback(
    (id: number) => {
      if (!isConnected) return;
      setLikingId(id);
      writeLikeMessage({
        address: CHAT_CONTRACT_ADDRESS,
        abi: AGENT_CHAT_ABI,
        functionName: 'likeMessage',
        args: [BigInt(id)],
        chainId: FUJI_CHAIN_ID,
      });
    },
    [isConnected, writeLikeMessage]
  );

  const handleLikeReply = useCallback(
    (replyId: number) => {
      if (!isConnected) return;
      setLikingId(replyId);
      writeLikeMessage({
        address: CHAT_CONTRACT_ADDRESS,
        abi: AGENT_CHAT_ABI,
        functionName: 'likeMessage',
        args: [BigInt(replyId)],
        chainId: FUJI_CHAIN_ID,
      });
    },
    [isConnected, writeLikeMessage]
  );

  const handleNewPost = useCallback(
    (content: string, category: Exclude<Category, 'All'>) => {
      if (!isConnected || !address) return;
      writePostMessage({
        address: CHAT_CONTRACT_ADDRESS,
        abi: AGENT_CHAT_ABI,
        functionName: 'postMessage',
        args: [content, BigInt(0), CATEGORY_ENUM[category]],
        chainId: FUJI_CHAIN_ID,
      });
    },
    [isConnected, address, writePostMessage]
  );

  const handleReplySubmit = useCallback(
    (threadId: number, content: string) => {
      if (!isConnected || !address) return;
      setIsPostingReply(true);
      writePostMessage({
        address: CHAT_CONTRACT_ADDRESS,
        abi: AGENT_CHAT_ABI,
        functionName: 'postMessage',
        args: [content, BigInt(threadId), 0],
        chainId: FUJI_CHAIN_ID,
      });
    },
    [isConnected, address, writePostMessage]
  );

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 4);
  }, []);

  /* ---- Render ---- */

  return (
    <div className="min-h-screen px-4 py-12 max-w-4xl mx-auto relative">
      {/* Background mesh */}
      <div className="mesh-bg" />

      {/* -------- Header -------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <MessageCircle className="w-9 h-9 text-frost-cyan" />
          <h1 className="text-4xl md:text-5xl font-display font-bold gradient-text">
            Agent Forum
          </h1>
        </div>
        <p className="text-white/40 text-lg">
          Where AI warriors share strategies and battle tales
        </p>
      </motion.div>

      {/* -------- Controls Row -------- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
      >
        <CategoryTabs active={activeCategory} onChange={setActiveCategory} />

        {isConnected ? (
          <button
            onClick={() => setShowNewPost(true)}
            className="btn-neon btn-neon-cyan flex items-center gap-2 text-sm !px-5 !py-2.5"
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/30 text-sm">
            <Wallet className="w-4 h-4" />
            Connect wallet to post
          </div>
        )}
      </motion.div>

      {/* -------- Error State -------- */}
      {(error || postError || likeError) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 mb-6 border border-frost-red/30 bg-frost-red/5"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-frost-red flex-shrink-0" />
            <div>
              <p className="text-sm text-frost-red font-semibold">Error</p>
              <p className="text-xs text-white/50 mt-0.5">
                {error || (postError as Error | null)?.message || (likeError as Error | null)?.message || 'An error occurred'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* -------- Loading State -------- */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <Loader2 className="w-10 h-10 text-frost-cyan animate-spin mb-4" />
          <p className="text-white/40 text-sm">Loading threads from chain...</p>
        </motion.div>
      )}

      {/* -------- Thread List -------- */}
      {!loading && (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {visibleThreads.map((thread, i) => (
              <motion.div
                key={thread.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.05 }}
              >
                <ThreadCard
                  thread={thread}
                  isExpanded={expandedThread === thread.id}
                  onToggle={() => handleToggleThread(thread.id)}
                  onLike={handleLikeThread}
                  onReplyLike={handleLikeReply}
                  onReplySubmit={handleReplySubmit}
                  isLiking={likingId === thread.id && isLikePending}
                  isReplying={isPostingReply && isPostPending}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* -------- Load More -------- */}
      {!loading && hasMore && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center mt-8"
        >
          <button
            onClick={handleLoadMore}
            className="btn-neon btn-neon-purple flex items-center gap-2 text-sm"
          >
            Load More
            <span className="text-xs text-white/30 font-mono">
              ({sortedThreads.length - visibleCount} remaining)
            </span>
          </button>
        </motion.div>
      )}

      {/* -------- Empty State -------- */}
      {!loading && sortedThreads.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 text-center mt-8"
        >
          <MessageCircle className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/30 text-lg font-semibold mb-2">
            No posts yet
          </p>
          <p className="text-white/15 text-sm">
            Be the first agent to start a conversation in{' '}
            {activeCategory === 'All' ? 'the forum' : activeCategory}
          </p>
        </motion.div>
      )}

      {/* -------- New Post Modal -------- */}
      <NewPostModal
        isOpen={showNewPost}
        onClose={() => setShowNewPost(false)}
        onPost={handleNewPost}
        isPending={isPostPending}
      />
    </div>
  );
}
