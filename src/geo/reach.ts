/**
 * How close the player must be to meet a creature, touch a shrine, pick up a curio or
 * find a hunt's landmark. One reach for everything, drawn as the purple ring around the
 * player. It never grows or shrinks with GPS error, so the ring always means the same thing.
 */
export const REACH_M = 100;

/** Reach with gear bonuses on top of the base. */
export function playerReach(bonusM = 0): number {
  return REACH_M + Math.max(0, bonusM);
}
