import { MATERIALS, REALMS, type MaterialId } from '../game/realms';
import { addPet, markSeen, partyPets, type Collection, type OwnedPet } from './collection';
import { ELEMENTS, getSpecies, PETS, type Element, type PetSpecies } from './species';
import { individualFromSeed, type Encounter } from './stats';

/**
 * The Roost: every Wildling you keep that is not in your fighting party rests at home, with
 * nothing to manage. You keep one of each kind, so there is never a reason to let one go.
 * Roosting Wildlings gather their home realm's material, and completing an element's kinds
 * makes every Wildling of that element hit harder.
 */

const HOUR = 60 * 60 * 1000;
/** Each roosting kind gathers one of its home realm's material this often. */
export const ROOST_GATHER_MS = 2 * HOUR;
/** The Roost holds a day's gathering while you are away. */
export const ROOST_CAP_MS = 24 * HOUR;
/** Damage bonus for Wildlings of an element once every kind of it is in your bestiary. */
export const SET_BONUS = 0.1;

/** The first form of a species' line, which stands for the whole line. */
export function lineOf(speciesId: string): PetSpecies | null {
  const base = PETS.find((p) => p.id === speciesId || p.evolution?.into === speciesId);
  return base ?? null;
}

/** Your best Wildling of a line, if you keep one. */
export function keptOfLine(c: Collection, lineId: string): OwnedPet | null {
  const kept = c.pets.filter((p) => lineOf(p.speciesId)?.id === lineId);
  return kept.sort((a, b) => b.level - a.level)[0] ?? null;
}

export type Kept = { pet: OwnedPet; upgraded: boolean; fromLevel: number };

/**
 * A Wildling joins you. If you already keep one of its kind, yours takes on the newcomer's level
 * (and its golden coat, if it has one) instead of a second one moving in.
 */
export function keepWildling(c: Collection, encounter: Encounter): Kept {
  const line = lineOf(encounter.species.id);
  const kept = line ? keptOfLine(c, line.id) : null;
  if (!kept) return { pet: addPet(c, encounter), upgraded: false, fromLevel: encounter.level };
  const fromLevel = kept.level;
  if (encounter.level > kept.level) {
    kept.level = encounter.level;
    kept.xp = 0;
  }
  const kind = encounter.species.kind;
  if (individualFromSeed(encounter.seed, kind).gilded && !individualFromSeed(kept.seed, kind).gilded) kept.seed = encounter.seed;
  markSeen(c, encounter.species.id);
  return { pet: kept, upgraded: true, fromLevel };
}

/** Wildlings at rest: everyone kept but the fighting party and the companion. */
export function roosting(c: Collection): OwnedPet[] {
  const busy = new Set([...partyPets(c).map((p) => p.uid), c.companionUid]);
  return c.pets.filter((p) => !busy.has(p.uid));
}

/** What a roosting Wildling gathers. */
export function roostMaterial(pet: OwnedPet): MaterialId | null {
  const line = lineOf(pet.speciesId);
  return line?.evolution ? REALMS[line.evolution.realm].material : null;
}

export const materialName = (id: MaterialId) => MATERIALS[id].name;

/**
 * Banks the Roost's gathering since it was last checked, even with the app closed (up to a day).
 * Each roosting kind gathers once per ROOST_GATHER_MS.
 */
export function gatherRoost(c: Collection, now = Date.now()): Partial<Record<MaterialId, number>> {
  const since = c.roostAt ?? now;
  const elapsed = Math.min(ROOST_CAP_MS, Math.max(0, now - since));
  const rounds = Math.floor(elapsed / ROOST_GATHER_MS);
  c.roostAt = now - (elapsed - rounds * ROOST_GATHER_MS);
  const found: Partial<Record<MaterialId, number>> = {};
  if (!rounds) return found;
  const lines = new Set<string>();
  for (const pet of roosting(c)) {
    const line = lineOf(pet.speciesId)?.id;
    const material = roostMaterial(pet);
    if (!line || !material || lines.has(line)) continue;
    lines.add(line);
    found[material] = (found[material] ?? 0) + rounds;
  }
  return found;
}

export interface ElementSet {
  element: Element;
  /** First forms of the element's lines. */
  kinds: PetSpecies[];
  kept: number;
  complete: boolean;
}

/** How far along each element's set of kinds is. */
export function elementSets(c: Collection): ElementSet[] {
  return (Object.keys(ELEMENTS) as Element[]).map((element) => {
    const kinds = PETS.filter((p) => p.element === element);
    const kept = kinds.filter((k) => keptOfLine(c, k.id)).length;
    return { element, kinds, kept, complete: kinds.length > 0 && kept === kinds.length };
  });
}

/** Damage multiplier for a Wildling, from its element's completed set. */
export function setBonus(c: Collection, speciesId: string): number {
  const species = getSpecies(speciesId);
  if (species.kind !== 'pet') return 1;
  return elementSets(c).find((s) => s.element === species.element)?.complete ? 1 + SET_BONUS : 1;
}
