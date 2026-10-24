import { hashString, seededRandom, weightedPick } from './rng';
import type { MaterialId } from './realms';

/**
 * Gear is for the Wayfarer, not the pets. Each of the five slots strengthens a different
 * part of the game, and each is made from a material found in a different kind of place,
 * so upgrading gear means exploring.
 */

export type Slot = 'staff' | 'cloak' | 'boots' | 'lantern' | 'charm';
export type GearRarity = 'worn' | 'fine' | 'rare' | 'mythic' | 'relic';
export type RuneId = 'nightfang' | 'hatchstone' | 'swiftsole' | 'seer' | 'warding';

export const SLOTS: Slot[] = ['staff', 'cloak', 'boots', 'lantern', 'charm'];
export const FORGE_LEVEL = 5;
export const RUNE_LEVEL = 15;
export const MYTHIC_LEVEL = 30;

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
  staff: { name: 'Staff', material: 'ironbark', effect: (p) => `${pct(p * PER_POWER.staff)} Wildling damage` },
  cloak: { name: 'Cloak', material: 'mistwool', effect: (p) => `${pct(p * PER_POWER.cloak)} party health` },
  boots: { name: 'Boots', material: 'cobbleOre', effect: (p) => `${pct(p * PER_POWER.boots)} stride boost and Wanderlight` },
  lantern: { name: 'Lantern', material: 'gravemoss', effect: (p) => `+${Math.round(p * PER_POWER.lantern)} m reach` },
  charm: { name: 'Charm', material: 'shrineRelic', effect: (p) => `${pct(p * PER_POWER.charm)} shorter walk to befriend` },
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
  hatchstone: { name: 'Hatchstone', blurb: 'Eggs hatch 15% sooner' },
  swiftsole: { name: 'Swiftsole', blurb: '+10% stride boost' },
  seer: { name: 'Seer', blurb: '+10 m reach' },
  warding: { name: 'Warding', blurb: '+10% party health' },
};
export const RUNE_IDS = Object.keys(RUNES) as RuneId[];

export interface GearItem {
  id: string;
  slot: Slot;
  rarity: GearRarity;
  /** Upgrade level, +0 to +10. */
  plus: number;
  runes: RuneId[];
}

export const maxPlus = (wayfarerLevel: number) => (wayfarerLevel >= RUNE_LEVEL ? 10 : 5);
/** Rune sockets open at +5 and +10. */
export const runeSockets = (item: GearItem) => (item.plus >= 10 ? 2 : item.plus >= 5 ? 1 : 0);
export const power = (item: GearItem) => RARITIES[item.rarity].power * (1 + 0.15 * item.plus);

export function craftCost(slot: Slot): { coin: number; material: MaterialId; amount: number } {
  return { coin: 60, material: SLOT_DEFS[slot].material, amount: slot === 'charm' ? 2 : 8 };
}

export function upgradeCost(item: GearItem): { coin: number; material: MaterialId; amount: number } {
  const n = item.plus + 1;
  return {
    coin: Math.round(30 * n ** 1.6),
    material: SLOT_DEFS[item.slot].material,
    amount: item.slot === 'charm' ? Math.ceil(n / 2) : 3 * n,
  };
}

/** Crafts an item with a random rarity; Mythic needs Wayfarer level 30. */
export function craftItem(slot: Slot, wayfarerLevel: number, seed: number): GearItem {
  const rand = seededRandom(seed);
  const weights = { worn: 58, fine: 30, rare: 10, mythic: wayfarerLevel >= MYTHIC_LEVEL ? 2 : 0 };
  return { id: `gear:${seed.toString(36)}`, slot, rarity: weightedPick(weights, rand()), plus: 0, runes: [] };
}

export const newGearSeed = (salt: string) => hashString(`${salt}:${Date.now()}:${Math.random()}`);

/** Every bonus the equipped gear adds, as multipliers or flat numbers. */
export interface GearBonuses {
  /** Multiplies pet attack (1 = no change). */
  petDamage: number;
  petHealth: number;
  stride: number;
  reachM: number;
  catchBonus: number;
  eggSpeed: number;
  /** Extra pet damage that only applies at night. */
  nightDamage: number;
}

export function gearBonuses(equipped: GearItem[]): GearBonuses {
  const b: GearBonuses = { petDamage: 1, petHealth: 1, stride: 1, reachM: 0, catchBonus: 0, eggSpeed: 1, nightDamage: 0 };
  for (const item of equipped) {
    const p = power(item);
    if (item.slot === 'staff') b.petDamage += p * PER_POWER.staff;
    if (item.slot === 'cloak') b.petHealth += p * PER_POWER.cloak;
    if (item.slot === 'boots') b.stride += p * PER_POWER.boots;
    if (item.slot === 'lantern') b.reachM += p * PER_POWER.lantern;
    if (item.slot === 'charm') b.catchBonus += p * PER_POWER.charm;
    for (const rune of item.runes) {
      if (rune === 'nightfang') b.nightDamage += 0.2;
      if (rune === 'hatchstone') b.eggSpeed += 0.15;
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
