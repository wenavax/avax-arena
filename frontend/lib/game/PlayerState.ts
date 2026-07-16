export type PlayerClass = 'knight' | 'mage' | 'archer';

export interface QuestData {
  id: string;
  title: string;
  description: string;
  objective: string;
  target: number;
  progress: number;
  reward: { type: 'item' | 'gold' | 'xp'; id?: string; amount: number };
  completed: boolean;
  turnedIn: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  sprite: string;
  type: 'weapon' | 'armor' | 'accessory' | 'ring' | 'potion' | 'key' | 'quest';
  stat?: { atk?: number; def?: number; hp?: number; mp?: number; spd?: number };
  stackable: boolean;
  count: number;
}

export class PlayerState {
  private static instance: PlayerState;
  static get(): PlayerState {
    if (!PlayerState.instance) PlayerState.instance = new PlayerState();
    return PlayerState.instance;
  }

  name = 'Hero';
  playerClass: PlayerClass = 'knight';

  // Appearance
  skinColor: number = 0xffddbb;
  hairColor: number = 0x443322;

  // NFT character
  useNftSprite = false;
  nftTokenId = 0;
  nftElement = -1; // 0-7 element index from NFT, -1 = no NFT
  nftRarity = 0;
  nftImageUrl = '';
  nftTextureKey = '';

  level = 1;
  xp = 0;
  xpToNext = 100;
  maxHp = 120;
  hp = 120;
  atk = 15;
  def = 8;
  spd = 10;
  gold = 50;
  mp = 30;
  maxMp = 30;

  inventory: InventoryItem[] = [
    { id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion', stat: { hp: 40 }, stackable: true, count: 3 },
  ];

  // Equipment slots
  equipped: { weapon: InventoryItem | null; armor: InventoryItem | null; accessory: InventoryItem | null; ring: InventoryItem | null } = {
    weapon: null,
    armor: null,
    accessory: null,
    ring: null,
  };

  // Base stats (before equipment bonuses)
  baseAtk = 15;
  baseDef = 8;
  baseSpd = 10;

  equip(item: InventoryItem): string | null {
    const slotMap: Record<string, string> = { weapon: 'weapon', armor: 'armor', accessory: 'accessory', ring: 'ring' };
    const slot = slotMap[item.type] as keyof typeof this.equipped | undefined;
    if (!slot) return null;

    // Remove the incoming item from inventory first — frees a slot for the swap
    this.removeItem(item.id, 1);

    // Put the currently equipped item back; if inventory is somehow still full,
    // revert instead of silently destroying the equipped item
    const current = this.equipped[slot];
    if (current) {
      if (!this.addItem(current)) {
        this.addItem({ ...item, count: 1 });
        return null;
      }
    }

    // Equip
    this.equipped[slot] = { ...item, count: 1 };
    this.recalcStats();
    return slot;
  }

  unequip(slot: 'weapon' | 'armor' | 'accessory' | 'ring'): boolean {
    const item = this.equipped[slot];
    if (!item) return false;

    // Try to put back in inventory
    const added = this.addItem(item);
    if (!added) return false; // inventory full

    this.equipped[slot] = null;
    this.recalcStats();
    return true;
  }

  recalcStats() {
    this.atk = this.baseAtk + (this.level - 1) * 3;
    this.def = this.baseDef + (this.level - 1) * 2;
    this.spd = this.baseSpd + (this.level - 1) * 1;
    for (const item of [this.equipped.weapon, this.equipped.armor, this.equipped.accessory, this.equipped.ring]) {
      if (item?.stat?.atk) this.atk += item.stat.atk;
      if (item?.stat?.def) this.def += item.stat.def;
      if (item?.stat?.spd) this.spd += item.stat.spd;
    }
  }

  quests: QuestData[] = [];
  killCounts: Record<string, number> = {};
  flags: Set<string> = new Set();

  lastZone = 'Town';
  spawnX = 0;
  spawnY = 0;

  addKill(monsterType: string) {
    this.killCounts[monsterType] = (this.killCounts[monsterType] || 0) + 1;
    // Elite variants arrive as 'elite_<type>' — they must still advance quests
    // targeting the base type (and count toward its kill tally).
    const baseType = monsterType.startsWith('elite_') ? monsterType.slice(6) : monsterType;
    if (baseType !== monsterType) {
      this.killCounts[baseType] = (this.killCounts[baseType] || 0) + 1;
    }
    for (const q of this.quests) {
      if (!q.completed && q.objective === baseType) {
        q.progress = Math.min(this.killCounts[baseType], q.target);
        if (q.progress >= q.target) q.completed = true;
      }
    }
  }

  addXp(amount: number): boolean {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(this.xpToNext * 1.4);
      this.maxHp += 15;
      this.hp = this.maxHp;
      this.maxMp += 3;
      this.mp = this.maxMp;
      leveled = true;
    }
    if (leveled) this.recalcStats();
    return leveled;
  }

  addItem(item: InventoryItem): boolean {
    if (item.stackable) {
      const existing = this.inventory.find(i => i.id === item.id);
      if (existing) { existing.count += item.count; return true; }
    }
    if (this.inventory.length >= 12) return false;
    this.inventory.push({ ...item });
    return true;
  }

  removeItem(id: string, count = 1): boolean {
    const idx = this.inventory.findIndex(i => i.id === id);
    if (idx === -1) return false;
    this.inventory[idx].count -= count;
    if (this.inventory[idx].count <= 0) this.inventory.splice(idx, 1);
    return true;
  }

  hasItem(id: string): boolean {
    return this.inventory.some(i => i.id === id);
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  get spriteKey(): string {
    return this.playerClass;
  }

  // ─── Save / Load (localStorage) ───

  private static SAVE_KEY = 'frostbite_save';

  save(): void {
    try {
      const data = {
        v: 1, // save version
        name: this.name,
        playerClass: this.playerClass,
        skinColor: this.skinColor,
        hairColor: this.hairColor,
        useNftSprite: this.useNftSprite,
        nftTokenId: this.nftTokenId,
        nftElement: this.nftElement,
        nftRarity: this.nftRarity,
        level: this.level,
        xp: this.xp,
        xpToNext: this.xpToNext,
        maxHp: this.maxHp,
        hp: this.hp,
        atk: this.atk,
        def: this.def,
        spd: this.spd,
        baseAtk: this.baseAtk,
        baseDef: this.baseDef,
        gold: this.gold,
        mp: this.mp,
        maxMp: this.maxMp,
        baseSpd: this.baseSpd,
        inventory: this.inventory,
        equipped: this.equipped,
        quests: this.quests,
        killCounts: this.killCounts,
        flags: [...this.flags],
        lastZone: this.lastZone,
        spawnX: this.spawnX,
        spawnY: this.spawnY,
        savedAt: Date.now(),
      };
      localStorage.setItem(PlayerState.SAVE_KEY, JSON.stringify(data));
    } catch { /* localStorage unavailable */ }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(PlayerState.SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) return false;

      this.name = d.name ?? 'Hero';
      this.playerClass = d.playerClass ?? 'knight';
      this.skinColor = d.skinColor ?? 0xffddbb;
      this.hairColor = d.hairColor ?? 0x443322;
      this.useNftSprite = d.useNftSprite ?? false;
      this.nftTokenId = d.nftTokenId ?? 0;
      this.nftElement = d.nftElement ?? -1;
      this.nftRarity = d.nftRarity ?? 0;
      this.level = d.level ?? 1;
      this.xp = d.xp ?? 0;
      this.xpToNext = d.xpToNext ?? 100;
      this.maxHp = d.maxHp ?? 120;
      this.hp = d.hp ?? 120;
      this.atk = d.atk ?? 15;
      this.def = d.def ?? 8;
      this.spd = d.spd ?? 10;
      this.baseAtk = d.baseAtk ?? 15;
      this.baseDef = d.baseDef ?? 8;
      this.gold = d.gold ?? 50;
      this.mp = d.mp ?? 30;
      this.maxMp = d.maxMp ?? 30;
      this.baseSpd = d.baseSpd ?? 10;
      this.inventory = d.inventory ?? [];
      this.equipped = d.equipped ?? { weapon: null, armor: null, accessory: null, ring: null };
      // Ensure new slots exist for old saves
      if (!('accessory' in this.equipped)) (this.equipped as any).accessory = null;
      if (!('ring' in this.equipped)) (this.equipped as any).ring = null;
      this.quests = d.quests ?? [];
      this.killCounts = d.killCounts ?? {};
      this.flags = new Set(d.flags ?? []);
      this.lastZone = d.lastZone ?? 'Town';
      this.spawnX = d.spawnX ?? 0;
      this.spawnY = d.spawnY ?? 0;

      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(PlayerState.SAVE_KEY);
    } catch {
      return false;
    }
  }

  deleteSave(): void {
    try {
      localStorage.removeItem(PlayerState.SAVE_KEY);
    } catch { /* */ }
  }
}
