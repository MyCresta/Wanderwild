import { companion, type Collection, type OwnedPet } from './collection';
import { getMove, type Move } from './moves';
import { lineOf } from './roost';

/**
 * Bond moves: walk far enough with a Wildling as your companion and it learns a fourth move,
 * its own, that no other line knows. Each line has one; an evolved form keeps it.
 */

/** Metres walked together as companion before the bond move is learned. */
export const BOND_METRES = 5000;

/** Each line's bond move, by the line's first form. */
export const BOND_MOVES: Record<string, string> = {
  bramblet: 'briarheart',
  driftfin: 'mistveil',
  emberkit: 'hearthblaze',
  cragmite: 'mountain-heart',
  wisplume: 'stormcall',
  lumoth: 'duskglow',
  capling: 'rainbloom',
  shellop: 'pearl-guard',
  sparkwick: 'wickfire',
  pebblit: 'landslide',
  kitewisp: 'skyreel',
  glimhare: 'starleap',
  mossfawn: 'verdant-call',
  rillotter: 'eddy-spin',
  dandlewisp: 'wishwind',
};

/** The bond move a species' line learns, learned or not. */
export function bondMoveFor(speciesId: string): Move | null {
  const id = BOND_MOVES[lineOf(speciesId)?.id ?? ''];
  return id ? getMove(id) : null;
}

export interface BondStatus {
  move: Move;
  walked: number;
  learned: boolean;
}

export function bondStatus(pet: OwnedPet): BondStatus | null {
  const move = bondMoveFor(pet.speciesId);
  if (!move) return null;
  const walked = Math.min(BOND_METRES, pet.bondM ?? 0);
  return { move, walked, learned: walked >= BOND_METRES };
}

/** The bond move this Wildling has learned, if it has. */
export const learnedBond = (pet: OwnedPet): Move | null => {
  const s = bondStatus(pet);
  return s?.learned ? s.move : null;
};

/** Counts a walk toward the companion's bond. Returns the companion if this walk taught it its bond move. */
export function walkBond(c: Collection, metres: number): OwnedPet | null {
  const pet = companion(c);
  const before = pet && bondStatus(pet);
  if (!pet || !before || before.learned) return null;
  pet.bondM = Math.min(BOND_METRES, (pet.bondM ?? 0) + metres);
  return bondStatus(pet)!.learned ? pet : null;
}
