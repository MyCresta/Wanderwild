import type { Fix } from './distance';

/**
 * How close the player must be to meet a creature, touch a shrine or pick up a curio by hand.
 * One reach for everything on the map, drawn as the ring around the player. Generous, since GPS wanders.
 */
export const REACH_M = 120;
/** Up to this much of the GPS error is forgiven on top of the reach. */
const MAX_ACCURACY_SLACK_M = 40;

/** Reach for this fix: the base, gear bonuses, and some slack for a fuzzy fix. */
export function playerReach(fix: Fix, bonusM = 0): number {
  return REACH_M + bonusM + Math.min(Math.max(fix.accuracy, 0), MAX_ACCURACY_SLACK_M);
}
