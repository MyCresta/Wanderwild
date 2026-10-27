import type { Element } from '../creatures/species';
import type { MaterialId } from './realms';
import { hashString, seededRandom } from './rng';

/**
 * Companion finds: every thousand steps or so the companion noses out a small find, and
 * what it turns up follows its element. Walking only; Farsight has no paws on the ground.
 */

/** Distance between finds: about a thousand steps. */
export const FIND_EVERY_M = 750;
/** Odds that a find is a shrine relic instead of the usual. */
const RELIC_CHANCE = 0.08;

export interface CompanionFind {
  coin: number;
  wanderlight: number;
  materials: Partial<Record<MaterialId, number>>;
}

/** What each element sniffs out: a material, or Ember's warm coins and Lumen's Wanderlight. */
const ELEMENT_FINDS: Record<Element, MaterialId | 'coin' | 'wanderlight'> = {
  grove: 'ironbark',
  tide: 'mistwool',
  stone: 'cobbleOre',
  gale: 'hearthgrain',
  ember: 'coin',
  lumen: 'wanderlight',
};

/** How many finds a walk from `before` to `after` metres in total has earned. */
export const findsBetween = (before: number, after: number) => Math.max(0, Math.floor(after / FIND_EVERY_M) - Math.floor(before / FIND_EVERY_M));

/** The `n`th find (counted over all distance walked), for a companion of this element and level. */
export function companionFind(element: Element, level: number, n: number): CompanionFind {
  const rand = seededRandom(hashString(`find:${n}`));
  const find: CompanionFind = { coin: 0, wanderlight: 0, materials: {} };
  const more = Math.floor(Math.max(1, level) / 10);
  if (rand() < RELIC_CHANCE) {
    find.materials.shrineRelic = 1;
    return find;
  }
  const kind = ELEMENT_FINDS[element];
  if (kind === 'coin') find.coin = 10 + Math.floor(rand() * 9) + 4 * more;
  else if (kind === 'wanderlight') find.wanderlight = 1 + (rand() < 0.4 ? 1 : 0) + Math.floor(more / 2);
  else find.materials[kind] = 2 + Math.floor(rand() * 2) + more;
  return find;
}
