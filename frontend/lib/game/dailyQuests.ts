// ---------------------------------------------------------------------------
// Daily Quest System — resets every day, stored in localStorage
// ---------------------------------------------------------------------------

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward: { xp: number; gold: number; item?: string };
}

const DAILY_POOL: Omit<DailyQuest, 'progress' | 'completed' | 'claimed'>[] = [
  { id: 'daily_slayer', title: 'Monster Slayer', description: 'Kill 10 monsters', target: 10, reward: { xp: 30, gold: 50 } },
  { id: 'daily_boss', title: 'Hero', description: 'Defeat 1 boss', target: 1, reward: { xp: 50, gold: 100 } },
  { id: 'daily_explorer', title: 'Explorer', description: 'Visit all 3 zones', target: 3, reward: { xp: 20, gold: 30 } },
];

const DAILY_KEY = 'frostbite_daily';

export function getDailyQuests(): DailyQuest[] {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const saved = localStorage.getItem(DAILY_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.date === today) return data.quests as DailyQuest[];
    }
  } catch { /* ignore parse errors */ }

  // Generate fresh dailies for today
  const quests: DailyQuest[] = DAILY_POOL.map(q => ({
    ...q,
    progress: 0,
    completed: false,
    claimed: false,
  }));

  saveDailyQuests(quests);
  return quests;
}

export function saveDailyQuests(quests: DailyQuest[]): void {
  const today = new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, quests }));
  } catch { /* localStorage unavailable */ }
}

export function updateDailyProgress(questId: string, increment: number = 1): void {
  const quests = getDailyQuests();
  const q = quests.find(x => x.id === questId);
  if (q && !q.completed) {
    q.progress = Math.min(q.target, q.progress + increment);
    if (q.progress >= q.target) q.completed = true;
    saveDailyQuests(quests);
  }
}

/**
 * Track zone visits for the daily_explorer quest.
 * Call this whenever the player enters a zone (Town, Forest, Dungeon).
 */
export function trackZoneVisit(zone: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const zoneKey = 'frostbite_daily_zones';

  let visited: Set<string>;
  try {
    const saved = localStorage.getItem(zoneKey);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.date === today) {
        visited = new Set(data.zones as string[]);
      } else {
        visited = new Set();
      }
    } else {
      visited = new Set();
    }
  } catch {
    visited = new Set();
  }

  visited.add(zone);

  try {
    localStorage.setItem(zoneKey, JSON.stringify({ date: today, zones: [...visited] }));
  } catch { /* */ }

  // Update daily explorer quest progress to match unique zone count
  const quests = getDailyQuests();
  const q = quests.find(x => x.id === 'daily_explorer');
  if (q && !q.completed) {
    q.progress = Math.min(q.target, visited.size);
    if (q.progress >= q.target) q.completed = true;
    saveDailyQuests(quests);
  }
}
