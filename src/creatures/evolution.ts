import type { RealmId } from '../game/realms';
import { companion, markSeen, type Collection, type OwnedPet } from './collection';
import { getSpecies, type Evolution, type PetSpecies } from './species';

export interface EvolutionStatus {
  evolution: Evolution;
  into: PetSpecies;
  walked: number;
  /** A Ring walked in the home realm, which finishes the change. */
  ringed: boolean;
  ready: boolean;
}

/** Where a pet stands on its way to evolving, or null for forms that do not evolve. */
export function evolutionStatus(pet: OwnedPet): EvolutionStatus | null {
  const species = getSpecies(pet.speciesId);
  if (species.kind !== 'pet' || !species.evolution) return null;
  const evolution = species.evolution;
  const walked = Math.min(evolution.metres, pet.realmWalkM ?? 0);
  return {
    evolution,
    into: getSpecies(evolution.into) as PetSpecies,
    walked,
    ringed: !!pet.homeRing,
    ready: pet.level >= evolution.level && walked >= evolution.metres && !!pet.homeRing,
  };
}

/**
 * Counts walking toward the companion's evolution when it is in its home realm. Returns the
 * companion if this walk just made it ready to evolve.
 */
export function walkInRealm(c: Collection, metres: number, realm: RealmId | undefined): OwnedPet | null {
  const pet = companion(c);
  if (!pet || !realm) return null;
  const before = evolutionStatus(pet);
  if (!before || before.evolution.realm !== realm || before.walked >= before.evolution.metres) return null;
  pet.realmWalkM = Math.min(before.evolution.metres, (pet.realmWalkM ?? 0) + metres);
  const after = evolutionStatus(pet);
  return after?.ready && !before.ready ? pet : null;
}

/**
 * A Ring was walked in `realm`. If that is the companion's home realm, the Ring counts toward
 * its evolution. Returns the companion if it was not ringed before, and whether it is now ready.
 */
export function ringInRealm(c: Collection, realm: RealmId | undefined): { pet: OwnedPet; ready: boolean } | null {
  const pet = companion(c);
  if (!pet || !realm) return null;
  const status = evolutionStatus(pet);
  if (!status || status.evolution.realm !== realm || status.ringed) return null;
  pet.homeRing = true;
  return { pet, ready: evolutionStatus(pet)!.ready };
}

/** Turns a ready pet into its evolved form, keeping its level, seed and experience. */
export function evolve(c: Collection, pet: OwnedPet): PetSpecies | null {
  const status = evolutionStatus(pet);
  if (!status?.ready) return null;
  pet.speciesId = status.into.id;
  delete pet.realmWalkM;
  delete pet.homeRing;
  markSeen(c, pet.speciesId);
  return status.into;
}
