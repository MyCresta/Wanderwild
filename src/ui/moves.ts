import { cadence, getMove, moveBlurb, moveSummary, type Move } from '../creatures/moves';
import { ELEMENTS, type PetSpecies } from '../creatures/species';
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

/** A Wildling's three moves, one per line. */
export const moveList = (species: PetSpecies) => h('span', { class: 'move-list' }, ...species.moves.map((id) => moveRow(getMove(id))));
