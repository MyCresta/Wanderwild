import { haversine } from '../geo/distance';
import { FARSIGHT_SHARE } from './farsight';
import { dayKey } from './hearthstead';
import { REALMS, type MaterialId, type RealmId } from './realms';
import { hashString, seededRandom } from './rng';

/**
 * The daily wander trail: each morning three ink marks are drawn within about a kilometre
 * of where the Wayfarer first stands, in a loop around them. Reaching all three opens a
 * chest at the last one. One mark a day may be peeked by Farsight, for a smaller chest.
 */

export const TRAIL_MARKS = 3;
const MIN_M = 250;
const MAX_M = 700;
/** Travelling this far from an untouched trail draws a new one where you are. */
const REDRAW_M = 5000;

export interface TrailMark {
  lat: number;
  lng: number;
  /** How the mark was reached, once it has been. */
  reached?: 'foot' | 'farsight';
}

export interface Trail {
  /** The local day the trail was drawn for. */
  day: string;
  origin: { lat: number; lng: number };
  marks: TrailMark[];
  opened: boolean;
}

export interface TrailChest {
  coin: number;
  xp: number;
  wanderlight: number;
  materials: Partial<Record<MaterialId, number>>;
  /** True when a mark was peeked by Farsight, which makes the chest smaller. */
  peeked: boolean;
}

/** A point `metres` from `from` on a compass bearing in degrees. */
export function offset(from: { lat: number; lng: number }, bearing: number, metres: number): { lat: number; lng: number } {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (metres * Math.cos(rad)) / 111_320;
  const dLng = (metres * Math.sin(rad)) / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

/** Draws a day's trail: three marks spread round the compass, so the walk makes a loop. */
export function drawTrail(origin: { lat: number; lng: number }, now = Date.now()): Trail {
  const day = dayKey(now);
  const rand = seededRandom(hashString(`trail:${day}:${origin.lat.toFixed(3)}:${origin.lng.toFixed(3)}`));
  const start = rand() * 360;
  const marks = Array.from({ length: TRAIL_MARKS }, (_, i) =>
    offset(origin, start + (i * 360) / TRAIL_MARKS + (rand() - 0.5) * 60, MIN_M + rand() * (MAX_M - MIN_M)),
  );
  return { day, origin: { lat: origin.lat, lng: origin.lng }, marks, opened: false };
}

/** Today's trail: the saved one while it is still today's, or a fresh one drawn here. */
export function trailToday(trail: Trail | null, at: { lat: number; lng: number }, now = Date.now()): Trail {
  if (trail && trail.day === dayKey(now)) {
    const touched = trail.marks.some((m) => m.reached);
    if (touched || haversine(trail.origin, at) < REDRAW_M) return trail;
  }
  return drawTrail(at, now);
}

export const marksReached = (trail: Trail) => trail.marks.filter((m) => m.reached).length;
export const trailDone = (trail: Trail) => marksReached(trail) === trail.marks.length;
export const peekUsed = (trail: Trail) => trail.marks.some((m) => m.reached === 'farsight');

/** Marks a trail mark reached. Only one a day may be peeked by Farsight. Returns whether it counted. */
export function reachMark(trail: Trail, index: number, how: 'foot' | 'farsight'): boolean {
  const mark = trail.marks[index];
  if (!mark || mark.reached) return false;
  if (how === 'farsight' && peekUsed(trail)) return false;
  mark.reached = how;
  return true;
}

/** The chest at the end: full when every mark was walked, a peeked mark pays FARSIGHT_SHARE of its part. */
export function trailChest(trail: Trail, realm: RealmId): TrailChest {
  const rand = seededRandom(hashString(`trail-chest:${trail.day}:${trail.origin.lat}:${trail.origin.lng}`));
  const parts = trail.marks.reduce((sum, m) => sum + (m.reached === 'farsight' ? FARSIGHT_SHARE : m.reached ? 1 : 0), 0);
  const k = parts / trail.marks.length;
  const scale = (n: number) => Math.max(1, Math.round(n * k));
  return {
    coin: scale(50 + Math.floor(rand() * 31)),
    xp: scale(300),
    wanderlight: scale(3),
    materials: { [REALMS[realm].material]: scale(4 + Math.floor(rand() * 3)) },
    peeked: peekUsed(trail),
  };
}
