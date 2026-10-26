import { weightedPick } from './rng';
import type { MaterialId } from './realms';

/**
 * Gear is for the Wayfarer, not the pets. Each of the five slots strengthens a different
 * part of the game, and each is upgraded with a material found in a different kind of
 * place, so upgrading gear means exploring.
 */

export type Slot = 'staff' | 'cloak' | 'boots' | 'lantern' | 'charm';
export type GearRarity = 'worn' | 'fine' | 'rare' | 'mythic' | 'relic';
export type RuneId = 'nightfang' | 'hatchstone' | 'swiftsole' | 'seer' | 'warding';

export const SLOTS: Slot[] = ['staff', 'cloak', 'boots', 'lantern', 'charm'];
export const FORGE_LEVEL = 5;
export const RUNE_LEVEL = 15;
export const MYTHIC_LEVEL = 20;
export const RELIC_LEVEL = 30;

export interface SlotDef {
  name: string;
  material: MaterialId;
  /** What one point of gear power gives, in words for the UI. */
  effect: (power: number) => string;
}

/** Bonus per point of power, per slot. */
export const PER_POWER = { staff: 0.04, cloak: 0.05, boots: 0.05, lantern: 8, charm: 0.03 } as const;

const pct = (x: number) => `+${Math.round(x * 100)}%`;

export const SLOT_DEFS: Record<Slot, SlotDef> = {
  staff: { name: 'Staff', material: 'ironbark', effect: (p) => `${pct(p * PER_POWER.staff)} damage` },
  cloak: { name: 'Cloak', material: 'mistwool', effect: (p) => `${pct(p * PER_POWER.cloak)} health` },
  boots: { name: 'Boots', material: 'cobbleOre', effect: (p) => `${pct(p * PER_POWER.boots)} stride` },
  lantern: { name: 'Lantern', material: 'gravemoss', effect: (p) => `+${Math.round(p * PER_POWER.lantern)} m reach` },
  charm: { name: 'Charm', material: 'shrineRelic', effect: (p) => `${pct(p * PER_POWER.charm)} befriending` },
};

export const RARITIES: Record<GearRarity, { name: string; power: number; color: string }> = {
  worn: { name: 'Worn', power: 1, color: '#8a7a62' },
  fine: { name: 'Fine', power: 1.5, color: '#4b7a3c' },
  rare: { name: 'Rare', power: 2.2, color: '#3f6f9a' },
  mythic: { name: 'Mythic', power: 3.2, color: '#8a3fa0' },
  relic: { name: 'Relic', power: 4.5, color: '#c99a3a' },
};

export const RUNES: Record<RuneId, { name: string; blurb: string }> = {
  nightfang: { name: 'Nightfang', blurb: '+20% Wildling damage at night' },
  hatchstone: { name: 'Kinstone', blurb: 'Wildlings trust you 15% sooner' },
  swiftsole: { name: 'Swiftsole', blurb: '+10% stride boost' },
  seer: { name: 'Seer', blurb: '+10 m reach' },
  warding: { name: 'Warding', blurb: '+10% party health' },
};
export const RUNE_IDS = Object.keys(RUNES) as RuneId[];

/**
 * A piece of gear the Wayfarer wears. Gear is found, never crafted: Blotspawn drop it and
 * curios, shrines and hunt chests sometimes hold it. Each slot holds one piece.
 *
 * Upgrades and runes belong to the slot, not the piece: a better find takes over the
 * slot's +level and runes, so nothing spent at the Forge is ever lost.
 */
export interface GearItem {
  slot: Slot;
  rarity: GearRarity;
  /** Forge upgrade level, +0 to +10. */
  plus: number;
  runes: RuneId[];
}

export const RARITY_ORDER: GearRarity[] = ['worn', 'fine', 'rare', 'mythic', 'relic'];
const rank = (r: GearRarity) => RARITY_ORDER.indexOf(r);

export const maxPlus = (wayfarerLevel: number) => (wayfarerLevel >= RUNE_LEVEL ? 10 : 5);
/** Rune sockets open at +5 and +10. */
export const runeSockets = (item: Pick<GearItem, 'plus'>) => (item.plus >= 10 ? 2 : item.plus >= 5 ? 1 : 0);
export const power = (item: Pick<GearItem, 'rarity' | 'plus'>) => RARITIES[item.rarity].power * (1 + 0.15 * item.plus);

export function upgradeCost(item: GearItem): { coin: number; material: MaterialId; amount: number } {
  const n = item.plus + 1;
  return {
    coin: Math.round(30 * n ** 1.6),
    material: SLOT_DEFS[item.slot].material,
    amount: item.slot === 'charm' ? Math.ceil(n / 2) : 3 * n,
  };
}

/** Where a piece of gear was found; better sources roll better rarities. */
export type GearSource =
  | { kind: 'foe'; rank: 'normal' | 'rare' | 'elite' | 'boss'; tier?: number }
  | { kind: 'curio'; onFoot: boolean }
  | { kind: 'shrine' }
  | { kind: 'chest'; hints: number };

type Weights = Partial<Record<GearRarity, number>>;

/** Chance of a drop at all, and the rarity weights if it drops. */
export function dropTable(source: GearSource): { chance: number; weights: Weights } {
  switch (source.kind) {
    case 'foe': {
      const tier = Math.max(1, source.tier ?? 1);
      if (source.rank === 'boss') return { chance: 1, weights: { rare: 45, mythic: 40, relic: 10 + 5 * tier } };
      if (source.rank === 'elite') return { chance: 0.25 + 0.15 * tier, weights: { fine: 40, rare: 40 + 5 * tier, mythic: 8 * tier, relic: tier - 1 } };
      if (source.rank === 'rare') return { chance: 0.22, weights: { worn: 30, fine: 48, rare: 20, mythic: 2 } };
      return { chance: 0.08, weights: { worn: 66, fine: 28, rare: 6 } };
    }
    case 'curio':
      return { chance: source.onFoot ? 0.06 : 0.03, weights: { worn: 60, fine: 32, rare: 8 } };
    case 'shrine':
      return { chance: 0.04, weights: { worn: 50, fine: 38, rare: 12 } };
    case 'chest':
      return { chance: source.hints <= 1 ? 1 : 0.5, weights: { fine: 50, rare: 40 - 5 * Math.min(source.hints, 3), mythic: 10 - 2 * Math.min(source.hints, 3) } };
  }
}

/** Mythic gear starts dropping at MYTHIC_LEVEL and Relic at RELIC_LEVEL; until then they drop one step lower. */
export function capRarity(rarity: GearRarity, wayfarerLevel: number): GearRarity {
  if (rarity === 'relic' && wayfarerLevel < RELIC_LEVEL) rarity = 'mythic';
  if (rarity === 'mythic' && wayfarerLevel < MYTHIC_LEVEL) rarity = 'rare';
  return rarity;
}

/**
 * Rolls a find, or null for none. The first ever win always drops something, and empty
 * slots are favoured, so a new Wayfarer fills out their gear early.
 */
export function rollGear(
  source: GearSource,
  wayfarerLevel: number,
  current: Partial<Record<Slot, GearItem>>,
  rand: () => number = Math.random,
): { slot: Slot; rarity: GearRarity } | null {
  const empty = SLOTS.filter((slot) => !current[slot]);
  const chance = empty.length === SLOTS.length && source.kind === 'foe' ? 1 : dropTable(source).chance;
  if (rand() >= chance) return null;
  const weights = dropTable(source).weights as Record<GearRarity, number>;
  const rarity = capRarity(weightedPick(weights, rand()), wayfarerLevel);
  const pool = empty.length && rand() < 0.6 ? empty : SLOTS;
  return { slot: pool[Math.floor(rand() * pool.length)], rarity };
}

/** What melting a piece gives: its slot's material, more for rarer pieces. */
export const MELT: Record<GearRarity, number> = { worn: 2, fine: 3, rare: 5, mythic: 8, relic: 12 };
export const meltValue = (slot: Slot, rarity: GearRarity) => ({ material: SLOT_DEFS[slot].material, amount: MELT[rarity] });

/** A found piece replaces the worn one only when it is rarer. */
export const isBetter = (rarity: GearRarity, current?: GearItem) => !current || rank(rarity) > rank(current.rarity);

/** Every bonus the equipped gear adds, as multipliers or flat numbers. */
export interface GearBonuses {
  /** Multiplies pet attack (1 = no change). */
  petDamage: number;
  petHealth: number;
  stride: number;
  reachM: number;
  catchBonus: number;
  /** Extra pet damage that only applies at night. */
  nightDamage: number;
}

export function gearBonuses(equipped: GearItem[]): GearBonuses {
  const b: GearBonuses = { petDamage: 1, petHealth: 1, stride: 1, reachM: 0, catchBonus: 0, nightDamage: 0 };
  for (const item of equipped) {
    const p = power(item);
    if (item.slot === 'staff') b.petDamage += p * PER_POWER.staff;
    if (item.slot === 'cloak') b.petHealth += p * PER_POWER.cloak;
    if (item.slot === 'boots') b.stride += p * PER_POWER.boots;
    if (item.slot === 'lantern') b.reachM += p * PER_POWER.lantern;
    if (item.slot === 'charm') b.catchBonus += p * PER_POWER.charm;
    for (const rune of item.runes) {
      if (rune === 'nightfang') b.nightDamage += 0.2;
      // Once sped up eggs; the id stays so runes already found keep working.
      if (rune === 'hatchstone') b.catchBonus += 0.15;
      if (rune === 'swiftsole') b.stride += 0.1;
      if (rune === 'seer') b.reachM += 10;
      if (rune === 'warding') b.petHealth += 0.1;
    }
  }
  return b;
}

/** Night for the game is 20:00 to 06:00 local time. */
export const isNight = (now = Date.now()) => {
  const h = new Date(now).getHours();
  return h >= 20 || h < 6;
};
