import { hashString, mulberry32 } from './rng';
import type { RealmId, SpawnRarity } from './stats';

/**
 * Stand-in for the shared spawn system (src/game/spawns.ts on the roadmap branch), with the
 * same shape, so creatures can be found before that lands. Spawns are deterministic: a
 * ~130 m grid cell and a 15-minute window decide what appears, so two visits to the same
 * corner at the same time see the same creatures.
 */
export interface Spawn {
  id: string;
  lat: number;
  lng: number;
  seed: number;
  rarity: SpawnRarity;
  realm?: RealmId;
  expiresAt: number;
}

const CELL_DEG = 0.0012;
const WINDOW_MS = 15 * 60 * 1000;

export function spawnsNear(lat: number, lng: number, time: number, radiusCells = 1): Spawn[] {
  const window = Math.floor(time / WINDOW_MS);
  const lngCell = CELL_DEG / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const cy = Math.floor(lat / CELL_DEG);
  const cx = Math.floor(lng / lngCell);
  const spawns: Spawn[] = [];
  for (let dy = -radiusCells; dy <= radiusCells; dy++)
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const rng = mulberry32(hashString(`${x}:${y}:${window}`));
      const roll = rng();
      const count = roll < 0.3 ? 0 : roll < 0.8 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const r = rng();
        spawns.push({
          id: `${x}:${y}:${window}:${i}`,
          lat: (y + 0.1 + rng() * 0.8) * CELL_DEG,
          lng: (x + 0.1 + rng() * 0.8) * lngCell,
          seed: Math.floor(rng() * 2 ** 32),
          rarity: r < 0.7 ? 'common' : r < 0.92 ? 'uncommon' : 'rare',
          expiresAt: (window + 1) * WINDOW_MS,
        });
      }
    }
  return spawns;
}
