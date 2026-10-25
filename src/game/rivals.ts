import { cellsAround } from './cells';
import { hashString, seededRandom } from './rng';
import type { Spawn } from './spawns';
import { pickTraits } from '../creatures/foes';
import { PETS, TAKEN, type Element } from '../creatures/species';
import { MAX_LEVEL, type Encounter } from '../creatures/stats';

/**
 * Inkbinders: renegade scribes who bind Wildlings with Blot ink and make them fight as Taken.
 * One camps in some ~800 m squares for a day with a line of three Taken, who step in one after
 * another. Beat the line and the ink lets go: the Taken wake up as Wildlings again, and the one
 * you freed last may walk along with you.
 */

export const RIVAL_CELL_M = 800;
export const RIVAL_DAY_MS = 24 * 60 * 60 * 1000;
const RIVAL_CHANCE = 0.4;
/** Share of camps held by an Archbinder rather than a plain Inkbinder. */
const ARCH_CHANCE = 0.35;
export const RIVAL_LINE = 3;

export type RivalGrade = 'binder' | 'arch';

export const GRADES: Record<RivalGrade, { title: string; rank: 'normal' | 'rare'; levels: readonly number[]; xp: number }> = {
  // A fair fight for a rested party: about your level, one quirk each. Most parties win, worn down.
  binder: { title: 'Inkbinder', rank: 'normal', levels: [-1, 0, 0], xp: 1.2 },
  // A hard one: Rare Taken above your level. It takes counters, timed crits, spells and tonics.
  arch: { title: 'Archbinder', rank: 'rare', levels: [0, 1, 1], xp: 1.6 },
};
const NAMES = ['Maud', 'Orrin', 'Sable', 'Tamsin', 'Corvin', 'Isolde', 'Fenwick', 'Hollis', 'Wren', 'Ambrose', 'Petra', 'Lucan'] as const;
const EPITHETS = ['Blackquill', 'the Smudger', 'Gallnut', 'of the Spilt Pot', 'Sootfinger', 'the Blotter', 'Inkmarrow', 'the Crossed-Out'] as const;

export interface Rival {
  id: string;
  name: string;
  grade: RivalGrade;
  /** The three Taken in the order they step in. */
  line: Encounter[];
}

export interface RivalCamp {
  spawn: Spawn;
  /** The lead Taken, which stands on the map; `encounter.rival` holds the whole line. */
  encounter: Encounter;
}

export const rivalDay = (time: number) => Math.floor(time / RIVAL_DAY_MS);

/** The Wildling a Taken was before the ink took it. */
export const unbound = (takenId: string) => PETS.find((p) => `taken-${p.id}` === takenId) ?? null;

/** Three Taken of three different elements, so no single counter wins the whole line. */
function pickLine(rand: () => number): typeof TAKEN[number][] {
  const line: typeof TAKEN[number][] = [];
  const used = new Set<Element>();
  while (line.length < RIVAL_LINE) {
    const t = TAKEN[Math.floor(rand() * TAKEN.length)];
    if (used.has(t.element)) continue;
    used.add(t.element);
    line.push(t);
  }
  return line;
}

/** The Inkbinder camps around a point today, their Taken levelled against the party's strength. */
export function rivalsNear(lat: number, lng: number, time: number, partyLevel = 1, radiusCells = 1): RivalCamp[] {
  const day = rivalDay(time);
  const camps: RivalCamp[] = [];
  for (const cell of cellsAround(lat, lng, RIVAL_CELL_M, radiusCells)) {
    const id = `rival:${cell.id}:${day}`;
    const rand = seededRandom(hashString(id));
    if (rand() >= RIVAL_CHANCE) continue;
    const grade: RivalGrade = rand() < ARCH_CHANCE ? 'arch' : 'binder';
    const g = GRADES[grade];
    const name = `${NAMES[Math.floor(rand() * NAMES.length)]} ${EPITHETS[Math.floor(rand() * EPITHETS.length)]}`;
    const line: Encounter[] = pickLine(rand).map((species, i) => ({
      species,
      level: Math.min(MAX_LEVEL, Math.max(2, partyLevel + g.levels[i])),
      seed: Math.floor(rand() * 2 ** 32) >>> 0,
      rank: g.rank,
      tier: 1,
      traits: pickTraits(rand, 1),
    }));
    const rival: Rival = { id, name, grade, line };
    const spawn: Spawn = {
      id,
      lat: cell.south + (cell.north - cell.south) * (0.15 + 0.7 * rand()),
      lng: cell.west + (cell.east - cell.west) * (0.15 + 0.7 * rand()),
      seed: line[0].seed,
      rarity: grade === 'arch' ? 'legendary' : 'epic',
      expiresAt: (day + 1) * RIVAL_DAY_MS,
    };
    camps.push({ spawn, encounter: { ...line[0], rival } });
  }
  return camps;
}

/** "Archbinder Maud": short enough for a sheet title on a phone. The full name shows in the log. */
export const rivalTitle = (rival: Rival) => `${GRADES[rival.grade].title} ${rival.name.split(' ')[0]}`;
