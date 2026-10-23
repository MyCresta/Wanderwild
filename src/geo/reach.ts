import type { Fix } from './distance';

/** How close the player must be to a creature to meet it. Generous, since GPS wanders. */
export const CREATURE_REACH_M = 120;
/** Up to this much of the GPS error is forgiven on top of the reach. */
const MAX_ACCURACY_SLACK_M = 40;

/** Creature reach for this fix: the base, gear bonuses, and some slack for a fuzzy fix. */
export function creatureReach(fix: Fix, bonusM = 0): number {
  return CREATURE_REACH_M + bonusM + Math.min(Math.max(fix.accuracy, 0), MAX_ACCURACY_SLACK_M);
}
