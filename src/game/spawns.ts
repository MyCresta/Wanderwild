import { cellsAround, type Cell } from './cells';
import { hashString, seededRandom, weightedPick } from './rng';
import type { RealmId } from './realms';

/**
 * Shared spawns without a server: every spawn is derived from its map cell and the
 * current 15-minute window, so two people standing together see the same creature
 * and reopening the app cannot reroll it.
 */

export const SPAWN_CELL_M = 150;
export const SPAWN_WINDOW_MS = 15 * 60 * 1000;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

const RARITY_WEIGHTS: Record<Rarity, number> = { common: 62, uncommon: 25, rare: 9, epic: 3.4, legendary: 0.6 };
// Chance of 0, 1, 2 or 3 spawns in a cell during one window.
const COUNT_WEIGHTS = { '0': 20, '1': 40, '2': 28, '3': 12 };

export interface Spawn {
  /** Unique per cell, window and slot; use it to remember a spawn was caught. */
  id: string;
  lat: number;
  lng: number;
  /** 32-bit seed for picking species, level and looks. */
  seed: number;
  rarity: Rarity;
  /** Filled in by the caller once the map knows what is under the spawn. */
  realm?: RealmId;
  /** Milliseconds since epoch when this spawn's window ends. */
  expiresAt: number;
}

export const spawnWindow = (time: number) => Math.floor(time / SPAWN_WINDOW_MS);

export function spawnsInCell(cell: Cell, window: number): Spawn[] {
  const rand = seededRandom(hashString(`spawn:${cell.id}:${window}`));
  const count = Number(weightedPick(COUNT_WEIGHTS, rand()));
  const spawns: Spawn[] = [];
  for (let slot = 0; slot < count; slot++) {
    spawns.push({
      id: `${cell.id}:${window}:${slot}`,
      lat: cell.south + (cell.north - cell.south) * (0.1 + 0.8 * rand()),
      lng: cell.west + (cell.east - cell.west) * (0.1 + 0.8 * rand()),
      seed: Math.floor(rand() * 2 ** 32) >>> 0,
      rarity: weightedPick(RARITY_WEIGHTS, rand()),
      expiresAt: (window + 1) * SPAWN_WINDOW_MS,
    });
  }
  return spawns;
}

/** Every spawn in the player's cell and the cells around it at `time`. */
export function spawnsNear(lat: number, lng: number, time: number, radiusCells = 2): Spawn[] {
  const window = spawnWindow(time);
  return cellsAround(lat, lng, SPAWN_CELL_M, radiusCells).flatMap((cell) => spawnsInCell(cell, window));
}
