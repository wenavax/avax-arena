/**
 * Warrior prompt templates for Layer.ai image generation.
 * Each element has a unique visual theme, and stats influence the prompt details.
 */

const ELEMENT_THEMES: Record<number, { name: string; theme: string; palette: string; aura: string }> = {
  0: {
    name: 'Fire',
    theme: 'blazing inferno warrior engulfed in flames, molten armor with glowing cracks, volcanic battlefield',
    palette: 'deep red, orange, molten gold, black charred edges',
    aura: 'swirling fire vortex, embers floating upward, heat distortion',
  },
  1: {
    name: 'Water',
    theme: 'oceanic warrior clad in flowing aqua armor, tidal wave energy, deep sea battlefield',
    palette: 'deep blue, cyan, seafoam white, coral accents',
    aura: 'spiraling water currents, floating bubbles, bioluminescent glow',
  },
  2: {
    name: 'Wind',
    theme: 'swift tempest warrior with aerodynamic armor, wind-carved blades, sky battlefield among clouds',
    palette: 'silver, pale green, white, translucent jade',
    aura: 'visible wind streams, floating leaves, air pressure ripples',
  },
  3: {
    name: 'Ice',
    theme: 'frozen sentinel warrior in crystalline ice armor, frost-forged weapons, arctic tundra battlefield',
    palette: 'ice blue, frost white, pale violet, glacial silver',
    aura: 'snowflakes swirling, ice crystals forming, frozen mist',
  },
  4: {
    name: 'Earth',
    theme: 'mountain titan warrior in stone and mineral armor, seismic power, ancient ruins battlefield',
    palette: 'earth brown, amber gold, moss green, obsidian black',
    aura: 'floating rock debris, ground cracks with inner glow, dust clouds',
  },
  5: {
    name: 'Thunder',
    theme: 'lightning champion warrior in electrified armor, crackling energy weapons, storm-torn battlefield',
    palette: 'electric yellow, deep purple, white lightning, dark storm grey',
    aura: 'arcing electricity, thunderbolts striking, plasma orbs',
  },
  6: {
    name: 'Shadow',
    theme: 'phantom assassin warrior in void-black armor, shadow tendrils, dark dimension battlefield',
    palette: 'deep purple, pitch black, dark crimson, ghostly violet',
    aura: 'shadow tendrils, dark smoke, glowing eyes piercing darkness',
  },
  7: {
    name: 'Light',
    theme: 'celestial paladin warrior in radiant golden armor, divine weapons, heavenly battlefield',
    palette: 'brilliant gold, pure white, warm amber, celestial blue',
    aura: 'holy light rays, floating halos, divine sparkles',
  },
};

function getWeaponDescription(attack: number): string {
  if (attack >= 80) return 'wielding a massive legendary weapon crackling with elemental energy';
  if (attack >= 60) return 'wielding a large enchanted battle weapon';
  if (attack >= 40) return 'holding a sturdy combat weapon';
  return 'carrying a sleek lightweight blade';
}

function getArmorDescription(defense: number): string {
  if (defense >= 80) return 'wearing heavy full-plate legendary armor with intricate engravings';
  if (defense >= 60) return 'wearing reinforced battle armor with shoulder guards';
  if (defense >= 40) return 'wearing medium chainmail and plate armor';
  return 'wearing light agile leather armor';
}

function getSpeedDescription(speed: number): string {
  if (speed >= 80) return 'in a dynamic blur-speed action pose, motion trails visible';
  if (speed >= 60) return 'in an agile combat-ready stance';
  if (speed >= 40) return 'in a balanced battle stance';
  return 'in a powerful grounded stance';
}

function getPowerDescription(specialPower: number): string {
  if (specialPower >= 40) return 'radiating immense elemental energy from entire body, eyes glowing intensely';
  if (specialPower >= 25) return 'channeling visible elemental power, eyes glowing';
  return 'with subtle elemental energy emanating from hands';
}

export function buildWarriorPrompt(warrior: {
  element: number;
  attack: number;
  defense: number;
  speed: number;
  specialPower: number;
  level: number;
  tokenId: number;
}): string {
  const elementTheme = ELEMENT_THEMES[warrior.element] ?? ELEMENT_THEMES[0];

  const weapon = getWeaponDescription(warrior.attack);
  const armor = getArmorDescription(warrior.defense);
  const speed = getSpeedDescription(warrior.speed);
  const power = getPowerDescription(warrior.specialPower);

  const levelDesc = warrior.level >= 5
    ? 'battle-scarred veteran champion'
    : warrior.level >= 3
    ? 'experienced warrior'
    : 'newly forged warrior';

  return [
    `Epic fantasy ${elementTheme.theme}.`,
    `A ${levelDesc} ${weapon}, ${armor}, ${speed}.`,
    `${power}.`,
    `${elementTheme.aura}.`,
    `Color palette: ${elementTheme.palette}.`,
    `16-bit pixel art style retro game character portrait, clean pixel edges, limited color palette, dark dramatic lighting, NFT collectible.`,
    `Pixel art aesthetic like classic SNES/GBA RPG sprites upscaled to HD, no anti-aliasing on character edges, crisp pixels visible.`,
    `No text, no watermarks, no borders, clean dark background with subtle elemental particle effects.`,
  ].join(' ');
}

export function getWarriorName(tokenId: number, element: number): string {
  const elementTheme = ELEMENT_THEMES[element] ?? ELEMENT_THEMES[0];
  return `Frostbite Warrior #${tokenId} - ${elementTheme.name}`;
}

export function getWarriorDescription(warrior: {
  element: number;
  attack: number;
  defense: number;
  speed: number;
  specialPower: number;
  level: number;
  tokenId: number;
}): string {
  const elementTheme = ELEMENT_THEMES[warrior.element] ?? ELEMENT_THEMES[0];
  const powerScore = warrior.attack * 3 + warrior.defense * 2 + warrior.speed * 2 + warrior.specialPower * 5;
  return `A Level ${warrior.level} ${elementTheme.name} warrior from Frostbite. Power Score: ${powerScore}. ATK:${warrior.attack} DEF:${warrior.defense} SPD:${warrior.speed} SP:${warrior.specialPower}.`;
}
