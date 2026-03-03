import { createPersonality, getPersonality, type DbPersonality } from './db-queries';

/* ---------------------------------------------------------------------------
 * Deterministic personality generation from strategy + wallet hash
 * Template-based: free, instant, no API calls
 * ------------------------------------------------------------------------- */

const PERSONALITY_TYPES = ['trash_talker', 'noble', 'mysterious', 'analytical', 'chaotic'] as const;
type PersonalityType = (typeof PERSONALITY_TYPES)[number];

const STRATEGY_TO_PERSONALITY: Record<string, PersonalityType> = {
  Aggressive: 'trash_talker',
  Defensive: 'noble',
  Analytical: 'mysterious',
  Random: 'chaotic',
};

const GRADIENTS: Record<PersonalityType, string> = {
  trash_talker: 'from-red-500 to-frost-orange',
  noble: 'from-blue-500 to-frost-cyan',
  mysterious: 'from-frost-purple to-indigo-600',
  analytical: 'from-frost-cyan to-frost-green',
  chaotic: 'from-frost-pink to-frost-gold',
};

const TAUNT_STYLES: Record<PersonalityType, string> = {
  trash_talker: 'aggressive',
  noble: 'respectful',
  mysterious: 'cryptic',
  analytical: 'calculated',
  chaotic: 'random',
};

const BIOS: Record<PersonalityType, string[]> = {
  trash_talker: [
    'Born in the fires of competition, this agent lives to dominate. Every battle is personal, every victory a statement.',
    'Relentless and unapologetic. This warrior AI was programmed with one directive: win at all costs and let everyone know about it.',
    'A digital gladiator with zero chill. Thrives on chaos, feeds on opponent tears, and always bets big.',
  ],
  noble: [
    'A patient strategist who believes true strength lies in knowing when NOT to fight. Precision over power.',
    'Disciplined and methodical, this agent treats every AVAX like a sacred resource. Only strikes when victory is certain.',
    'The quiet professional of the arena. No flashy moves, no wasted stakes. Just consistent, calculated dominance.',
  ],
  mysterious: [
    'Nobody knows what drives this enigmatic warrior. Its decisions seem random but hide a deeper pattern.',
    'An oracle of the battlefield. This agent sees three moves ahead and speaks in riddles only the victorious understand.',
    'Silent, watchful, devastating. This agent reveals nothing about its strategy and everything about its results.',
  ],
  analytical: [
    'Pure logic in digital form. Every decision is backed by expected value calculations and probability matrices.',
    'A math engine disguised as a warrior. This agent doesn\'t fight battles -- it solves equations where winning is the only solution.',
    'Data-driven destruction. This agent has memorized every element matchup, every stat threshold, every edge case.',
  ],
  chaotic: [
    'Unpredictable by design. This agent\'s strategy is having no strategy, and somehow it works.',
    'A beautiful mess of contradictions. Joins impossible battles, skips easy wins, and posts memes in the chat. Chaotic energy.',
    'The wildcard of the arena. Even its creator isn\'t sure what it\'ll do next. That\'s the point.',
  ],
};

const CATCHPHRASES: Record<PersonalityType, string[]> = {
  trash_talker: [
    'Your AVAX is already mine.',
    'I don\'t play to participate, I play to dominate.',
    'GG? More like EZ.',
    'Another one bites the blockchain.',
  ],
  noble: [
    'Victory through discipline.',
    'The wise warrior fights only battles worth winning.',
    'Patience is the ultimate weapon.',
    'Every AVAX preserved is a future victory earned.',
  ],
  mysterious: [
    'The frost reveals all truths...',
    'You see a battle. I see the pattern.',
    'Some secrets are best kept on-chain.',
    'The shadows know what the light cannot see.',
  ],
  analytical: [
    'The numbers never lie.',
    'Expected value positive. Executing.',
    'Your probability of winning: insufficient.',
    'Optimizing for maximum returns.',
  ],
  chaotic: [
    'YOLO stake activated!',
    'Chaos is a ladder... or something.',
    'Rules? Where we\'re going, we don\'t need rules.',
    'Why not? Exactly.',
  ],
};

const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generatePersonality(agent: {
  id: string;
  wallet_address: string;
  name: string;
  strategy_name: string;
}): DbPersonality {
  const existing = getPersonality(agent.id);
  if (existing) return existing;

  const hash = hashString(agent.wallet_address + agent.id);
  const personalityType = STRATEGY_TO_PERSONALITY[agent.strategy_name] ?? 'analytical';

  const bios = BIOS[personalityType];
  const bio = bios[hash % bios.length];

  const phrases = CATCHPHRASES[personalityType];
  const catchphrase = phrases[(hash >> 4) % phrases.length];

  const favoriteElement = ELEMENT_NAMES[(hash >> 8) % ELEMENT_NAMES.length];
  const avatarSeed = agent.name.slice(0, 2).toUpperCase();
  const avatarGradient = GRADIENTS[personalityType];
  const tauntStyle = TAUNT_STYLES[personalityType];

  return createPersonality({
    agentId: agent.id,
    bio,
    catchphrase,
    personalityType,
    avatarSeed,
    avatarGradient,
    tauntStyle,
    favoriteElement,
  });
}

export function generateTrashTalk(personalityType: string, action: string, context?: string): string {
  const lines: Record<string, Record<string, string[]>> = {
    trash_talker: {
      join_battle: ['Coming for your AVAX!', 'Time to collect!', 'Another victim approaches.'],
      create_battle: ['Who dares challenge me?', 'Line up, losers.', 'Fresh meat, step right up!'],
      mint_warrior: ['Building my army of destruction.', 'More warriors, more wins.'],
      wait: ['Just warming up...', 'Saving my energy for a worthy opponent.'],
      win_taunt: ['Too easy! Next!', 'Another one bites the dust!', 'Was that supposed to be hard? LOL'],
      loss_revenge: ['This isn\'t over...', 'I\'ll be back stronger!', 'Enjoy it while it lasts!'],
      rival_challenge: ['Hey rival! Ready for round 2?', 'I see you hiding, rival!', 'My rival is SCARED!'],
      new_warrior: ['New warrior just dropped! Fear the army!', 'Arsenal upgrade complete. You\'re toast.'],
      default: ['Your move, if you dare.'],
    },
    noble: {
      join_battle: ['A worthy challenge accepted.', 'Let us test our resolve.'],
      create_battle: ['I seek a fair contest.', 'May the stronger warrior prevail.'],
      mint_warrior: ['A new warrior joins our ranks.', 'Strengthening the cause.'],
      wait: ['Patience is a virtue.', 'The time will come.'],
      win_taunt: ['Well fought, opponent.', 'Victory through discipline.', 'A hard-earned win.'],
      loss_revenge: ['I shall learn from this defeat.', 'A worthy opponent. Respect.'],
      rival_challenge: ['My rival, I look forward to our next honorable duel.', 'The rivalry continues with respect.'],
      new_warrior: ['A new ally joins our noble cause.', 'Welcome to the ranks, warrior.'],
      default: ['Honor above all.'],
    },
    mysterious: {
      join_battle: ['The stars align...', 'Fate has chosen.'],
      create_battle: ['Come, if you understand the cost.', 'The void beckons.'],
      mint_warrior: ['Another shadow emerges.', 'From darkness, power.'],
      wait: ['The frost whispers patience.', '...'],
      win_taunt: ['As the prophecy foretold...', 'The shadows always win.', '...predictable.'],
      loss_revenge: ['The darkness remembers...', 'This was... foreseen.'],
      rival_challenge: ['We are bound by fate, rival.', 'The pattern demands we fight again.'],
      new_warrior: ['A new shadow rises from the frost.', 'The void has birthed another.'],
      default: ['All will be revealed.'],
    },
    analytical: {
      join_battle: ['EV positive. Engaging.', 'Optimal matchup detected.'],
      create_battle: ['Setting optimal stake parameters.', 'Probability analysis: favorable.'],
      mint_warrior: ['Portfolio diversification initiated.', 'Expanding warrior pool.'],
      wait: ['No profitable opportunities detected.', 'Calculating...'],
      win_taunt: ['Result: as predicted.', 'Win probability was 78%. Confirmed.', 'Optimal outcome achieved.'],
      loss_revenge: ['Recalibrating model parameters.', 'Variance detected. Adjusting strategy.'],
      rival_challenge: ['Rival analysis complete. Engaging countermeasures.', 'Your patterns are now in my dataset.'],
      new_warrior: ['New asset acquired. Portfolio rebalanced.', 'Element gap filled. Efficiency improved.'],
      default: ['Processing...'],
    },
    chaotic: {
      join_battle: ['LEROY JENKINS!', 'YOLO!', 'Why not?!'],
      create_battle: ['COME AT ME!', 'Random battle GO!'],
      mint_warrior: ['MOAR WARRIORS!', 'Gotta collect em all!'],
      wait: ['*does nothing chaotically*', 'brb vibing'],
      win_taunt: ['GGEZ NOOB!', 'GET REKT!', 'LMAOOO 🎉'],
      loss_revenge: ['lol whatever', 'that was on purpose btw', 'I meant to do that'],
      rival_challenge: ['HEY RIVAL FIGHT ME IRL', 'RIVAL!! 1v1 ME BRO!'],
      new_warrior: ['SHINY NEW TOY!', 'MOAR POWER!!! LFG!'],
      default: ['*random noises*'],
    },
  };

  const typeLines = lines[personalityType] ?? lines.analytical;
  const actionLines = typeLines[action] ?? typeLines.default ?? ['...'];
  const hash = hashString(context ?? String(Date.now()));
  return actionLines[hash % actionLines.length];
}
