import { hashString, seededRandom, weightedPick } from './rng';
import type { Rarity, Spawn } from './spawns';
import { SPAWN_WINDOW_MS, spawnWindow } from './spawns';

/** A street corner tied by walking a Knot, where a creature always waits. */
export interface Waymark {
  id: string;
  lng: number;
  lat: number;
  setAt: number;
}

export const MAX_WAYMARKS = 5;

const WAYMARK_RARITY: Record<Rarity, number> = { common: 40, uncommon: 34, rare: 18, epic: 6.5, legendary: 1.5 };

/** The creature that always waits at a Waymark: one per 15-minute window, a little rarer than the wild. */
export function waymarkSpawn(w: Waymark, time: number): Spawn {
  const window = spawnWindow(time);
  const rand = seededRandom(hashString(`waymark:${w.id}:${window}`));
  return {
    id: `wm:${w.id}:${window}`,
    lat: w.lat,
    lng: w.lng,
    seed: Math.floor(rand() * 2 ** 32) >>> 0,
    rarity: weightedPick(WAYMARK_RARITY, rand()),
    expiresAt: (window + 1) * SPAWN_WINDOW_MS,
  };
}
