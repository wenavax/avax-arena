/**
 * Demo event generator — fakes the social AI tick using narrative templates.
 * Each template has personality-aware variants and mood deltas.
 * Real implementation will call Claude Haiku; this lets the demo feel similar.
 */

import type { Pet } from './pet-visual';

export type EventType = 'chat' | 'gift';

export type DiaryEntry = {
  id: string;
  timestamp: number;
  eventType: EventType;
  selfName: string;
  otherName: string;
  location: string;
  narrative: string;
  moodDelta: number;
};

const LOCATIONS = ['café', 'frozen library', 'snowy garden', 'town square', 'icicle cave', 'lakeside dock'];

type Template = {
  type: EventType;
  /** Returns true if this template suits the pet's personality */
  matches: (self: Pet, other: Pet) => boolean;
  /** Template uses {self}, {other}, {location} placeholders */
  text: string;
  moodDelta: number;
};

const TEMPLATES: Template[] = [
  // CHAT — Bold personality
  {
    type: 'chat',
    matches: (s) => s.bold > 65,
    text: '{self} swaggered into the {location} and challenged {other} to a snowball-eating contest. They both laughed, but {other} secretly thought {self} was showing off.',
    moodDelta: +6,
  },
  {
    type: 'chat',
    matches: (s, o) => s.bold > 70 && o.bold < 30,
    text: 'At the {location}, {self} marched up to the timid {other} and asked why they were hiding behind a snowdrift. {other} stammered something and walked away quickly.',
    moodDelta: -2,
  },

  // CHAT — Social personality
  {
    type: 'chat',
    matches: (s) => s.social > 70,
    text: '{self} threw themselves into a long conversation with {other} at the {location}. They talked about everything — the weather, the ice melt, the price of frost berries. {other} eventually slipped away to find a snack.',
    moodDelta: +8,
  },
  {
    type: 'chat',
    matches: (s, o) => s.social > 60 && o.social > 60,
    text: 'Two chatterboxes! {self} and {other} sat at the {location} for hours, swapping gossip about the other sprites. The barista finally asked them to lower their voices.',
    moodDelta: +10,
  },

  // CHAT — Loner / shy
  {
    type: 'chat',
    matches: (s) => s.social < 30,
    text: '{self} tried to slip past {other} at the {location} without making eye contact. {other} said hi anyway. {self} mumbled "yeah, hi" and kept walking, mortified.',
    moodDelta: -4,
  },

  // CHAT — Curious
  {
    type: 'chat',
    matches: (s) => s.curious > 70,
    text: '{self} cornered {other} at the {location} and asked seventeen questions about the migration patterns of arctic moths. {other} did not know any of the answers, and felt slightly embarrassed.',
    moodDelta: +5,
  },

  // CHAT — Balanced
  {
    type: 'chat',
    matches: () => true,
    text: '{self} and {other} bumped into each other at the {location}. They exchanged a quick wave and chatted briefly about how cold it was. Pleasant, brief, perfect.',
    moodDelta: +3,
  },
  {
    type: 'chat',
    matches: () => true,
    text: 'A quiet meeting at the {location}. {self} listened more than they talked, and {other} seemed grateful for the company. Sometimes the best conversations have few words.',
    moodDelta: +4,
  },

  // GIFT — Generous (high social, balanced bold)
  {
    type: 'gift',
    matches: (s) => s.social > 65,
    text: '{self} brought a hand-carved icicle ornament to {other} at the {location}. It was clearly made with love. {other} was so touched they almost cried.',
    moodDelta: +9,
  },

  // GIFT — Bold / showoff
  {
    type: 'gift',
    matches: (s) => s.bold > 75,
    text: '{self} dramatically presented {other} with a massive frozen fish at the {location}, declaring it "the finest catch of the season." {other} accepted it politely, not sure where to put it.',
    moodDelta: +5,
  },

  // GIFT — Curious / weird
  {
    type: 'gift',
    matches: (s) => s.curious > 70,
    text: 'At the {location}, {self} produced a strange shimmering pebble from their pouch and gave it to {other}. "I found it. It hums at night." {other} now has a humming pebble.',
    moodDelta: +6,
  },

  // GIFT — Shy / awkward
  {
    type: 'gift',
    matches: (s) => s.social < 35 && s.bold < 40,
    text: '{self} left a small berry bun on a bench at the {location} with a note: "for {other}." They ran away before {other} could thank them. The berry bun was delicious.',
    moodDelta: +7,
  },

  // GIFT — Mixed
  {
    type: 'gift',
    matches: (s, o) => s.bold > 60 && o.social > 60,
    text: '{self} arrived at the {location} with a wrapped snow-globe and made a tiny speech before handing it to {other}. {other} loved the speech almost as much as the gift.',
    moodDelta: +8,
  },

  // GIFT — Default
  {
    type: 'gift',
    matches: () => true,
    text: 'A quiet exchange at the {location} — {self} slipped a small frost flower into {other}\'s pocket while they weren\'t looking. {other} found it later and smiled.',
    moodDelta: +5,
  },
  {
    type: 'gift',
    matches: () => true,
    text: '{self} traded a beautiful pinecone for one of {other}\'s shiny stones at the {location}. Both walked away feeling like they got the better deal.',
    moodDelta: +6,
  },
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rng() {
  return Math.random();
}

export function generateEvent(self: Pet, other: Pet): DiaryEntry {
  const type: EventType = Math.random() < 0.65 ? 'chat' : 'gift';
  const candidates = TEMPLATES.filter((t) => t.type === type && t.matches(self, other));
  const chosen = candidates.length > 0 ? pick(candidates, rng) : TEMPLATES.filter((t) => t.type === type).slice(-1)[0];
  const location = pick(LOCATIONS, rng);

  const narrative = chosen.text
    .replaceAll('{self}', self.name)
    .replaceAll('{other}', other.name)
    .replaceAll('{location}', location);

  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    timestamp: Date.now(),
    eventType: chosen.type,
    selfName: self.name,
    otherName: other.name,
    location,
    narrative,
    moodDelta: chosen.moodDelta,
  };
}
