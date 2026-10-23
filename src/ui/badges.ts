import { ELEMENTS, type Species } from '../creatures/species';
import { h } from './dom';

export const elementBadge = (species: Species) =>
  h(
    'span',
    { class: 'badge', style: { background: ELEMENTS[species.element].color } },
    `${ELEMENTS[species.element].glyph} ${ELEMENTS[species.element].name}`,
  );

export const rarityBadge = (species: Species) => h('span', { class: `badge badge-${species.rarity}` }, species.rarity);

/** Wax-seal glyph used for binding seals. */
export const SEAL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2l4 3 5-1 2 4 5 2-1 5 3 4-3 4 1 5-5 2-2 4-5-1-4 3-4-3-5 1-2-4-5-2 1-5-3-4 3-4-1-5 5-2 2-4 5 1z" fill="#8e2b22" stroke="#4a120d" stroke-width="1.5"/><circle cx="20" cy="20" r="10" fill="none" stroke="#c9544a" stroke-width="1.5"/><path d="M20 12l2.4 5.6 5.6 2.4-5.6 2.4L20 28l-2.4-5.6L12 20l5.6-2.4z" fill="#e7a29a"/></svg>`;
