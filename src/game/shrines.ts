import { hashString, seededRandom } from './rng';
import { REALMS, type MaterialId, type RealmId } from './realms';

/**
 * Wayshrines are real points of interest (churches, libraries, statues, viewpoints).
 * Touch one within reach for coin, XP, materials and a blessing. Each shrine answers
 * once a day, and each kind of shrine blesses something different for half an hour.
 */

export const BLESSING_MS = 30 * 60 * 1000;

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

export interface Blessing {
  name: string;
  /** What it does, short enough for a toast. */
  effect: string;
  /** A one-character mark for the tiny badge on the level ring. */
  mark: string;
}

/** Blessings by shrine kind. One lasts at a time; a newer one replaces it. */
export const BLESSINGS: Record<ShrineKind, Blessing> = {
  chapel: { name: 'Grace', effect: '+10% befriending', mark: '✦' },
  archive: { name: 'Insight', effect: '+10% XP', mark: '✎' },
  monument: { name: 'Valour', effect: 'Wildlings hit 10% harder', mark: '⚔' },
  vista: { name: 'Far Eye', effect: '+20 m reach', mark: '◎' },
  hall: { name: 'Hearth', effect: '+25% Hearthstead time from walking', mark: '⌂' },
};

/** Insight's XP multiplier. */
export const INSIGHT_XP = 1.1;

/** Next local midnight: a touched shrine wakes again then. */
export function nextMorning(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

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

/** What touching a shrine gives, seeded by the shrine and the day. */
export function rollShrineReward(shrine: Shrine, realm: RealmId, now: number): ShrineReward {
  const rand = seededRandom(hashString(`${shrine.id}:${nextMorning(now)}`));
  const materials: Partial<Record<MaterialId, number>> = { [REALMS[realm].material]: 1 + Math.floor(rand() * 3) };
  if (rand() < 0.25) materials.shrineRelic = 1;
  return { coin: 15 + Math.floor(rand() * 21), xp: 100, materials };
}
