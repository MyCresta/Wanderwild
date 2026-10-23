import { hashString, seededRandom, weightedPick } from './rng';
import type { Rarity } from './spawns';

/**
 * Wild eggs hatch after you walk 2, 5 or 10 km with them; longer eggs hold
 * rarer creatures. Hatchlings wait in the save for the creatures code to claim.
 */

export type EggKm = 2 | 5 | 10;
export const EGG_SLOTS = 3;
/** Chance a shrine gives an egg once eggs are unlocked. */
export const EGG_SHRINE_CHANCE = 0.3;

export interface Egg {
  id: string;
  km: EggKm;
  seed: number;
  walkedM: number;
  foundAt: number;
}

export interface Hatchling {
  seed: number;
  rarity: Rarity;
  fromKm: EggKm;
  hatchedAt: number;
}

const RARITY_BY_KM: Record<EggKm, Record<Rarity, number>> = {
  2: { common: 70, uncommon: 25, rare: 5, epic: 0, legendary: 0 },
  5: { common: 30, uncommon: 45, rare: 20, epic: 5, legendary: 0 },
  10: { common: 0, uncommon: 30, rare: 45, epic: 20, legendary: 5 },
};

export function rollEgg(source: string, now: number): Egg {
  const seed = hashString(`egg:${source}:${now}`);
  const km = Number(weightedPick({ '2': 60, '5': 30, '10': 10 }, seededRandom(seed)())) as EggKm;
  return { id: `egg:${seed.toString(36)}`, km, seed, walkedM: 0, foundAt: now };
}

export function hatchRarity(egg: Egg): Rarity {
  const rand = seededRandom(egg.seed ^ 0x9e3779b9);
  rand();
  return weightedPick(RARITY_BY_KM[egg.km], rand());
}

/** Adds walked distance to every egg and returns the ones that hatched (removed from the list). */
export function walkEggs(eggs: Egg[], metres: number, now: number): Hatchling[] {
  const hatched: Hatchling[] = [];
  for (let i = eggs.length - 1; i >= 0; i--) {
    const egg = eggs[i];
    egg.walkedM += metres;
    if (egg.walkedM >= egg.km * 1000) {
      hatched.unshift({ seed: egg.seed, rarity: hatchRarity(egg), fromKm: egg.km, hatchedAt: now });
      eggs.splice(i, 1);
    }
  }
  return hatched;
}
