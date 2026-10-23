import { beats, WHEEL, WHEEL_VERBS } from '../creatures/elements';
import { ELEMENTS, type Element } from '../creatures/species';
import { h } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** The Elemental Wheel drawn as six glyphs in a ring, each arrow pointing at what it overpowers. */
export function wheelFigure(highlight?: Element): SVGSVGElement {
  const root = svg('svg', { viewBox: '-4 -18 208 236', class: 'wheel-figure', role: 'img', 'aria-label': 'Elemental Wheel' });
  const defs = svg('defs', {});
  const marker = svg('marker', { id: 'wheel-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  marker.appendChild(svg('path', { d: 'M0 0 L10 5 L0 10 z', fill: 'currentColor' }));
  defs.appendChild(marker);
  root.appendChild(defs);
  const at = (i: number, r: number) => {
    const a = (i / WHEEL.length) * Math.PI * 2 - Math.PI / 2;
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  };
  WHEEL.forEach((_, i) => {
    // Arc from this element to the next, kept clear of both glyphs.
    const [x1, y1] = at(i + 0.28, 72);
    const [x2, y2] = at(i + 0.72, 72);
    root.appendChild(svg('path', { d: `M${x1} ${y1} A72 72 0 0 1 ${x2} ${y2}`, class: 'wheel-arc', 'marker-end': 'url(#wheel-arrow)' }));
  });
  WHEEL.forEach((e, i) => {
    const [x, y] = at(i, 72);
    const g = svg('g', { class: `wheel-node${e === highlight ? ' wheel-node-on' : ''}` });
    g.appendChild(svg('circle', { cx: x, cy: y, r: 22, fill: ELEMENTS[e].color }));
    const glyph = svg('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'wheel-glyph' });
    glyph.textContent = ELEMENTS[e].glyph;
    g.appendChild(glyph);
    const label = svg('text', { x, y: y + (y > 100 ? 34 : -28), 'text-anchor': 'middle', class: 'wheel-label' });
    label.textContent = ELEMENTS[e].name;
    g.appendChild(label);
    root.appendChild(g);
  });
  return root;
}

/** "✹ Ember burns ❦ Grove" for every spoke, in wheel order. */
export function wheelLines(): HTMLElement {
  return h(
    'ul',
    { class: 'wheel-lines' },
    ...WHEEL.map((e) => h('li', {}, elementTag(e), ` ${WHEEL_VERBS[e]} `, elementTag(beats(e)))),
  );
}

export function elementTag(e: Element): HTMLElement {
  return h('span', { class: 'el-tag', style: `--el: ${ELEMENTS[e].color}` }, `${ELEMENTS[e].glyph} ${ELEMENTS[e].name}`);
}

/** A fold-out explaining the wheel in one figure and six lines. */
export function wheelHelp(highlight?: Element): HTMLElement {
  return h(
    'details',
    { class: 'wheel-help' },
    h('summary', {}, 'Elemental Wheel'),
    h('div', { class: 'wheel-body' }, wheelFigure(highlight), wheelLines()),
    h('p', { class: 'hint' }, 'Strong hits deal ×1.5, weak ones ×0.6. Strike is never strong or weak.'),
  );
}
