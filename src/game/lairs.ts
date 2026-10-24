import { cellsAround } from './cells';
import { hashString, seededRandom, weightedPick } from './rng';
import type { Spawn } from './spawns';
import { bossLevel, pickTraits } from '../creatures/foes';
import { MONSTERS } from '../creatures/species';
import type { Encounter } from '../creatures/stats';

/**
 * Boss lairs: a big Blotspawn settles in about one in two ~1.2 km squares for a week. Its
 * tier sets a lowest level and it rises to meet a stronger party, so every lair is
 * something to prepare for: bring pets strong against it, a full party and tonics.
 */

export const LAIR_CELL_M = 1200;
export const LAIR_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LAIR_CHANCE = 0.5;
const TIER_WEIGHTS = { '1': 30, '2': 26, '3': 20, '4': 14, '5': 10 };

export interface Lair {
  spawn: Spawn;
  encounter: Encounter;
}

export const lairWeek = (time: number) => Math.floor(time / LAIR_WEEK_MS);

/** The lairs in the squares around a point this week, risen to the level of the player's strongest pet. */
export function lairsNear(lat: number, lng: number, time: number, strongestPet = 1, radiusCells = 1): Lair[] {
  const week = lairWeek(time);
  const lairs: Lair[] = [];
  for (const cell of cellsAround(lat, lng, LAIR_CELL_M, radiusCells)) {
    const rand = seededRandom(hashString(`lair:${cell.id}:${week}`));
    if (rand() >= LAIR_CHANCE) continue;
    const tier = Number(weightedPick(TIER_WEIGHTS, rand()));
    const species = MONSTERS[Math.floor(rand() * MONSTERS.length)];
    const seed = Math.floor(rand() * 2 ** 32) >>> 0;
    const spawn: Spawn = {
      id: `lair:${cell.id}:${week}`,
      lat: cell.south + (cell.north - cell.south) * (0.2 + 0.6 * rand()),
      lng: cell.west + (cell.east - cell.west) * (0.2 + 0.6 * rand()),
      seed,
      rarity: 'legendary',
      expiresAt: (week + 1) * LAIR_WEEK_MS,
    };
    const encounter: Encounter = { species, level: bossLevel(tier, strongestPet), seed, rank: 'boss', tier, traits: pickTraits(rand, 3) };
    lairs.push({ spawn, encounter });
  }
  return lairs;
}
