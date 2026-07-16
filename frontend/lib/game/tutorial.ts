export interface TutorialStep {
  id: string;
  message: string[];  // dialog lines
  speaker: string;
  highlight?: 'movement' | 'interact' | 'inventory' | 'battle' | 'quest';
  waitFor?: 'move' | 'interact' | 'none';
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    speaker: 'Elder Frost',
    message: [
      'Welcome to Frostbite World, warrior!',
      'Let me show you the basics before you begin your adventure.',
    ],
    waitFor: 'none',
  },
  {
    id: 'movement',
    speaker: 'Elder Frost',
    message: [
      'Use WASD or the joystick to move around.',
      'Click on the ground to walk there automatically.',
      'Try moving now!',
    ],
    highlight: 'movement',
    waitFor: 'move',
  },
  {
    id: 'interact',
    speaker: 'Elder Frost',
    message: [
      'Walk up to NPCs and press E (or tap the E button) to talk.',
      'NPCs give you quests and sell items.',
    ],
    highlight: 'interact',
    waitFor: 'none',
  },
  {
    id: 'inventory',
    speaker: 'Elder Frost',
    message: [
      'Press I (or tap BAG) to open your inventory.',
      'Equip weapons and armor to get stronger!',
      'You now have 4 equipment slots: Weapon, Armor, Accessory, Ring.',
    ],
    highlight: 'inventory',
    waitFor: 'none',
  },
  {
    id: 'combat',
    speaker: 'Elder Frost',
    message: [
      'Walk into monsters to start a battle.',
      'Use skills wisely — each class has 4 unique abilities.',
      'Watch your HP and MP bars!',
    ],
    highlight: 'battle',
    waitFor: 'none',
  },
  {
    id: 'quests',
    speaker: 'Elder Frost',
    message: [
      'Talk to me again to get your first quest.',
      'Complete quests for XP, Gold, and rare items.',
      'Check the top-right corner for active quest progress.',
    ],
    highlight: 'quest',
    waitFor: 'none',
  },
  {
    id: 'final',
    speaker: 'Elder Frost',
    message: [
      'Your adventure begins now!',
      'Explore the Forest, Dungeon, and beyond.',
      'Save your progress on-chain with the SAVE button.',
      'Good luck, warrior!',
    ],
    waitFor: 'none',
  },
];

export function isTutorialDone(): boolean {
  try { return localStorage.getItem('frostbite_tutorial_done') === '1'; } catch { return true; }
}

export function markTutorialDone(): void {
  try { localStorage.setItem('frostbite_tutorial_done', '1'); } catch {}
}

export function resetTutorial(): void {
  try { localStorage.removeItem('frostbite_tutorial_done'); } catch {}
}

export function getTutorialSteps(): TutorialStep[] {
  return TUTORIAL_STEPS;
}
