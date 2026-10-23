import { hashString, seededRandom } from './rng';
import { REALMS, type MaterialId, type RealmId } from './realms';

/**
 * Wayshrines are real points of interest (churches, libraries, statues, viewpoints).
 * Touch one within reach for coin, XP, materials and a short blessing.
 */

export const SHRINE_REACH_M = 40;
export const SHRINE_COOLDOWN_MS = 5 * 60 * 1000;
export const BLESSING_MS = 10 * 60 * 1000;
/** Walking XP multiplier while a blessing lasts. */
export const BLESSING_XP_BONUS = 1.25;

export type ShrineKind = 'chapel' | 'archive' | 'monument' | 'vista' | 'hall';

export interface Shrine {
  id: string;
  name: string;
  kind: ShrineKind;
  lat: number;
  lng: number;
}

/** OpenMapTiles poi class/subclass → shrine kind; anything else is not a shrine. */
const KIND_BY_TAG: Record<string, ShrineKind> = {
  place_of_worship: 'chapel',
  library: 'archive',
  museum: 'archive',
  art_gallery: 'archive',
  monument: 'monument',
  memorial: 'monument',
  statue: 'monument',
  artwork: 'monument',
  castle: 'monument',
  ruins: 'monument',
  viewpoint: 'vista',
  attraction: 'vista',
  fountain: 'vista',
  town_hall: 'hall',
};

export const KIND_TITLES: Record<ShrineKind, string> = {
  chapel: 'Chapel Shrine',
  archive: 'Archive Shrine',
  monument: 'Monument Shrine',
  vista: 'Vista Shrine',
  hall: 'Hall Shrine',
};

export function shrineKind(poiClass?: string, poiSubclass?: string): ShrineKind | undefined {
  return KIND_BY_TAG[poiSubclass ?? ''] ?? KIND_BY_TAG[poiClass ?? ''];
}

/** A stable id from the place's name and position (about 10 m precision). */
export function shrineId(name: string, lat: number, lng: number): string {
  return `shrine:${hashString(`${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`).toString(36)}`;
}

export interface ShrineReward {
  coin: number;
  xp: number;
  materials: Partial<Record<MaterialId, number>>;
}

/** What touching a shrine gives, seeded by the shrine and the cooldown slot. */
export function rollShrineReward(shrine: Shrine, realm: RealmId, now: number): ShrineReward {
  const rand = seededRandom(hashString(`${shrine.id}:${Math.floor(now / SHRINE_COOLDOWN_MS)}`));
  const materials: Partial<Record<MaterialId, number>> = { [REALMS[realm].material]: 1 + Math.floor(rand() * 3) };
  if (rand() < 0.25) materials.shrineRelic = 1;
  return { coin: 8 + Math.floor(rand() * 13), xp: 50, materials };
}
