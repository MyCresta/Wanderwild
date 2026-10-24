/**
 * Glyphwalking: the shape of a walk is a spell. The live trace is kept in memory only
 * (never saved, never sent anywhere) and is checked for three glyphs as it grows:
 *
 * - Ring: a closed loop of at least 250 m that is round enough. Can finish a companion's evolution.
 * - Stroke: 300 m or more walked almost dead straight.
 * - Knot: the same street corner (a ~25 m square) entered three times. Sets a Waymark.
 */

export type GlyphKind = 'ring' | 'stroke' | 'knot';
export type LngLat = [number, number];

export interface Glyph {
  kind: GlyphKind;
  at: number;
  /** Ring: the simplified loop. Stroke: start and end. Knot: the corner. */
  path: LngLat[];
  /** Ring: the loop's middle. Stroke: its midpoint. Knot: the corner. */
  center: LngLat;
  lengthM: number;
  /** Ring only. */
  areaM2?: number;
}

export interface TracePoint {
  lat: number;
  lng: number;
  time: number;
}

/** A gap longer than this starts a new trace. */
export const TRACE_GAP_MS = 20 * 60 * 1000;
/** Points closer than this to the last kept one are GPS jitter. */
const MIN_STEP_M = 8;
const MAX_POINTS = 600;

export const RING_CLOSE_M = 40;
export const RING_MIN_M = 250;
/** 4πA/P²: 1 for a circle, 0.785 for a square, 0.5 for a 4:1 block, near 0 for an out-and-back. */
export const RING_ROUNDNESS = 0.4;
export const STROKE_MIN_M = 300;
export const STROKE_STRAIGHTNESS = 0.9;
export const KNOT_CELL_M = 25;
export const KNOT_ENTRIES = 3;
/** Knot entries older than this do not count. */
const KNOT_WINDOW_MS = 15 * 60 * 1000;
/** The last stretch of path that cannot close a ring with the current point. */
const RING_SKIP_M = 60;

const M_PER_DEG_LAT = 111_320;

/** Flat-earth metres relative to `origin`; plenty accurate over a few kilometres. */
export function project(origin: { lat: number; lng: number }, p: { lat: number; lng: number }): [number, number] {
  const kx = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [(p.lng - origin.lng) * kx, (p.lat - origin.lat) * M_PER_DEG_LAT];
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pathLength(pts: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

/** Shoelace area of a closed ring of projected points. */
export function polygonArea(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

export function centroid(pts: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas–Peucker line simplification, keeping the end points. */
export function simplify<T extends [number, number]>(pts: T[], toleranceM: number): T[] {
  if (pts.length < 3) return pts.slice();
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segmentDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= toleranceM) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), toleranceM).slice(0, -1), ...simplify(pts.slice(at), toleranceM)];
}

/** Turns projected metres back into longitude and latitude. */
function unproject(origin: { lat: number; lng: number }, p: [number, number]): LngLat {
  const kx = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [origin.lng + p[0] / kx, origin.lat + p[1] / M_PER_DEG_LAT];
}

/** The ink trail being walked right now, and the glyphs it forms. */
export class Trace {
  points: TracePoint[] = [];
  /** Index of the first point a new Stroke may start from (after the last Stroke). */
  private strokeFrom = 0;
  private knotEntries = new Map<string, number[]>();
  private lastCell = '';

  /** The trail so far, for drawing it on the map. */
  get line(): LngLat[] {
    return this.points.map((p) => [p.lng, p.lat]);
  }

  reset(): void {
    this.points = [];
    this.strokeFrom = 0;
    this.knotEntries.clear();
    this.lastCell = '';
  }

  /** Adds a position and returns any glyphs it completed. */
  add(fix: TracePoint): Glyph[] {
    const last = this.points[this.points.length - 1];
    if (last && fix.time - last.time > TRACE_GAP_MS) this.reset();
    const prev = this.points[this.points.length - 1];
    if (prev && dist(project(prev, prev), project(prev, fix)) < MIN_STEP_M) return [];

    this.points.push({ lat: fix.lat, lng: fix.lng, time: fix.time });
    if (this.points.length > MAX_POINTS) {
      const drop = this.points.length - MAX_POINTS;
      this.points.splice(0, drop);
      this.strokeFrom = Math.max(0, this.strokeFrom - drop);
    }

    const found: Glyph[] = [];
    const knot = this.checkKnot(fix);
    if (knot) found.push(knot);
    const stroke = this.checkStroke();
    if (stroke) found.push(stroke);
    const ring = this.checkRing();
    if (ring) {
      found.push(ring);
      // A closed ring starts a fresh trail, so the same loop is not cast twice.
      const end = this.points[this.points.length - 1];
      this.points = [end];
      this.strokeFrom = 0;
    }
    return found;
  }

  private checkRing(): Glyph | null {
    const pts = this.points;
    const n = pts.length;
    if (n < 4) return null;
    const origin = pts[n - 1];
    const xy = pts.map((p) => project(origin, p));
    const end = xy[n - 1];
    // Walk back from the end; once past the skip distance, any point near the end closes a loop.
    let back = 0;
    let best: Glyph | null = null;
    for (let i = n - 2; i >= 0; i--) {
      back += dist(xy[i], xy[i + 1]);
      if (back < Math.max(RING_SKIP_M, RING_MIN_M * 0.8)) continue;
      if (dist(xy[i], end) > RING_CLOSE_M) continue;
      const loop = xy.slice(i);
      const perimeter = back + dist(xy[i], end);
      if (perimeter < RING_MIN_M) continue;
      const area = polygonArea(loop);
      if ((4 * Math.PI * area) / (perimeter * perimeter) < RING_ROUNDNESS) continue;
      // Keep the biggest loop that qualifies.
      const shape = simplify(loop, 5);
      best = {
        kind: 'ring',
        at: origin.time,
        path: shape.map((p) => unproject(origin, p)),
        center: unproject(origin, centroid(loop)),
        lengthM: Math.round(perimeter),
        areaM2: Math.round(area),
      };
    }
    return best;
  }

  private checkStroke(): Glyph | null {
    const pts = this.points;
    const n = pts.length;
    if (n - this.strokeFrom < 2) return null;
    const origin = pts[n - 1];
    let path = 0;
    for (let i = n - 2; i >= this.strokeFrom; i--) {
      path += dist(project(origin, pts[i]), project(origin, pts[i + 1]));
      if (path < STROKE_MIN_M) continue;
      const straight = dist(project(origin, pts[i]), [0, 0]);
      if (straight < STROKE_STRAIGHTNESS * path) return null;
      this.strokeFrom = n - 1;
      const a: LngLat = [pts[i].lng, pts[i].lat];
      const b: LngLat = [origin.lng, origin.lat];
      return {
        kind: 'stroke',
        at: origin.time,
        path: [a, b],
        center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        lengthM: Math.round(straight),
      };
    }
    return null;
  }

  private checkKnot(fix: TracePoint): Glyph | null {
    const row = Math.floor((fix.lat * M_PER_DEG_LAT) / KNOT_CELL_M);
    const kx = M_PER_DEG_LAT * Math.cos((((row + 0.5) * KNOT_CELL_M) / M_PER_DEG_LAT) * (Math.PI / 180));
    const col = Math.floor((fix.lng * kx) / KNOT_CELL_M);
    const cell = `${row}:${col}`;
    if (cell === this.lastCell) return null;
    this.lastCell = cell;
    const entries = (this.knotEntries.get(cell) ?? []).filter((t) => fix.time - t < KNOT_WINDOW_MS);
    entries.push(fix.time);
    this.knotEntries.set(cell, entries);
    if (entries.length < KNOT_ENTRIES) return null;
    this.knotEntries.delete(cell);
    const center: LngLat = [((col + 0.5) * KNOT_CELL_M) / kx, ((row + 0.5) * KNOT_CELL_M) / M_PER_DEG_LAT];
    return { kind: 'knot', at: fix.time, path: [center], center, lengthM: 0 };
  }
}

export const GLYPHS: Record<GlyphKind, { name: string; how: string; effect: string }> = {
  ring: {
    name: 'Ring',
    how: 'Walk a loop of 250 m or more and come back to where you started.',
    effect: "Walked in your companion's home realm, it can finish its evolution.",
  },
  stroke: {
    name: 'Stroke',
    how: 'Walk 300 m or more in a straight line.',
    effect: 'Pays XP and Wanderlight.',
  },
  knot: {
    name: 'Knot',
    how: 'Pass through the same street corner three times within 15 minutes.',
    effect: 'Sets a Waymark there, where a creature always waits.',
  },
};

/** A small drawing of a glyph's shape, for toasts. */
export function glyphSvg(glyph: Pick<Glyph, 'kind' | 'path'>, size = 48): string {
  const stroke = 'stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  if (glyph.kind === 'knot' || glyph.path.length < 2)
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path d="M24 8c10 0 12 14 2 18s-14 14-2 14 12-10 2-14S14 8 24 8z" ${stroke}/></svg>`;
  if (glyph.kind === 'stroke')
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path d="M8 40L40 8" ${stroke}/><circle cx="8" cy="40" r="3" fill="currentColor"/><circle cx="40" cy="8" r="3" fill="currentColor"/></svg>`;
  const origin = { lng: glyph.path[0][0], lat: glyph.path[0][1] };
  const xy = glyph.path.map(([lng, lat]) => project(origin, { lng, lat }));
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const k = 36 / span;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${(24 + (p[0] - cx) * k).toFixed(1)} ${(24 - (p[1] - cy) * k).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path d="${d}Z" ${stroke}/></svg>`;
}
