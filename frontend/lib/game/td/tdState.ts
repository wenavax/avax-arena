// frontend/lib/game/td/tdState.ts
// ─── TD cozy durumu: toplama/enerji/tarla/satış — kendi localStorage anahtarı ───
// PlayerState.ts'e DOKUNMAZ (ayrı anahtar 'frostbite_td_save'). Önizleme-izole (Faz 3 dersi).
import { COSTS, FARM, PRICES, REGEN, TdResourceKind } from './cozy/rules';
import { REGIONS, TOWN_SPAWN } from './worldMap';
import { TILE } from './tdCore';

export interface TdResources { wood: number; stone: number; ore: number; fish: number; frostberry: number }
export interface FarmPlot { stage: 0 | 1 | 2 | 3; t: number } // 0 boş, 1-2 büyüme, 3 olgun

const TD_SAVE_KEY = 'frostbite_td_save';

/** Node testlerinde localStorage yok; tarayıcıda varsayılan olarak gerçek localStorage kullanılır. */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

export class TdState {
  static readonly ENERGY_MAX = 1000;

  energy = TdState.ENERGY_MAX;
  gold = 0;
  resources: TdResources = { wood: 0, stone: 0, ore: 0, fish: 0, frostberry: 0 };
  farm: FarmPlot[] = Array.from({ length: FARM.plotCount }, () => ({ stage: 0 as const, t: 0 }));

  private storage?: Pick<Storage, 'getItem' | 'setItem'>;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage ?? defaultStorage();
  }

  /** Kaynak toplama: enerji yeterliyse düşer + kaynak +1, değilse false döner ve HİÇBİR ŞEY değişmez. */
  gather(kind: TdResourceKind): boolean {
    const cost = kind === 'fish' ? COSTS.fish : kind === 'frostberry' ? COSTS.harvest : kind === 'wood' ? COSTS.chop : COSTS.mine;
    if (this.energy < cost) return false;
    this.energy -= cost;
    this.resources[kind] += 1;
    return true;
  }

  /** Zaman ilerlemesi: pasif enerji regen (kamp ateşi yakınında ×4) + tarla büyümesi. dt saniye cinsinden. */
  tick(dt: number, nearFire: boolean): void {
    const rate = REGEN.perSec * (nearFire ? REGEN.campfireMult : 1);
    this.energy = Math.min(TdState.ENERGY_MAX, this.energy + rate * dt);

    for (const plot of this.farm) {
      if (plot.stage === 0 || plot.stage > FARM.growthStages) continue; // boş ya da zaten olgun
      plot.t += dt;
      if (plot.t >= FARM.stageDurationSec) {
        plot.t -= FARM.stageDurationSec;
        plot.stage = (plot.stage + 1) as FarmPlot['stage'];
      }
    }
  }

  /** Tüm hammaddeleri fiyat tablosuyla gold'a çevirir; kaynaklar sıfırlanır. Kazanılan tutarı döner. */
  sellAll(): number {
    const earned =
      this.resources.wood * PRICES.wood +
      this.resources.stone * PRICES.stone +
      this.resources.ore * PRICES.ore +
      this.resources.fish * PRICES.fish +
      this.resources.frostberry * PRICES.frostberry;
    this.resources = { wood: 0, stone: 0, ore: 0, fish: 0, frostberry: 0 };
    this.gold += earned;
    return earned;
  }

  /** Boş parsele ekim (enerji COSTS.plant). Parsel boş değilse/geçersizse false. */
  plant(i: number): boolean {
    const plot = this.farm[i];
    if (!plot || plot.stage !== 0) return false;
    if (this.energy < COSTS.plant) return false;
    this.energy -= COSTS.plant;
    plot.stage = 1;
    plot.t = 0;
    return true;
  }

  /** Olgun (stage === growthStages+1) parselden hasat: +1 frostberry, parsel sıfırlanır. */
  harvest(i: number): boolean {
    const plot = this.farm[i];
    if (!plot || plot.stage !== FARM.growthStages + 1) return false;
    if (this.energy < COSTS.harvest) return false;
    this.energy -= COSTS.harvest;
    this.resources.frostberry += 1;
    plot.stage = 0;
    plot.t = 0;
    return true;
  }

  save(): void {
    if (!this.storage) return;
    try {
      const data = {
        schemaVersion: 2,
        energy: this.energy,
        gold: this.gold,
        resources: this.resources,
        farm: this.farm,
        savedAt: Date.now(),
      };
      this.storage.setItem(TD_SAVE_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }

  load(): boolean {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(TD_SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d) return false;
      this.energy = d.energy ?? TdState.ENERGY_MAX;
      this.gold = d.gold ?? 0;
      this.resources = d.resources ?? { wood: 0, stone: 0, ore: 0, fish: 0, frostberry: 0 };
      this.farm = d.farm ?? Array.from({ length: FARM.plotCount }, () => ({ stage: 0 as const, t: 0 }));
      return true;
    } catch {
      return false;
    }
  }
}

/** Eski iso dünyasının sahne/zone adı → yeni TD REGIONS anahtarı. Bilinmeyen → 'town' (TOWN_SPAWN). */
const ZONE_TO_REGION: Record<string, string> = {
  Forest: 'forest',
  Town: 'town',
  Swamp: 'swamp',
  Mines: 'mines',
  Ruins: 'ruins',
  Citadel: 'citadel',
  Sanctum: 'sanctum',
  Crypt: 'crypt',
  FrostWastes: 'frostwastes',
  Necropolis: 'necropolis',
  Volcano: 'volcano',
  Abyss: 'abyss',
  Forge: 'forge',
  DemonGate: 'demongate',
  VoidRealm: 'voidrealm',
  Eternal: 'eternal',
  Dungeon: 'mines',
  IceCave: 'frostwastes',
};

function worldPosForZone(zone: unknown): { x: number; y: number } {
  const regionKey = typeof zone === 'string' ? ZONE_TO_REGION[zone] : undefined;
  if (!regionKey) return { x: TOWN_SPAWN.tx * TILE, y: TOWN_SPAWN.ty * TILE };
  const region = REGIONS.find(r => r.key === regionKey);
  if (!region) return { x: TOWN_SPAWN.tx * TILE, y: TOWN_SPAWN.ty * TILE };
  return { x: region.cx * TILE, y: region.cy * TILE };
}

/**
 * v1 (PlayerState) save verisini v2 (TD cozy) ile birlikte var olacak şekilde genişletir.
 * SAF FONKSİYON — çağrısı Faz 5'te yapılacak (şimdilik yalnız fonksiyon+test).
 * TÜM v1 alanları korunur (spread); yalnız v2'ye özgü alanlar eklenir/üzerine yazılır.
 */
export function migrateV1(v1: Record<string, unknown>): Record<string, unknown> {
  return {
    ...v1,
    schemaVersion: 2,
    worldPos: worldPosForZone(v1.lastZone),
    energy: TdState.ENERGY_MAX,
    resources: {},
    farm: [],
  };
}
