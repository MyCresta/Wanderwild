/**
 * The Wayfarer is the player. XP comes from walking, shrines, catching and battles;
 * levels unlock features gradually so a new player is not shown everything at once.
 */

/** XP needed to go from `level - 1` to `level`. */
export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(100 * level ** 1.5);
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the next level needs in total. */
  needed: number;
}

export const MAX_LEVEL = 50;

export function levelFromXp(totalXp: number): LevelProgress {
  let level = 1;
  let left = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL && left >= xpForLevel(level + 1)) {
    left -= xpForLevel(level + 1);
    level++;
  }
  return { level, into: left, needed: level < MAX_LEVEL ? xpForLevel(level + 1) : 0 };
}

export interface Unlock {
  level: number;
  what: string;
}

export const UNLOCKS: Unlock[] = [
  { level: 1, what: 'Map, wayshrines, Wildlings, Blotspawn, and Glyphwalking' },
  { level: 3, what: 'The Hearthstead: Herb Garden and Mine' },
  { level: 5, what: 'Forge upgrades to +5' },
  { level: 8, what: 'Wildling expeditions' },
  { level: 10, what: 'Wardens and realm claiming' },
  { level: 15, what: 'Runes and Forge upgrades to +10' },
  { level: 20, what: 'A second hero class, Mythic gear, and Rifts' },
  { level: 30, what: 'Relic gear and the final story chapter' },
];

export const isUnlocked = (level: number, feature: number) => level >= feature;

export function nextUnlock(level: number): Unlock | undefined {
  return UNLOCKS.find((u) => u.level > level);
}

export function unlocksBetween(fromLevel: number, toLevel: number): Unlock[] {
  return UNLOCKS.filter((u) => u.level > fromLevel && u.level <= toLevel);
}
