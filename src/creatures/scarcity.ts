import { hashString } from './rng';
import type { Collection } from './collection';
import { PETS } from './species';
import type { Encounter } from './stats';

/** Share of wild Wildling spawns that actually appear: about one along a typical walk. */
export const WILDLING_SHARE = 0.1;
/** A Wildling of a kind you already keep must be this many levels above your best one to show. */
export const STRONGER_BY = 3;

/**
 * Whether a wild Wildling is worth meeting. Wildlings are rare, and only kinds you do not have
 * yet, or one clearly stronger than any you keep, step out to meet you, so there are no
 * duplicates to collect and throw away.
 */
export function wildlingWanted(spawnId: string, encounter: Encounter, collection: Collection): boolean {
  if (encounter.species.kind !== 'pet') return true;
  if ((hashString(`wildling:${spawnId}`) % 1000) / 1000 >= WILDLING_SHARE) return false;
  return lineWanted(encounter, collection);
}

/** A Wildling of a kind you do not keep yet, or clearly stronger than your best of its line. */
export function lineWanted(encounter: Encounter, collection: Collection): boolean {
  // An evolved companion still counts as its first form.
  const line = (id: string) => PETS.find((p) => p.evolution?.into === id)?.id ?? id;
  const kept = collection.pets.filter((p) => line(p.speciesId) === encounter.species.id);
  if (!kept.length) return true;
  return encounter.level >= Math.max(...kept.map((p) => p.level)) + STRONGER_BY;
}
