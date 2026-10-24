import type { MaterialId } from './realms';

/**
 * The Hearthstead is the idle half of the game: buildings that produce while the
 * phone is in your pocket. Walking fast-forwards every timer (the stride boost),
 * so idling and walking feed each other.
 */

export type BuildingId = 'herbGarden' | 'mine' | 'lumberGrove' | 'kennel';
export type SupplyId = 'tonic' | 'petXp';
export type Product = { kind: 'material'; id: MaterialId } | { kind: 'supply'; id: SupplyId };

export interface BuildingDef {
  id: BuildingId;
  name: string;
  blurb: string;
  /** Wayfarer level that unlocks it. */
  unlockLevel: number;
  product: Product;
  productName: string;
  /** Output per hour at building level 1. */
  baseRate: number;
  /** Material spent (with coin) on upgrades. */
  upgradeMaterial: MaterialId;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  herbGarden: {
    id: 'herbGarden',
    name: 'Herb Garden',
    blurb: 'Brews healing tonics for battle.',
    unlockLevel: 3,
    product: { kind: 'supply', id: 'tonic' },
    productName: 'Tonic',
    baseRate: 2,
    upgradeMaterial: 'hearthgrain',
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    blurb: 'Digs cobble ore for boots and the Forge.',
    unlockLevel: 3,
    product: { kind: 'material', id: 'cobbleOre' },
    productName: 'Cobble ore',
    baseRate: 3,
    upgradeMaterial: 'ironbark',
  },
  lumberGrove: {
    id: 'lumberGrove',
    name: 'Lumber Grove',
    blurb: 'Grows ironbark for staves.',
    unlockLevel: 4,
    product: { kind: 'material', id: 'ironbark' },
    productName: 'Ironbark',
    baseRate: 3,
    upgradeMaterial: 'cobbleOre',
  },
  kennel: {
    id: 'kennel',
    name: 'Kennel',
    blurb: 'Trains pets while you are away.',
    unlockLevel: 6,
    product: { kind: 'supply', id: 'petXp' },
    productName: 'Pet XP',
    baseRate: 25,
    upgradeMaterial: 'hearthgrain',
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const MAX_BUILDING_LEVEL = 10;

const HOUR = 60 * 60 * 1000;
/** Each 100 m walked advances every timer by this much. */
export const STRIDE_BOOST_MS = 10 * 60 * 1000;
/** Most idle time walking can skip in one day. */
export const STRIDE_DAILY_CAP_MS = 8 * HOUR;

export interface BuildingState {
  level: number;
  /** Production time banked since the last collect, capped at storage. */
  progressMs: number;
}

export interface HearthsteadState {
  buildings: Partial<Record<BuildingId, BuildingState>>;
  /** Last time real time was banked into the buildings. */
  lastTick: number;
  /** Day (local date string) the stride boost counter belongs to. */
  strideDay: string;
  strideUsedMs: number;
}

export const newHearthstead = (now: number): HearthsteadState => ({
  buildings: {},
  lastTick: now,
  strideDay: '',
  strideUsedMs: 0,
});

export const ratePerHour = (def: BuildingDef, level: number) => def.baseRate * (1 + 0.5 * (level - 1));
/** Storage holds 8 hours at level 1, rising to 24 hours at level 9. */
export const storageHours = (level: number) => Math.min(24, 8 + 2 * (level - 1));
export const capMs = (level: number) => storageHours(level) * HOUR;

export function upgradeCost(def: BuildingDef, level: number): { coin: number; material: MaterialId; amount: number } {
  return { coin: 40 * level * level, material: def.upgradeMaterial, amount: 4 * level };
}

/** Units ready to collect. */
export function stored(def: BuildingDef, b: BuildingState): number {
  return Math.floor((b.progressMs / HOUR) * ratePerHour(def, b.level));
}

export function storageCap(def: BuildingDef, b: BuildingState): number {
  return Math.floor(storageHours(b.level) * ratePerHour(def, b.level));
}

function bank(h: HearthsteadState, ms: number): void {
  for (const b of Object.values(h.buildings)) if (b) b.progressMs = Math.min(capMs(b.level), b.progressMs + ms);
}

/** Banks real time passed since the last tick (also covers time the app was closed). */
export function tick(h: HearthsteadState, now: number): void {
  const elapsed = now - h.lastTick;
  h.lastTick = now;
  if (elapsed > 0) bank(h, elapsed);
}

/** The local calendar day, for things that reset each morning. */
export const dayKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Applies the stride boost for `steps` × 100 m, scaled by `factor` (boots). Returns the time actually skipped. */
export function strideBoost(h: HearthsteadState, steps: number, now: number, factor = 1): number {
  const day = dayKey(now);
  if (h.strideDay !== day) {
    h.strideDay = day;
    h.strideUsedMs = 0;
  }
  const ms = Math.min(Math.round(steps * STRIDE_BOOST_MS * factor), STRIDE_DAILY_CAP_MS - h.strideUsedMs);
  if (ms <= 0) return 0;
  h.strideUsedMs += ms;
  bank(h, ms);
  return ms;
}

export function strideLeftToday(h: HearthsteadState, now: number): number {
  return h.strideDay === dayKey(now) ? STRIDE_DAILY_CAP_MS - h.strideUsedMs : STRIDE_DAILY_CAP_MS;
}

/** Takes what a building has made, keeping any part-made unit. Returns the amount. */
export function collect(def: BuildingDef, b: BuildingState): number {
  const amount = stored(def, b);
  if (amount > 0) b.progressMs -= (amount / ratePerHour(def, b.level)) * HOUR;
  return amount;
}

/** Time until a building's storage is full. */
export function msUntilFull(b: BuildingState): number {
  return Math.max(0, capMs(b.level) - b.progressMs);
}
