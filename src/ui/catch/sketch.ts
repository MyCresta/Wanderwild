// The maths of Sketching: a creature's outline, and how closely a finger traced it.
// Everything here works in the creature drawing's own 200 × 200 units.

import type { Rarity } from '../../creatures/species';

export interface Vec {
  x: number;
  y: number;
}

/** Points on the outline the trace is graded against. */
export const OUTLINE_POINTS = 72;
/** How far (drawing units) a line may stray and still count as on the outline. */
export const TOLERANCE = 10;
/** Below this quality a sketch is too rough to keep, whatever the creature. */
export const MIN_QUALITY = 0.3;
/** A gilded Wildling only keeps still for a near-perfect line. */
export const GILDED_QUALITY = 0.85;

/**
 * The outer edge of a shape, found by casting rays from its centre and keeping the farthest
 * filled point along each one. `filled(x, y)` says whether a drawing unit is inked.
 */
export function radialOutline(filled: (x: number, y: number) => boolean, size = 200, n = OUTLINE_POINTS): Vec[] {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let y = 0; y < size; y += 2)
    for (let x = 0; x < size; x += 2)
      if (filled(x, y)) {
        sx += x;
        sy += y;
        count++;
      }
  if (!count) return [];
  const cx = sx / count;
  const cy = sy / count;
  const maxR = size * 0.75;
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 0;
    for (let d = maxR; d > 0; d -= 1) {
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (x >= 0 && y >= 0 && x < size && y < size && filled(Math.floor(x), Math.floor(y))) {
        r = d;
        break;
      }
    }
    radii.push(r);
  }
  // Thin spikes such as whiskers or a lantern chain are no fun to trace; soften them.
  const smooth = radii.map((_, i) => {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += radii[(i + k + n) % n] * (k === 0 ? 2 : 1);
    return Math.min(radii[i], sum / 6 + 6);
  });
  return smooth.map((r, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

/** Distance from `p` to the segment a–b. */
function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Distance from `p` to the nearest part of any stroke. */
function strokeDistance(p: Vec, strokes: readonly Vec[][]): number {
  let best = Infinity;
  for (const s of strokes) {
    if (s.length === 1) best = Math.min(best, Math.hypot(p.x - s[0].x, p.y - s[0].y));
    for (let i = 1; i < s.length; i++) best = Math.min(best, segmentDistance(p, s[i - 1], s[i]));
  }
  return best;
}

/** Distance from `p` to the closed outline. */
function outlineDistance(p: Vec, outline: readonly Vec[]): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) best = Math.min(best, segmentDistance(p, outline[i], outline[(i + 1) % outline.length]));
  return best;
}

/** Which outline points a trace has passed close to. */
export const coveredPoints = (outline: readonly Vec[], strokes: readonly Vec[][], tolerance = TOLERANCE) =>
  outline.map((p) => strokeDistance(p, strokes) <= tolerance);

export interface SketchScore {
  /** Share of the outline the trace went round, 0..1. */
  coverage: number;
  /** How tightly the line hugged the outline, 0..1. */
  precision: number;
  /** The two together: what decides the grade and the odds. */
  quality: number;
}

/** Grades a trace: it must go all the way round, and stay close to the line while it does. */
export function scoreSketch(outline: readonly Vec[], strokes: readonly Vec[][], tolerance = TOLERANCE): SketchScore {
  const points = strokes.flat();
  if (!outline.length || !points.length) return { coverage: 0, precision: 0, quality: 0 };
  const covered = coveredPoints(outline, strokes, tolerance);
  const coverage = covered.filter(Boolean).length / covered.length;
  // Each traced point scores 1 when it is right on the line, falling to 0 just past the tolerance.
  let sum = 0;
  for (const p of points) {
    const d = outlineDistance(p, outline);
    sum += Math.max(0, Math.min(1, 1 - (d - tolerance * 0.25) / tolerance));
  }
  const precision = sum / points.length;
  return { coverage, precision, quality: coverage * coverage * precision ** 1.5 };
}

export type Grade = 'Masterful' | 'Fine' | 'Fair' | 'Rough' | 'Scribble';
export function sketchGrade(quality: number): Grade {
  if (quality >= GILDED_QUALITY) return 'Masterful';
  if (quality >= 0.65) return 'Fine';
  if (quality >= 0.45) return 'Fair';
  if (quality >= MIN_QUALITY) return 'Rough';
  return 'Scribble';
}

/** How true a likeness must be to take, by rarity: rarer creatures are fussier sitters. */
export const bindQuality = (rarity: Rarity) => (rarity === 'rare' ? 0.5 : rarity === 'uncommon' ? 0.4 : MIN_QUALITY);

/** Levels a finer sketch adds to the bound creature: a careful hand captures more of it. */
export const gradeLevels = (grade: Grade) => (grade === 'Masterful' ? 2 : grade === 'Fine' ? 1 : 0);

/** Seconds a creature holds its pose before it fidgets free. Rarer and warier ones are less patient. */
export function patienceSeconds(rarity: Rarity, wariness: number): number {
  const base = rarity === 'rare' ? 8 : rarity === 'uncommon' ? 10 : 12;
  return Math.max(5, base - 1.5 * wariness);
}

/** Colour for a catch chance: red when slim, through amber, to green. */
export function oddsColor(chance: number): string {
  const hue = Math.round(Math.max(0, Math.min(1, (chance - 0.1) / 0.6)) * 120);
  return `hsl(${hue} 75% 45%)`;
}

/** The creature's idle wander before it settles to pose. Returns an offset from its resting spot in px. */
export function creatureOffset(t: number, phase: number, scale: number): Vec {
  return {
    x: (24 * Math.sin(t * 0.9 + phase) + 10 * Math.sin(t * 2.1 + phase * 2)) * scale,
    y: 4 * Math.sin(t * 1.7 + phase) * scale,
  };
}
