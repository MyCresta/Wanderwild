import { dayKey } from './hearthstead';

/**
 * The walk streak: reaching STREAK_STEPS on consecutive days grows a small XP bonus.
 * A streak lives on through the day after it was last kept, so today's walk can still
 * carry it; a day with no goal reached ends it.
 */

export const STREAK_STEPS = 3000;
export const STREAK_XP_PER_DAY = 0.02;
export const STREAK_MAX_DAYS = 10;

export interface Streak {
  /** The last local day the step goal was reached. */
  day: string;
  days: number;
}

/** The local day before `now`, safe across clock changes. */
export function yesterdayKey(now = Date.now()): string {
  const d = new Date(now);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime());
}

/** Days in the streak still alive now: kept today or yesterday. */
export function streakDays(streak: Streak, now = Date.now()): number {
  return streak.day === dayKey(now) || streak.day === yesterdayKey(now) ? streak.days : 0;
}

/** The XP multiplier the streak gives now. */
export const streakXp = (streak: Streak, now = Date.now()) => 1 + STREAK_XP_PER_DAY * Math.min(STREAK_MAX_DAYS, streakDays(streak, now));

/** Counts today toward the streak once today's steps reach the goal. Returns the new length, or 0 if nothing changed. */
export function keepStreak(streak: Streak, stepsToday: number, now = Date.now()): number {
  const today = dayKey(now);
  if (stepsToday < STREAK_STEPS || streak.day === today) return 0;
  streak.days = streak.day === yesterdayKey(now) ? streak.days + 1 : 1;
  streak.day = today;
  return streak.days;
}
