// ─── Frostbite World Lore System ───
// The Shattered Crown — boss stories that converge into one grand narrative

export interface LoreEntry {
  id: string;
  title: string;
  text: string;
  bossType: string;     // monster type that drops this
  chapter: number;      // 1-4 (story progression)
  order: number;        // order within chapter
}

export interface BossDialogue {
  bossType: string;
  preBattle: string[];  // lines before fight
  deathLine: string;    // final words
  loreReveal: string;   // what player learns
}

// ─── Boss Dialogues ───
// Each boss has pre-battle taunts and a death line that hints at the grand story

export const BOSS_DIALOGUES: Record<string, BossDialogue> = {

  // ═══ Chapter 1: The Awakening (Lv 1-15) ═══

  boss_frost: {
    bossType: 'boss_frost',
    preBattle: [
      'You dare enter my domain, mortal?',
      'I was here long before your kind walked these lands.',
      'The ice remembers... even if I have forgotten why I guard this place.',
    ],
    deathLine: 'The shard... it burns even in death. Take it... before it consumes you too...',
    loreReveal: 'The Frost Dragon guarded a glowing shard of an ancient crown. It seemed to pulse with a life of its own.',
  },

  shadow_lord: {
    bossType: 'shadow_lord',
    preBattle: [
      'Shadows whisper your name, intruder.',
      'I was once a guardian of light... can you believe that?',
      'The darkness came from the shard. It changed everything.',
    ],
    deathLine: 'Free at last... warn the others... the Crown must never be whole again...',
    loreReveal: 'The Shadow Lord was once a Guardian of Light, corrupted by a fragment of the Crown of Eternity.',
  },

  swamp_hag: {
    bossType: 'swamp_hag',
    preBattle: [
      'The swamp knows your fears, child.',
      'I tried to hide the shard in these waters... but it poisoned everything.',
      'Nature itself recoils from the Crown\'s touch.',
    ],
    deathLine: 'The rot... it was never the swamp. It was the shard all along...',
    loreReveal: 'The Swamp Hag was a nature spirit who tried to contain a Crown Fragment. The shard corrupted the entire swamp.',
  },

  // ═══ Chapter 2: The Discovery (Lv 15-30) ═══

  crystal_colossus: {
    bossType: 'crystal_colossus',
    preBattle: [
      'I am the mountain. I am the earth. I do not yield.',
      'The crystals grew from the shard I swallowed to keep it hidden.',
      'Seven guardians were chosen. Seven fragments were scattered. I am the Third.',
    ],
    deathLine: 'Three fragments found... four remain. Seek the sky, the depths, the dead, and the cold...',
    loreReveal: 'The Crystal Colossus reveals there were SEVEN guardians, each hiding a fragment of the Crown of Eternity.',
  },

  storm_titan: {
    bossType: 'storm_titan',
    preBattle: [
      'The storms obey no mortal. They obey the Crown.',
      'I am the Fourth Guardian. The winds carried my fragment to the sky.',
      'Do you seek to gather them all? That path leads to ruin.',
    ],
    deathLine: 'Four shards... the Crown stirs. It can feel itself becoming whole. Beware the Abyss...',
    loreReveal: 'The Storm Titan warns that the Crown of Eternity is sentient — it WANTS to be reassembled.',
  },

  abyssal_leviathan: {
    bossType: 'abyssal_leviathan',
    preBattle: [
      'The deep remembers the old king. He sleeps below.',
      'I am the Fifth, keeper of the drowned fragment.',
      'The waters tried to dissolve the shard. Instead, the shard poisoned the sea.',
    ],
    deathLine: 'Five fragments... He stirs in the Abyss. The Primordial King dreams of his Crown...',
    loreReveal: 'The Leviathan reveals the Primordial King is imprisoned in the Eternal Abyss, still alive, dreaming.',
  },

  lich_king: {
    bossType: 'lich_king',
    preBattle: [
      'Death cannot hold what the Crown has touched.',
      'I am the Sixth Guardian. I chose undeath to guard my fragment forever.',
      'But forever is a long time... and the shard whispers such sweet promises.',
    ],
    deathLine: 'Six fragments... only the forge-keeper remains. But know this — the King has allies among the living...',
    loreReveal: 'The Lich King reveals that someone among the living is secretly working to free the Primordial King.',
  },

  crystal_wyrm: {
    bossType: 'crystal_wyrm',
    preBattle: [
      'Ice preserves all things. Even secrets.',
      'The Crown\'s power flows through these caves.',
      'You collect the fragments, but do you understand what you carry?',
    ],
    deathLine: 'The ice remembers the old world... before the Crown broke everything...',
    loreReveal: 'The Crystal Wyrm\'s ice contains visions of the world before the Crown — a paradise that was destroyed by the King\'s greed.',
  },

  // ═══ Chapter 3: The Truth (Lv 30-45) ═══

  frost_emperor: {
    bossType: 'frost_emperor',
    preBattle: [
      'You carry fragments of the Crown. I can feel them.',
      'The cold was my gift. Now it is my prison.',
      'The Primordial King was not always evil. The Crown made him so.',
    ],
    deathLine: 'The Crown corrupts all who touch it. Even you. Destroy it before it destroys you...',
    loreReveal: 'The Frost Emperor reveals the Crown doesn\'t just grant power — it slowly replaces the wearer\'s will with its own.',
  },

  demon_lord: {
    bossType: 'demon_lord',
    preBattle: [
      'HAHAHA! Another fragment-hunter!',
      'The Primordial King promised me a kingdom if I freed him.',
      'But I am no fool. I keep my fragment, and I keep my power.',
    ],
    deathLine: 'The Gate... it was never meant to keep demons IN. It was built to keep HIM out...',
    loreReveal: 'The Demon\'s Gate was built by the original Seven Guardians as a barrier against the Primordial King\'s influence.',
  },

  ancient_guardian: {
    bossType: 'ancient_guardian',
    preBattle: [
      'These ruins are older than memory itself.',
      'I have stood guard for ten thousand years.',
      'The answer you seek is carved in these walls: the Crown cannot be destroyed by force alone.',
    ],
    deathLine: 'The Forge... seek the Titan\'s Forge. Only there can the Crown be unmade...',
    loreReveal: 'The Ancient Guardian reveals the Crown can only be destroyed at the Titan\'s Forge where it was originally created.',
  },

  infernal_dragon: {
    bossType: 'infernal_dragon',
    preBattle: [
      'The fires of this mountain remember the forging of the Crown.',
      'Seven fragments of absolute power. You carry most of them now.',
      'Can you feel it pulling you toward the Abyss? That is the King calling.',
    ],
    deathLine: 'The Dragon King in the Sanctum... he is not what he seems. He serves the Crown...',
    loreReveal: 'The Infernal Dragon warns that the Ancient Dragon King in the Sanctum has been fully corrupted by the Crown.',
  },

  void_sovereign: {
    bossType: 'void_sovereign',
    preBattle: [
      'The Void is where reality ends and the Crown\'s true power begins.',
      'I am not a guardian. I am what the Crown creates when left unchecked.',
      'The Primordial King did not find the Crown. The Crown found HIM.',
    ],
    deathLine: 'The Crown is not a weapon. It is a living entity. It has been using all of you...',
    loreReveal: 'The Void Sovereign reveals the ultimate truth: the Crown of Eternity is a sentient parasite that created the Primordial King, not the other way around.',
  },

  // ═══ Chapter 4: The Final Truth (Lv 45-60) ═══

  titan_forgemaster: {
    bossType: 'titan_forgemaster',
    preBattle: [
      'I forged the Crown ten thousand years ago. My greatest creation. My greatest shame.',
      'It was meant to unite the elements. Instead, it consumed the king\'s mind.',
      'I am the Seventh Guardian. The last fragment is embedded in my heart.',
      'Strike me down, and you will have all seven. But the choice of what to do... that is yours alone.',
    ],
    deathLine: 'All seven fragments... now go to the Eternal Abyss. Destroy the Crown in the same fire that forged it — MY fire, which now burns in you.',
    loreReveal: 'The Titan Forgemaster was the creator of the Crown of Eternity. He embedded the final fragment in his own heart as penance. With all 7 fragments, the player can enter the Eternal Abyss.',
  },

  ancient_dragon_king: {
    bossType: 'ancient_dragon_king',
    preBattle: [
      'You have gathered the fragments. Impressive.',
      'But why destroy the Crown when you could WEAR it?',
      'Think of the power! You could reshape this world!',
      'The Primordial King was weak. YOU would be different. Join me.',
    ],
    deathLine: 'Fool... the Crown would have given you everything... now the Overlord will take it by force...',
    loreReveal: 'The Ancient Dragon King was the Crown\'s agent, trying to find someone strong enough to wear the reassembled Crown and become the new Primordial King.',
  },

  abyssal_overlord: {
    bossType: 'abyssal_overlord',
    preBattle: [
      'At last... after ten thousand years...',
      'I am the Primordial King. I am the Crown\'s first vessel.',
      'You carry all seven fragments. I can feel my Crown calling to me.',
      'But you... you are different from the others. The Crown could not corrupt you.',
      'Perhaps that is why you must be destroyed.',
    ],
    deathLine: 'The Crown... it releases me at last. I remember now... I was just a man, once. Thank you, hero. Destroy it. End the cycle. Let no one wear the Crown of Eternity ever again.',
    loreReveal: 'The Primordial King was just a man corrupted by the sentient Crown. With his defeat, the Crown\'s power fades. The seven fragments dissolve into harmless light. The world is free.',
  },
};

// ─── Crown Fragment Lore Items ───
// Dropped by bosses, collected in a Lore Book

export const LORE_ENTRIES: LoreEntry[] = [
  // Chapter 1: The Awakening
  {
    id: 'lore_frost_dragon', title: 'Fragment of Ice',
    text: 'A shard of crystallized power pulses with cold light. It whispers of an ancient crown, shattered long ago to imprison a tyrant king. This fragment was guarded by the Frost Dragon, who slowly lost its mind to the shard\'s corruption.',
    bossType: 'boss_frost', chapter: 1, order: 1,
  },
  {
    id: 'lore_shadow_lord', title: 'Fragment of Shadow',
    text: 'This dark shard absorbs light around it. The Shadow Lord was once a Guardian of Light — one of seven beings chosen to hide the fragments of the Crown of Eternity. The irony of his fall is not lost on history.',
    bossType: 'shadow_lord', chapter: 1, order: 2,
  },
  {
    id: 'lore_swamp_hag', title: 'Fragment of Nature',
    text: 'A fragment wrapped in dying vines. The Swamp Hag was a nature spirit who swallowed a Crown Fragment to keep it safe. The shard poisoned her realm from within, turning paradise into wasteland.',
    bossType: 'swamp_hag', chapter: 1, order: 3,
  },

  // Chapter 2: The Discovery
  {
    id: 'lore_crystal_colossus', title: 'Fragment of Earth',
    text: 'A fragment embedded in crystal. The Colossus reveals the full picture: Seven Guardians were chosen to scatter the Crown of Eternity across the world. Each paid a terrible price. Three fragments found — four remain.',
    bossType: 'crystal_colossus', chapter: 2, order: 1,
  },
  {
    id: 'lore_storm_titan', title: 'Fragment of Storm',
    text: 'A fragment that crackles with lightning. The Storm Titan warns that the Crown is sentient — it WANTS to be reassembled. Every fragment gathered makes the Crown\'s influence stronger. Four shards now pulse in unison.',
    bossType: 'storm_titan', chapter: 2, order: 2,
  },
  {
    id: 'lore_leviathan', title: 'Fragment of the Deep',
    text: 'A fragment that drips with ancient seawater. The Leviathan\'s dying words reveal the darkest secret: the Primordial King is not dead. He sleeps in the Eternal Abyss, dreaming of his Crown, waiting to be freed.',
    bossType: 'abyssal_leviathan', chapter: 2, order: 3,
  },
  {
    id: 'lore_lich_king', title: 'Fragment of Death',
    text: 'A fragment cold as the grave. The Lich King chose undeath to guard his fragment forever. Six of seven fragments are now found. The Lich warns: someone among the living works to free the Primordial King.',
    bossType: 'lich_king', chapter: 2, order: 4,
  },

  // Chapter 3: The Truth
  {
    id: 'lore_void', title: 'The Crown\'s True Nature',
    text: 'The Void Sovereign reveals the ultimate truth: the Crown of Eternity is not a creation — it is a living entity, a cosmic parasite. It did not empower the Primordial King; it CREATED him as its vessel. Every fragment-bearer has been its puppet.',
    bossType: 'void_sovereign', chapter: 3, order: 1,
  },
  {
    id: 'lore_guardian', title: 'The Path to Destruction',
    text: 'The Ancient Guardian\'s ruins contain the answer: the Crown cannot be destroyed by any weapon. It can only be unmade at the Titan\'s Forge, where it was originally created ten thousand years ago.',
    bossType: 'ancient_guardian', chapter: 3, order: 2,
  },

  // Chapter 4: The Final Truth
  {
    id: 'lore_forgemaster', title: 'The Seventh Fragment',
    text: 'The Titan Forgemaster, creator of the Crown, embedded the final fragment in his own heart as penance. With his defeat, all seven fragments are united. The path to the Eternal Abyss is open. The Crown must be destroyed in the same fire that forged it.',
    bossType: 'titan_forgemaster', chapter: 4, order: 1,
  },
  {
    id: 'lore_dragon_king', title: 'The Crown\'s Agent',
    text: 'The Ancient Dragon King was not a guardian — he was the Crown\'s agent, searching for a worthy new vessel. His defeat proves you cannot be corrupted. You are the only one who can end this.',
    bossType: 'ancient_dragon_king', chapter: 4, order: 2,
  },
  {
    id: 'lore_overlord', title: 'The End of the Cycle',
    text: 'The Primordial King was just a man, corrupted beyond recognition by the sentient Crown. With his defeat, the Crown\'s power fades forever. The seven fragments dissolve into harmless starlight. The ten-thousand-year cycle ends. The world is free.',
    bossType: 'abyssal_overlord', chapter: 4, order: 3,
  },
];

// ─── Chapter Summaries (shown when chapter milestones are reached) ───

export const CHAPTER_SUMMARIES: Record<number, { title: string; summary: string }> = {
  1: {
    title: 'Chapter I: The Awakening',
    summary: 'You have defeated three corrupted guardians and recovered fragments of an ancient crown. Each guardian was once a protector, twisted by the very power they swore to hide. An old curse runs deeper than anyone knew...',
  },
  2: {
    title: 'Chapter II: The Shattered Crown',
    summary: 'The truth emerges: Seven Guardians scattered the Crown of Eternity to imprison the Primordial King. But the Crown is sentient — it wants to be whole again. The King sleeps in the Eternal Abyss, and someone is trying to free him. Six fragments found, one remains...',
  },
  3: {
    title: 'Chapter III: The Living Crown',
    summary: 'The Crown of Eternity is not a tool — it is a cosmic parasite that created the Primordial King as its vessel. Every guardian, every boss, every fragment-bearer has been its puppet. The Crown can only be destroyed at the Titan\'s Forge where it was created.',
  },
  4: {
    title: 'Chapter IV: The End of Eternity',
    summary: 'All seven fragments are united. The Titan Forgemaster, creator of the Crown, has fallen. The Ancient Dragon King\'s corruption is broken. In the Eternal Abyss, the Primordial King — just a man, lost for ten thousand years — is finally freed from the Crown\'s control. The cycle ends. The world begins anew.',
  },
};

// ─── Helper: Get collected lore for a player ───

export function getCollectedLore(defeatedBosses: Set<string>): LoreEntry[] {
  return LORE_ENTRIES.filter(entry => defeatedBosses.has(entry.bossType));
}

export function getCurrentChapter(defeatedBosses: Set<string>): number {
  const collected = getCollectedLore(defeatedBosses);
  if (collected.length === 0) return 0;
  return Math.max(...collected.map(e => e.chapter));
}

// ─── Monster Encounter Lines ───
// Regular mobs occasionally say something when battle starts (~30% chance)
// These lines hint at the larger Crown story

export const MOB_LINES: Record<string, string[]> = {
  // Undead — remember fragments of their past life
  skeleton: [
    'The Crown... I remember the Crown...',
    'We were soldiers once. Before the shard came.',
    'The king... he promised us eternal life...',
  ],
  skeleton_warrior: [
    'I served the Guardians. Now I serve the shard.',
    'Death was supposed to free us from the Crown...',
  ],
  ghost: [
    'Can you hear it? The Crown whispers even to the dead.',
    'I died guarding a fragment. My duty never ended.',
    'The light... I used to guard the light...',
  ],
  wraith: [
    'The shadows are not evil. The Crown made them so.',
    'We are echoes of the Guardians\' failure.',
  ],

  // Ice creatures — frozen memories
  ice_golem: [
    'Frozen... like the truth about the Crown.',
    'The ice preserves what should have been forgotten.',
  ],
  frost_sprite: [
    'Cold... so cold since the shard came to our caves.',
    'We danced in starlight once. Before the Crown.',
  ],
  yeti: [
    'The mountain remembers the old king.',
    'Snow hides many sins. And many fragments.',
  ],

  // Fire creatures — rage of corruption
  fire_elemental: [
    'BURN! Like the Crown burns everything it touches!',
    'The flames remember the Forge where it was made.',
  ],
  lava_slime: [
    'Hot... angry... the shard makes us angry...',
  ],
  magma_golem: [
    'The Titan forged us. The Crown twisted us.',
    'Molten fury... the Crown\'s corruption runs deep.',
  ],

  // Forest creatures
  wolf: [
    'The forest sickens. Something ancient poisons it.',
    '*growls* Even beasts feel the Crown\'s pull.',
  ],
  treant: [
    'The roots whisper of a crown buried deep.',
    'Nature recoils from the shards\' corruption.',
  ],
  spider: [
    'We weave our webs around the shard\'s resting place.',
    'The darkness feeds us. Feeds the Crown.',
  ],

  // Demons — know the Crown's power
  demon: [
    'The Crown called us from the void. Delicious power!',
    'Your Guardians failed. The Crown will be whole again.',
  ],
  lesser_demon: [
    'The Gate weakens as more fragments are gathered.',
    'Our master promised us the world when the King returns.',
  ],
  pit_fiend: [
    'The Primordial King will rise! The Crown demands it!',
    'You carry fragments, mortal. We can smell them.',
  ],

  // Water creatures
  water_elemental: [
    'The deep remembers. The Crown sank but never drowned.',
    'Currents carry whispers of the old king.',
  ],
  sea_serpent: [
    'Something sleeps in the abyss. Something crowned.',
  ],

  // Void/Shadow
  void_stalker: [
    'The void is where the Crown was born.',
    'We are fragments of the Crown\'s consciousness.',
  ],
  shadow_fiend: [
    'Shadows existed before light. The Crown knows this.',
    'The King\'s shadow stretches across all realms.',
  ],
  shadow_assassin: [
    'The Crown sends us to reclaim its fragments.',
    'You cannot hide from what the Crown desires.',
  ],

  // Necropolis
  death_knight: [
    'We swore an oath to the Crown. Even death cannot break it.',
    'The Lich King promised resurrection when the Crown is whole.',
  ],
  bone_dragon: [
    'Dragons were the first to fall to the Crown\'s corruption.',
    'We fly on wings of bone, dreaming of the Crown.',
  ],
  soul_reaper: [
    'Souls feed the Crown. Every death makes it stronger.',
  ],

  // Constructs/Golems
  rock_golem: [
    'Built to guard. Corrupted to destroy.',
    'The earth itself rejected the Crown fragment.',
  ],
  steel_golem: [
    'Forged in the same fire as the Crown.',
    'The Titan\'s creations serve the Crown now.',
  ],
  forge_automaton: [
    'The Forge remembers its greatest mistake.',
    'We were built to unmake the Crown. Instead we guard it.',
  ],

  // Dragons
  dragon: [
    'Dragons remember the world before the Crown.',
    'We were kings before the Primordial King took our name.',
  ],
  fire_drake: [
    'Dragonfire cannot melt the Crown. Nothing can.',
    'The Sanctum holds the oldest dragon secret.',
  ],
  young_dragon: [
    'The elders whisper of a crown that corrupts all.',
    'We serve the Dragon King. He serves... something else.',
  ],
  elder_wyrm: [
    'I have lived long enough to remember the Crown\'s forging.',
    'The Titan wept when he saw what the Crown did to the King.',
  ],
  undead_dragon: [
    'Even death serves the Crown.',
    'The Dragon King promised us life. The Crown delivered undeath.',
  ],

  // Swamp
  bog_crawler: [
    'The swamp water tastes of the Crown\'s poison.',
  ],
  poison_toad: [
    'Ribbit... the poison came from above... from a falling shard...',
  ],
  fungal_beast: [
    'We grow where the Crown\'s corruption seeps into the soil.',
  ],

  // Mines
  gem_beetle: [
    'Crystals grow around the shard. Beautiful and deadly.',
  ],
  cave_troll: [
    'SMASH! The shiny shard makes trolls angry!',
  ],

  // Sky
  wind_spirit: [
    'The winds carried stories of the Crown across the world.',
    'High above, we saw the seven fragments scattered.',
  ],
  lightning_elemental: [
    'Thunder is the Crown\'s heartbeat echoing across the sky.',
  ],

  // Frost Wastes
  frost_giant: [
    'The cold came when the Crown shattered. It never left.',
    'We guard the frozen wastes. The Emperor guards something more.',
  ],
  blizzard_wolf: [
    '*howls* The pack follows the shard\'s call.',
  ],
  glacier_golem: [
    'Ice remembers. The Crown remembers. Neither forgives.',
  ],

  // Ancient Ruins
  stone_sentinel: [
    'Ten thousand years I have watched. The Crown still calls.',
    'These walls hold the truth: the Crown cannot be destroyed easily.',
  ],
  arcane_construct: [
    'Magic flows from the Crown. Even here, so far from any shard.',
  ],
  enchanted_armor: [
    'I was a guardian\'s armor. Now I am the Crown\'s puppet.',
  ],

  // Titan's Forge
  molten_giant: [
    'The Forge burns eternal. Like the Crown\'s hunger.',
  ],
  hammer_sentinel: [
    'The Forgemaster weeps. His creation destroys the world.',
  ],

  // Eternal Abyss
  abyssal_terror: [
    'HE DREAMS. THE KING DREAMS OF HIS CROWN.',
    'You carry fragments into the abyss. Bold. Foolish.',
  ],
  dread_lord: [
    'The Primordial King\'s court still gathers in the dark.',
    'Ten thousand years of dreaming. He knows you\'re coming.',
  ],
  doom_knight: [
    'We are the King\'s final guard. His will endures.',
  ],
  world_eater: [
    'When the Crown is whole, worlds will burn.',
    'We taste the fragments\' power on you. Delicious.',
  ],
};

/** Get a random mob line for a monster type. Returns null 70% of the time (30% chance to speak). */
export function getRandomMobLine(monsterType: string): string | null {
  if (Math.random() > 0.3) return null; // 70% chance no dialogue
  const lines = MOB_LINES[monsterType];
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

export function getChapterProgress(defeatedBosses: Set<string>): { chapter: number; collected: number; total: number }[] {
  const chapters: Record<number, { collected: number; total: number }> = {};
  for (const entry of LORE_ENTRIES) {
    if (!chapters[entry.chapter]) chapters[entry.chapter] = { collected: 0, total: 0 };
    chapters[entry.chapter].total++;
    if (defeatedBosses.has(entry.bossType)) chapters[entry.chapter].collected++;
  }
  return Object.entries(chapters).map(([ch, data]) => ({ chapter: Number(ch), ...data }));
}
