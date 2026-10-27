import { MATERIALS, REALMS, type MaterialId } from '../game/realms';
import { addPet, markSeen, partyPets, petBoost, type Collection, type OwnedPet } from './collection';
import { ELEMENTS, getSpecies, PETS, type Element, type PetSpecies } from './species';
import { individualFromSeed, mergeBoost, rollBoost, STAT_KEYS, type Boost, type Encounter } from './stats';

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

/** `gained` is how many percent each stat rose when kin joined the one you keep. */
export type Kept = { pet: OwnedPet; upgraded: boolean; fromLevel: number; gained?: Partial<Boost> };

/**
 * A Wildling joins you. If you already keep one of its kind, the two become one: yours takes the
 * newcomer's level if higher, the better of each stat bonus plus a little more, and its golden
 * coat if it has one.
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
  const before = petBoost(kept);
  kept.boost = mergeBoost(before, rollBoost(encounter.seed));
  const gained: Partial<Boost> = {};
  for (const k of STAT_KEYS) if (kept.boost[k] > before[k]) gained[k] = kept.boost[k] - before[k];
  const kind = encounter.species.kind;
  if (individualFromSeed(encounter.seed, kind).gilded && !individualFromSeed(kept.seed, kind).gilded) kept.seed = encounter.seed;
  markSeen(c, encounter.species.id);
  return { pet: kept, upgraded: true, fromLevel, gained };
}

/**
 * Folds any second Wildling of a kind into the first, for saves from before one-of-each-kind
 * (or a newcomer that joined on an older copy of the game). The evolved or higher-level one
 * stays, taking the best of both. Returns which uids were folded into which.
 */
export function mergeDuplicates(c: Collection): Map<string, string> {
  const folded = new Map<string, string>();
  const byLine = new Map<string, OwnedPet[]>();
  for (const pet of c.pets) {
    const line = lineOf(pet.speciesId)?.id;
    if (line) byLine.set(line, [...(byLine.get(line) ?? []), pet]);
  }
  const stage = (p: OwnedPet) => (lineOf(p.speciesId)?.id === p.speciesId ? 1 : 2);
  for (const pets of byLine.values()) {
    if (pets.length < 2) continue;
    const [keep, ...rest] = [...pets].sort((a, b) => stage(b) - stage(a) || b.level - a.level || b.xp - a.xp);
    const kind = getSpecies(keep.speciesId).kind;
    for (const other of rest) {
      keep.level = Math.max(keep.level, other.level);
      keep.realmWalkM = Math.max(keep.realmWalkM ?? 0, other.realmWalkM ?? 0) || undefined;
      keep.homeRing = keep.homeRing || other.homeRing || undefined;
      keep.bondM = Math.max(keep.bondM ?? 0, other.bondM ?? 0) || undefined;
      keep.boost = mergeBoost(petBoost(keep), petBoost(other));
      if (individualFromSeed(other.seed, kind).gilded && !individualFromSeed(keep.seed, kind).gilded) keep.seed = other.seed;
      folded.set(other.uid, keep.uid);
    }
  }
  if (!folded.size) return folded;
  const to = (uid: string) => folded.get(uid) ?? uid;
  c.pets = c.pets.filter((p) => !folded.has(p.uid));
  if (c.companionUid) c.companionUid = to(c.companionUid);
  c.lineup = [...new Set(c.lineup.map(to))];
  return folded;
}

/** Wildlings at rest: everyone kept but the fighting party, the companion and any away on an expedition. */
export function roosting(c: Collection, away: ReadonlySet<string> = new Set()): OwnedPet[] {
  const busy = new Set([...partyPets(c).map((p) => p.uid), c.companionUid, ...away]);
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
export function gatherRoost(c: Collection, now = Date.now(), away?: ReadonlySet<string>): Partial<Record<MaterialId, number>> {
  const since = c.roostAt ?? now;
  const elapsed = Math.min(ROOST_CAP_MS, Math.max(0, now - since));
  const rounds = Math.floor(elapsed / ROOST_GATHER_MS);
  c.roostAt = now - (elapsed - rounds * ROOST_GATHER_MS);
  const found: Partial<Record<MaterialId, number>> = {};
  if (!rounds) return found;
  const lines = new Set<string>();
  for (const pet of roosting(c, away)) {
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
