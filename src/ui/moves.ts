import { cadence, getMove, moveBlurb, moveSummary, type Move } from '../creatures/moves';
import { ELEMENTS, type PetSpecies } from '../creatures/species';
import { BOND_METRES, bondStatus } from '../creatures/bond';
import type { OwnedPet } from '../creatures/collection';
import { h } from './dom';

/** The mark in front of a move's name: its element's glyph, or crossed swords for a plain move. */
export const moveGlyph = (move: Move) => (move.element ? ELEMENTS[move.element].glyph : '⚔');

/** One move: glyph and name with its power pips or trick, and under it how often it can be used. */
export function moveRow(move: Move): HTMLElement {
  return h(
    'span',
    { class: 'move-row', title: moveBlurb(move), style: move.element ? `--el: ${ELEMENTS[move.element].color}` : '' },
    h('span', { class: 'move-name' }, `${moveGlyph(move)} ${move.name}`),
    h('span', { class: 'move-pips' }, moveSummary(move)),
    h('small', { class: 'move-cadence' }, cadence(move.wait)),
  );
}

/** Kilometres for a bond's progress: 3.2 km. */
const km = (m: number) => (m / 1000).toFixed(1);

/**
 * A Wildling's bond move: the move itself once learned, otherwise a locked row with how far
 * there is still to walk together.
 */
export function bondRow(pet: OwnedPet): HTMLElement | null {
  const bond = bondStatus(pet);
  if (!bond) return null;
  if (bond.learned) {
    const row = moveRow(bond.move);
    row.classList.add('move-bond');
    row.title = `Bond move. ${row.title}`;
    return row;
  }
  return h(
    'span',
    { class: 'move-row move-locked', title: `Walk ${km(BOND_METRES)} km together as companion to learn ${bond.move.name}.` },
    h('span', { class: 'move-name' }, `🔒 ${bond.move.name}`),
    h('span', { class: 'move-pips' }, `${km(bond.walked)} / ${km(BOND_METRES)} km`),
    h('small', { class: 'move-cadence' }, 'Bond move: walk together'),
  );
}

/** A Wildling's three moves, one per line, and its bond move when it is one of yours. */
export const moveList = (species: PetSpecies, pet?: OwnedPet) =>
  h('span', { class: 'move-list' }, ...species.moves.map((id) => moveRow(getMove(id))), (pet && bondRow(pet)) ?? '');
