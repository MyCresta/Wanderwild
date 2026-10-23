// The maths of the catch scene, kept free of the DOM so it can be tested.

export interface Vec {
  x: number;
  y: number;
}

/** A flick must be at least this fast upward (px/s) to count as a throw. */
export const MIN_THROW_SPEED = 250;
/** Flick speed (px/s) that carries the seal about 63% of its longest reach. */
const SPEED_SCALE = 1600;
export const FLIGHT_S = 0.62;
const ARC_PX = 90;

/** How far a flick of `speed` px/s carries, easing off toward `maxReach` so hard flicks still land. */
export const throwDistance = (speed: number, maxReach: number) => maxReach * (1 - Math.exp(-speed / SPEED_SCALE));

/** The flick speed that carries exactly `distance`; inverse of throwDistance. */
export const speedFor = (distance: number, maxReach: number) =>
  -SPEED_SCALE * Math.log(1 - Math.min(0.99, distance / maxReach));

/** Where a seal released at `start` with `velocity` comes down. */
export function landingPoint(start: Vec, velocity: Vec, maxReach: number): Vec {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (!speed) return { ...start };
  const d = throwDistance(speed, maxReach);
  return { x: start.x + (velocity.x / speed) * d, y: start.y + (velocity.y / speed) * d };
}

/** The seal's position, scale and spin `p` (0..1) of the way through its flight. */
export function flightPose(start: Vec, land: Vec, p: number): { x: number; y: number; scale: number; spin: number } {
  const e = 1 - (1 - p) * (1 - p);
  return {
    x: start.x + (land.x - start.x) * e,
    y: start.y + (land.y - start.y) * e - Math.sin(Math.PI * p) * ARC_PX,
    scale: 1 - 0.5 * e,
    spin: p * 720,
  };
}

/** Whether a landing point strikes the target. Depth is hard to judge, so the hit zone is taller than wide. */
export const isHit = (land: Vec, target: Vec, radius: number) =>
  ((land.x - target.x) / radius) ** 2 + ((land.y - target.y) / (radius * 1.6)) ** 2 <= 1;

/** Velocity from the last pointer samples of a drag, in px/s. */
export function flickVelocity(samples: readonly { x: number; y: number; t: number }[], windowMs = 90): Vec {
  // A finger often rests a moment before lifting; measure up to the last real movement.
  let end = samples.length - 1;
  while (end > 0 && samples[end].x === samples[end - 1].x && samples[end].y === samples[end - 1].y) end--;
  samples = samples.slice(0, end + 1);
  if (samples.length < 2) return { x: 0, y: 0 };
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) if (last.t - s.t <= windowMs) {
    first = s;
    break;
  }
  const dt = Math.max(1, last.t - first.t) / 1000;
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/** The closing ring, as a fraction of its widest size: sweeps between 1 and 0.18. */
export const ringScale = (t: number) => 0.59 + 0.41 * Math.cos(t * 2.3);

/** How tight the ring was when the seal struck, 0..1. Smaller is better. */
export const ringQuality = (scale: number) => Math.max(0, Math.min(1, (1 - scale) / 0.82));

export type Grade = 'Excellent!' | 'Great!' | 'Nice!' | null;
export function throwGrade(quality: number): Grade {
  if (quality > 0.85) return 'Excellent!';
  if (quality > 0.6) return 'Great!';
  if (quality > 0.35) return 'Nice!';
  return null;
}

/** Colour of the ring for a catch chance: red when slim, through amber, to green. */
export function oddsColor(chance: number): string {
  const hue = Math.round(Math.max(0, Math.min(1, (chance - 0.1) / 0.6)) * 120);
  return `hsl(${hue} 75% 45%)`;
}

/**
 * The creature's idle wander plus any dodge in progress. `dodge` is when the dodge began
 * and which way it hops. Returns an offset from its resting spot in px.
 */
export function creatureOffset(t: number, phase: number, dodge: { at: number; dir: 1 | -1 } | null, scale: number): Vec {
  let x = (24 * Math.sin(t * 0.9 + phase) + 10 * Math.sin(t * 2.1 + phase * 2)) * scale;
  let y = 4 * Math.sin(t * 1.7 + phase) * scale;
  if (dodge) {
    const d = t - dodge.at;
    if (d >= 0) {
      const out = d < 0.35 ? 1 - (1 - d / 0.35) ** 3 : d < 0.9 ? 1 : Math.max(0, 1 - (d - 0.9) / 1.1);
      x += dodge.dir * 80 * scale * out;
      if (d < 0.45) y -= 34 * scale * Math.sin((Math.PI * d) / 0.45);
    }
  }
  return { x, y };
}

/** Chance a creature tries to hop out of the way of a throw. Grows as it gets warier. */
export function dodgeChance(rarity: 'common' | 'uncommon' | 'rare', wariness: number): number {
  const base = rarity === 'rare' ? 0.3 : rarity === 'uncommon' ? 0.2 : 0.1;
  return Math.min(0.6, base + 0.08 * wariness);
}

export const WOBBLES = 3;
export const WOBBLE_S = 1.1;
/** The moment in each wobble when a press holds the seal shut, and how forgiving it is. */
export const PRESS_AT = 0.7;
export const PRESS_WINDOW = 0.16;
export const PRESS_BONUS = 0.15;

/** Odds that the seal survives one wobble, given the whole-catch chance. */
export const wobbleOdds = (chance: number, held: boolean) =>
  Math.min(0.98, Math.pow(chance, 1 / WOBBLES) + (held ? PRESS_BONUS : 0));

/** Whether a press `s` seconds into a wobble lands in the window. */
export const pressInWindow = (s: number) => Math.abs(s - PRESS_AT) <= PRESS_WINDOW;
