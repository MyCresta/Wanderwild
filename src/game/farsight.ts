import { cellsAround, type Cell } from './cells';
import { REALMS, type MaterialId, type RealmId } from './realms';
import { hashString, seededRandom, weightedPick } from './rng';

/**
 * Farsight: play from the sofa. The Wayfarer's lantern-eye drifts wherever the map is
 * dragged, and there they can sketch Wildlings, fight Blotspawn and pick up curios.
 * Walking stays the better deal: anything done by Farsight pays FARSIGHT_SHARE of what
 * the same deed pays on foot, and glyphs, shrines and hunts still need feet.
 */

/** Share of XP and curio loot paid for deeds done by Farsight rather than in person. */
export const FARSIGHT_SHARE = 0.5;

// ---- Curios: small finds scattered over the map, a fresh set every day ----

export const CURIO_CELL_M = 120;
export const CURIO_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Chance a curio cell holds a find on a given day. */
const CURIO_CHANCE = 0.4;

export type CurioKind = 'cache' | 'bundle' | 'page' | 'cairn';

export const CURIO_KINDS: Record<CurioKind, { name: string; blurb: string }> = {
  cache: { name: 'Lost coin cache', blurb: 'A pouch someone buried and forgot.' },
  bundle: { name: 'Forager’s bundle', blurb: 'Gathered goods of the realm, tied with twine.' },
  page: { name: 'Torn map page', blurb: 'A scrap of an older Wayfarer’s chart.' },
  cairn: { name: 'Wayfarer’s cairn', blurb: 'Stones stacked by an older Wayfarer, with Wanderlight tucked beneath.' },
};

const KIND_WEIGHTS: Record<CurioKind, number> = { cache: 35, bundle: 30, page: 25, cairn: 10 };

export interface Curio {
  /** Unique per cell and day; remembered once found. */
  id: string;
  kind: CurioKind;
  lat: number;
  lng: number;
  seed: number;
  /** When this day's curios are swept away. */
  expiresAt: number;
}

export interface CurioReward {
  coin: number;
  xp: number;
  wanderlight: number;
  materials: Partial<Record<MaterialId, number>>;
}

export const curioWindow = (time: number) => Math.floor(time / CURIO_WINDOW_MS);

export function curioInCell(cell: Cell, window: number): Curio | null {
  const rand = seededRandom(hashString(`curio:${cell.id}:${window}`));
  if (rand() >= CURIO_CHANCE) return null;
  return {
    id: `${cell.id}:${window}`,
    kind: weightedPick(KIND_WEIGHTS, rand()),
    lat: cell.south + (cell.north - cell.south) * (0.15 + 0.7 * rand()),
    lng: cell.west + (cell.east - cell.west) * (0.15 + 0.7 * rand()),
    seed: Math.floor(rand() * 2 ** 32) >>> 0,
    expiresAt: (window + 1) * CURIO_WINDOW_MS,
  };
}

/** Today's curios in the cells around a point, leaving out ones already found. */
export function curiosNear(lat: number, lng: number, time: number, found: Record<string, number> = {}, radiusCells = 2): Curio[] {
  const window = curioWindow(time);
  return cellsAround(lat, lng, CURIO_CELL_M, radiusCells)
    .map((cell) => curioInCell(cell, window))
    .filter((c): c is Curio => !!c && !(c.id in found));
}

/** What a curio holds: full on foot, FARSIGHT_SHARE of it (at least 1 of each) by Farsight. */
export function curioReward(curio: Curio, realm: RealmId, onFoot: boolean): CurioReward {
  const rand = seededRandom(curio.seed);
  const share = (n: number) => (n <= 0 ? 0 : onFoot ? n : Math.max(1, Math.round(n * FARSIGHT_SHARE)));
  const base: CurioReward = { coin: 0, xp: 0, wanderlight: 0, materials: {} };
  switch (curio.kind) {
    case 'cache':
      base.coin = 8 + Math.floor(rand() * 13);
      break;
    case 'bundle':
      base.materials = { [REALMS[realm].material]: 2 + Math.floor(rand() * 3) };
      break;
    case 'page':
      base.xp = 60 + Math.floor(rand() * 61);
      break;
    case 'cairn':
      base.wanderlight = 1 + Math.floor(rand() * 2);
      break;
  }
  return {
    coin: share(base.coin),
    xp: share(base.xp),
    wanderlight: share(base.wanderlight),
    materials: Object.fromEntries(Object.entries(base.materials).map(([id, n]) => [id, share(n)])),
  };
}
