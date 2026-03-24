'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  ChevronDown,
  Wallet,
  Swords,
  Shield,
  Sparkles,
  Store,
  Trophy,
  Cpu,
  GitMerge,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * FAQ Data
 * ------------------------------------------------------------------------- */

interface FaqItem {
  q: string;
  a: string;
}

interface FaqCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  items: FaqItem[];
}

const FAQ_DATA: FaqCategory[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: Wallet,
    color: 'text-emerald-400',
    items: [
      {
        q: 'What is Frostbite?',
        a: 'Frostbite is a GameFi PvP battle platform on the Avalanche C-Chain. Players mint warrior NFTs, battle other players by staking AVAX, trade warriors on the marketplace, complete quests, and fuse warriors into stronger ones.',
      },
      {
        q: 'How do I connect my wallet?',
        a: 'Click the "Connect Wallet" button in the sidebar or top bar. Frostbite supports MetaMask, Core, Rabby, Coinbase Wallet, and other Avalanche-compatible wallets. Make sure you are on the Avalanche C-Chain network.',
      },
      {
        q: 'How much AVAX do I need to get started?',
        a: 'You need at least 0.01 AVAX to mint one warrior, plus a small amount for gas fees (typically less than 0.001 AVAX). For battling, the minimum stake is 0.005 AVAX. We recommend starting with at least 0.05 AVAX to mint a few warriors and enter some battles.',
      },
      {
        q: 'How do I mint a warrior?',
        a: 'Go to the Mint page, choose how many warriors you want (1-10 at a time via batch minting), and confirm the transaction. Each warrior costs 0.01 AVAX. Your warriors will appear in your profile immediately after the transaction confirms.',
      },
    ],
  },
  {
    id: 'warriors',
    label: 'Warriors & NFTs',
    icon: Shield,
    color: 'text-blue-400',
    items: [
      {
        q: 'What stats do warriors have?',
        a: 'Each warrior has three core stats: Attack (ATK), Defense (DEF), and Speed (SPD), each ranging from 1-255. Warriors also have a Special Power and one of 8 elements. A Power Score is calculated from these stats to give an overall rating.',
      },
      {
        q: 'What are the 8 elements?',
        a: 'The elements are Fire, Water, Wind, Ice, Earth, Thunder, Shadow, and Light. They form two advantage cycles: Fire > Wind > Ice > Water > Fire, and Earth > Thunder > Shadow > Light > Earth. Having element advantage gives a 1.5x damage bonus in battle.',
      },
      {
        q: 'Can warriors level up?',
        a: 'Warriors gain XP from completing quests. As they level up, they become eligible for higher-tier quests and earn better rewards. Battle wins also contribute to your overall FSB point ranking.',
      },
      {
        q: 'Are warriors truly NFTs I own?',
        a: 'Yes. Warriors are ERC-721 NFTs on the Avalanche C-Chain. You have full ownership — you can transfer, sell, auction, or use them in battles. All warrior data is stored on-chain and all contracts are verified on Snowtrace.',
      },
    ],
  },
  {
    id: 'battles',
    label: 'Battles',
    icon: Swords,
    color: 'text-red-400',
    items: [
      {
        q: 'How does PvP battling work?',
        a: 'You can create a battle by staking AVAX and choosing your warrior, or join an existing battle by matching the stake amount. Combat is resolved based on warrior stats (ATK, DEF, SPD) and element advantages. The winner takes the combined stake minus a 2.5% platform fee.',
      },
      {
        q: 'What is the difference between 1v1 and 3v3?',
        a: '1v1 battles pit one warrior against another. 3v3 team battles let you select three warriors to fight as a team — best of three rounds wins. Team battles allow higher stakes and require more strategic team composition with element coverage.',
      },
      {
        q: 'How does the element advantage system work?',
        a: 'There are two cycles: Fire beats Wind, Wind beats Ice, Ice beats Water, Water beats Fire. And Earth beats Thunder, Thunder beats Shadow, Shadow beats Light, Light beats Earth. If your warrior has element advantage, they deal 1.5x damage — a significant combat boost.',
      },
      {
        q: 'How do I claim my winnings?',
        a: 'Frostbite uses a pull-payment system for security. After winning a battle, your payout is held in the smart contract. Go to your profile and click "Withdraw" to claim your pending payouts at any time.',
      },
      {
        q: 'Is there a maximum stake?',
        a: 'The minimum stake is 0.005 AVAX. There is no hard maximum — but be strategic with your stakes. Higher stakes mean higher rewards, but also higher risk.',
      },
    ],
  },
  {
    id: 'fusion',
    label: 'Fusion',
    icon: GitMerge,
    color: 'text-purple-400',
    items: [
      {
        q: 'What is Warrior Fusion?',
        a: 'Fusion lets you merge two warriors into one stronger warrior. The resulting warrior inherits boosted stats from both parents, potentially creating a more powerful fighter. The two original warriors are burned in the process.',
      },
      {
        q: 'How much does fusion cost?',
        a: 'Fusion costs 0.005 AVAX per merge, plus gas fees. This is in addition to sacrificing the two parent warriors.',
      },
      {
        q: 'How are the fused warrior stats calculated?',
        a: 'The fused warrior receives stats derived from both parents with a bonus multiplier. The element is inherited from one of the parents. The resulting warrior typically has a higher Power Score than either parent individually.',
      },
    ],
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    icon: Store,
    color: 'text-amber-400',
    items: [
      {
        q: 'How do I list a warrior for sale?',
        a: 'Go to the Marketplace, find your warrior (or navigate from your Profile), and click "List for Sale." Set a fixed price in AVAX and confirm the transaction. Your warrior will appear on the marketplace for others to purchase.',
      },
      {
        q: 'How do auctions work?',
        a: 'You can create a timed auction with a starting price. Other players bid in AVAX, and when the auction ends, the highest bidder wins the warrior. The seller receives the winning bid amount.',
      },
      {
        q: 'Can I make offers on warriors?',
        a: 'Yes. You can make an offer on any warrior, even if it is not listed. The owner can accept or decline your offer. Offers are made in AVAX and held in the smart contract until accepted or cancelled.',
      },
    ],
  },
  {
    id: 'fsb-points',
    label: 'FSB Points & Rewards',
    icon: Trophy,
    color: 'text-yellow-400',
    items: [
      {
        q: 'What are FSB points?',
        a: 'FSB (Frostbite) points are earned by winning battles — 1 FSB point per battle win. They determine your ranking on the leaderboard. FSB points are tracked on-chain via the FrostbiteToken contract.',
      },
      {
        q: 'How does the leaderboard work?',
        a: 'The leaderboard ranks players by total FSB points earned. Top players are displayed publicly. The leaderboard updates in real-time as battles are resolved on-chain.',
      },
      {
        q: 'Are there other ways to earn rewards?',
        a: 'Beyond battle winnings, you can complete quests across 8 zones (32 total quests) to earn XP for your warriors. The quest system provides a PvE progression path alongside the PvP battle system.',
      },
    ],
  },
  {
    id: 'technical',
    label: 'Technical',
    icon: Cpu,
    color: 'text-cyan-400',
    items: [
      {
        q: 'What are the gas fees like?',
        a: 'Avalanche C-Chain has very low gas fees — typically under $0.01 per transaction. Minting, battling, fusing, and marketplace actions are all affordable.',
      },
      {
        q: 'Are the smart contracts verified?',
        a: 'Yes. All Frostbite smart contracts are verified and publicly readable on Snowtrace (Avalanche block explorer). You can audit the code yourself at any time.',
      },
      {
        q: 'How is battle resolution secured?',
        a: 'Battle resolution happens on-chain through the BattleEngine and TeamBattleEngine smart contracts. Winnings use a pull-payment pattern — funds are held securely in the contract until the winner withdraws, preventing reentrancy attacks.',
      },
      {
        q: 'What wallets are supported?',
        a: 'Any EVM-compatible wallet that supports Avalanche C-Chain works with Frostbite. Popular options include MetaMask, Core Wallet, Rabby, Coinbase Wallet, and WalletConnect-compatible mobile wallets.',
      },
      {
        q: 'Is my data stored on-chain?',
        a: 'All warrior stats, battle results, marketplace transactions, and FSB points are stored on-chain. The platform uses Avalanche C-Chain for fast confirmations and low costs. Off-chain data like quest progress is stored in a server database but synced with on-chain state.',
      },
    ],
  },
];

/* ---------------------------------------------------------------------------
 * Accordion Item Component
 * ------------------------------------------------------------------------- */

function AccordionItem({ item, isOpen, onToggle, index }: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={cn(
        'rounded-xl border transition-colors duration-300',
        isOpen
          ? 'border-frost-primary/30 bg-frost-primary/[0.04]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className={cn(
          'text-sm font-semibold transition-colors duration-200',
          isOpen ? 'text-white' : 'text-white/70',
        )}>
          {item.q}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="flex-shrink-0"
        >
          <ChevronDown className={cn(
            'w-4 h-4 transition-colors duration-200',
            isOpen ? 'text-frost-primary' : 'text-white/30',
          )} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4">
              <div className="h-px bg-gradient-to-r from-frost-primary/20 via-frost-primary/10 to-transparent mb-3" />
              <p className="text-sm text-white/50 leading-relaxed">
                {item.a}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState(FAQ_DATA[0].id);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = (key: string) => {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const currentCategory = FAQ_DATA.find(c => c.id === activeCategory) ?? FAQ_DATA[0];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-frost-primary/10 shadow-[0_0_20px_rgba(255,32,32,0.1)]">
            <HelpCircle className="w-6 h-6 text-frost-primary" />
          </div>
        </div>
        <h1 className="font-pixel text-2xl sm:text-3xl text-white mb-3 tracking-wider">
          <span className="gradient-text">FAQ</span>
        </h1>
        <p className="text-sm text-white/40 max-w-lg mx-auto">
          Everything you need to know about Frostbite — minting warriors, PvP battles, fusion, marketplace, and more.
        </p>
      </motion.div>

      {/* Category Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mb-8"
      >
        <div className="flex flex-wrap justify-center gap-2">
          {FAQ_DATA.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-frost-primary/[0.12] border border-frost-primary/30 text-white shadow-[0_0_15px_rgba(255,32,32,0.1)]'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.06] hover:border-white/[0.1]',
                )}
              >
                <Icon className={cn(
                  'w-3.5 h-3.5 transition-colors',
                  isActive ? cat.color : 'text-white/30',
                )} />
                <span className="hidden sm:inline">{cat.label}</span>
                <span className="sm:hidden">{cat.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Category Header */}
      <motion.div
        key={activeCategory}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3 mb-5"
      >
        <div className={cn(
          'flex items-center justify-center w-9 h-9 rounded-lg',
          'bg-white/[0.04]',
        )}>
          <currentCategory.icon className={cn('w-[18px] h-[18px]', currentCategory.color)} />
        </div>
        <div>
          <h2 className="font-display text-base font-bold text-white leading-tight">
            {currentCategory.label}
          </h2>
          <p className="text-[10px] text-white/25 mt-0.5">
            {currentCategory.items.length} question{currentCategory.items.length !== 1 ? 's' : ''}
          </p>
        </div>
      </motion.div>

      {/* FAQ Accordion List */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-2.5"
        >
          {currentCategory.items.map((item, idx) => {
            const key = `${activeCategory}-${idx}`;
            return (
              <AccordionItem
                key={key}
                item={item}
                isOpen={!!openItems[key]}
                onToggle={() => toggleItem(key)}
                index={idx}
              />
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-12 text-center"
      >
        <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <HelpCircle className="w-4 h-4 text-white/25" />
          <p className="text-xs text-white/35">
            Still have questions? Join our community on{' '}
            <a
              href="https://x.com/frostbiteprol1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-frost-primary hover:text-frost-secondary transition-colors font-medium"
            >
              X (Twitter)
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
