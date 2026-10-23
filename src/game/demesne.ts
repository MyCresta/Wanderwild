import { centroid, project, type Glyph, type LngLat } from './glyphs';
import { pointInPolygon, REALMS, type MaterialId, type RealmId } from './realms';
import { hashString, seededRandom, weightedPick } from './rng';
import type { Rarity, Spawn } from './spawns';
import { SPAWN_WINDOW_MS, spawnWindow } from './spawns';

/**
 * The Inked Demesne: land the Wayfarer has walked a Ring around. Each parcel slowly
 * yields the materials of the realms inside it, and its ink fades over a week unless
 * the border is walked again.
 */

export interface Parcel {
  id: string;
  name: string;
  /** Simplified border, longitude/latitude, not closed. */
  polygon: LngLat[];
  centroid: LngLat;
  areaM2: number;
  perimeterM: number;
  /** Share of the parcel in each realm, summing to 1. */
  realms: Partial<Record<RealmId, number>>;
  claimedAt: number;
  /** When the ink was last full; it fades from here. */
  inkedAt: number;
  lastTick: number;
  /** Production waiting to be collected, fractional. */
  stored: Partial<Record<MaterialId, number>>;
  /** Pet uids living here (Marginalia). */
  residents: string[];
}

export interface LeyLine {
  id: string;
  from: LngLat;
  to: LngLat;
  until: number;
}

export interface Waymark {
  id: string;
  lng: number;
  lat: number;
  setAt: number;
}

export const DEMESNE_LEVEL = 1;
export const INK_FADE_MS = 7 * 24 * 3600 * 1000;
/** Walking within this distance of a border re-inks it. */
export const BORDER_REACH_M = 25;
/** Walking half the border restores full ink. */
const REINK_SHARE = 0.5;
export const PARCEL_STORAGE_MS = 8 * 3600 * 1000;
export const LEY_MS = 24 * 3600 * 1000;
export const LEY_REACH_M = 300;
export const LEY_BONUS = 1.5;
export const MAX_LEY_LINES = 8;
export const MAX_WAYMARKS = 5;
export const RESIDENT_BONUS = 0.2;
export const MAX_RESIDENTS = 3;
/** Small parcels are not worth holding; tiny rings still count as glyphs but claim nothing. */
export const MIN_PARCEL_M2 = 2_000;

export const maxParcels = (level: number) => 3 + Math.floor(level / 5);

const NAME_FIRST = ['Moss', 'Ember', 'Lantern', 'Thistle', 'Gloam', 'Bramble', 'Hollow', 'Wren', 'Copper', 'Mist', 'Rook', 'Fern', 'Ash', 'Willow', 'Quill', 'Cinder'];
const NAME_SECOND = ['light', 'wick', 'mere', 'fold', 'hollow', 'wold', 'brook', 'gate', 'stead', 'hythe', 'croft', 'leigh'];
const NAME_FORM = ['Holding', 'Acre', 'Close', 'Glebe', 'March', 'Garth', 'Reach', 'Ward'];

export function parcelName(seed: number): string {
  const r = seededRandom(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  // "Moss" + "stead" would spell three s in a row.
  return `${pick(NAME_FIRST)}${pick(NAME_SECOND)}`.replace(/(.)\1\1/g, '$1$1') + ` ${pick(NAME_FORM)}`;
}

/** Ink left, 1 when freshly walked and 0 once faded. */
export function inkAt(p: Parcel, now: number): number {
  return Math.max(0, Math.min(1, 1 - (now - p.inkedAt) / INK_FADE_MS));
}

/** Materials per hour at full ink, before ley lines and residents. */
export function baseRate(p: Pick<Parcel, 'areaM2'>): number {
  // A city block (~1 ha) gives 3 an hour; growth slows for big parcels so huge rings are not everything.
  return 1 + 2 * Math.sqrt(p.areaM2 / 10_000);
}

export function parcelMultiplier(p: Parcel, leyLines: LeyLine[], now: number): number {
  const ley = leyLines.some((l) => l.until > now && leyNear(l, p.centroid)) ? LEY_BONUS : 1;
  return ley * (1 + RESIDENT_BONUS * Math.min(MAX_RESIDENTS, p.residents.length));
}

/** Materials per hour right now, across all realms in the parcel. */
export function parcelRate(p: Parcel, leyLines: LeyLine[], now: number): number {
  return baseRate(p) * inkAt(p, now) * parcelMultiplier(p, leyLines, now);
}

const storedTotal = (p: Parcel) => Object.values(p.stored).reduce((a, b) => a + (b ?? 0), 0);

/** Banks production from `lastTick` to `now`, plus `extraMs` of stride-boosted time. */
export function tickParcel(p: Parcel, leyLines: LeyLine[], now: number, extraMs = 0): void {
  const elapsed = Math.max(0, now - p.lastTick) + extraMs;
  p.lastTick = Math.max(p.lastTick, now);
  if (elapsed <= 0) return;
  // Ink fades linearly, so the midpoint value is the exact average over the interval.
  const mid = now - Math.min(elapsed, now - p.inkedAt) / 2;
  const rate = baseRate(p) * inkAt(p, mid) * parcelMultiplier(p, leyLines, now);
  const cap = baseRate(p) * parcelMultiplier(p, leyLines, now) * (PARCEL_STORAGE_MS / 3_600_000);
  let room = Math.max(0, cap - storedTotal(p));
  const made = Math.min(room, (rate * elapsed) / 3_600_000);
  if (made <= 0) return;
  for (const [realm, share] of Object.entries(p.realms) as [RealmId, number][]) {
    const material = REALMS[realm].material;
    const add = Math.min(room, made * share);
    p.stored[material] = (p.stored[material] ?? 0) + add;
    room -= add;
  }
}

/** Takes the whole units waiting in a parcel; fractions stay for next time. */
export function collectParcel(p: Parcel): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = {};
  for (const [id, n] of Object.entries(p.stored) as [MaterialId, number][]) {
    const whole = Math.floor(n);
    if (whole <= 0) continue;
    out[id] = whole;
    p.stored[id] = n - whole;
  }
  return out;
}

export function isFull(p: Parcel, leyLines: LeyLine[], now: number): boolean {
  return storedTotal(p) >= baseRate(p) * parcelMultiplier(p, leyLines, now) * (PARCEL_STORAGE_MS / 3_600_000) - 0.01;
}

/** Points spread over the parcel, for asking the map which realm each one is in. */
export function samplePoints(polygon: LngLat[], wanted = 25): LngLat[] {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ring = { type: 'Polygon' as const, coordinates: [[...polygon, polygon[0]]] };
  const steps = Math.ceil(Math.sqrt(wanted * 1.6));
  const out: LngLat[] = [];
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < steps; j++) {
      const lng = w + ((i + 0.5) / steps) * (e - w);
      const lat = s + ((j + 0.5) / steps) * (n - s);
      if (pointInPolygon(lng, lat, ring)) out.push([lng, lat]);
    }
  return out.length ? out : [centroidOf(polygon)];
}

function centroidOf(polygon: LngLat[]): LngLat {
  const origin = { lng: polygon[0][0], lat: polygon[0][1] };
  const c = centroid(polygon.map(([lng, lat]) => project(origin, { lng, lat })));
  const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return [origin.lng + c[0] / kx, origin.lat + c[1] / 111_320];
}

/** Turns realm counts from sample points into shares summing to 1. */
export function realmShares(samples: (RealmId | undefined)[], fallback: RealmId): Partial<Record<RealmId, number>> {
  const counts: Partial<Record<RealmId, number>> = {};
  let total = 0;
  for (const r of samples) {
    if (!r) continue;
    counts[r] = (counts[r] ?? 0) + 1;
    total++;
  }
  if (!total) return { [fallback]: 1 };
  for (const r of Object.keys(counts) as RealmId[]) counts[r] = counts[r]! / total;
  return counts;
}

const ringGeometry = (polygon: LngLat[]) => ({ type: 'Polygon' as const, coordinates: [[...polygon, polygon[0]]] });

/** True when two parcels are mostly the same land: either middle lies inside the other. */
export function overlaps(a: Pick<Parcel, 'polygon' | 'centroid'>, b: Pick<Parcel, 'polygon' | 'centroid'>): boolean {
  return pointInPolygon(a.centroid[0], a.centroid[1], ringGeometry(b.polygon)) || pointInPolygon(b.centroid[0], b.centroid[1], ringGeometry(a.polygon));
}

export function newParcel(ring: Glyph, realms: Partial<Record<RealmId, number>>, now: number): Parcel {
  const seed = hashString(`parcel:${ring.center[0].toFixed(4)}:${ring.center[1].toFixed(4)}`);
  return {
    id: `p${seed.toString(36)}${now.toString(36)}`,
    name: parcelName(seed),
    polygon: ring.path,
    centroid: ring.center,
    areaM2: ring.areaM2 ?? 0,
    perimeterM: ring.lengthM,
    realms,
    claimedAt: now,
    inkedAt: now,
    lastTick: now,
    stored: {},
    residents: [],
  };
}

/** Metres from a point to the nearest edge of a parcel's border. */
export function borderDistanceM(p: Pick<Parcel, 'polygon'>, lng: number, lat: number): number {
  const here = { lng, lat };
  const xy = p.polygon.map(([pLng, pLat]) => project(here, { lng: pLng, lat: pLat }));
  let best = Infinity;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, (-a[0] * dx - a[1] * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx, a[1] + t * dy));
  }
  return best;
}

/** Walking `metres` along a border pushes its ink back towards full. Returns true if it changed. */
export function reink(p: Parcel, metres: number, now: number): boolean {
  if (p.inkedAt >= now) return false;
  const restoreMs = (metres / Math.max(50, p.perimeterM * REINK_SHARE)) * INK_FADE_MS;
  p.inkedAt = Math.min(now, p.inkedAt + restoreMs);
  return true;
}

export function leyNear(l: Pick<LeyLine, 'from' | 'to'>, at: LngLat): boolean {
  const here = { lng: at[0], lat: at[1] };
  const a = project(here, { lng: l.from[0], lat: l.from[1] });
  const b = project(here, { lng: l.to[0], lat: l.to[1] });
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, (-a[0] * dx - a[1] * dy) / len2)) : 0;
  return Math.hypot(a[0] + t * dx, a[1] + t * dy) <= LEY_REACH_M;
}

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
