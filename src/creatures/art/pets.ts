import { range } from '../rng';
import {
  blink,
  blobPoints,
  el,
  glowFilter,
  leafPath,
  linearGradient,
  radialGradient,
  rotateAbout,
  scaleAbout,
  smoothClosed,
  smoothOpen,
  starPath,
  TAU,
  translate,
  wobble,
  type Point,
} from '../svg';
import type { Art, Drawer } from './types';

const SHADOW = 'rgba(42, 26, 12, 0.28)';
export const INK = '#2a1d10';

const shadow = (rx: number) => el('ellipse', { cx: 100, cy: 172, rx, ry: rx * 0.16, fill: SHADOW });

/** An eye that blinks by squashing vertically around its centre. */
export function eye(
  x: number,
  y: number,
  r: number,
  iris: string,
  opts: { sclera?: string; pupil?: number; ry?: number } = {},
): { node: SVGGElement; pose(closed: number, lookX?: number): void } {
  const node = el('g');
  const ry = opts.ry ?? r;
  if (opts.sclera) node.appendChild(el('ellipse', { cx: x, cy: y, rx: r, ry, fill: opts.sclera }));
  node.appendChild(el('ellipse', { cx: x, cy: y, rx: r * 0.78, ry: ry * 0.78, fill: iris }));
  const pupil = el('ellipse', { cx: x, cy: y, rx: r * (opts.pupil ?? 0.42), ry: ry * (opts.pupil ?? 0.42), fill: INK });
  const shine = el('circle', { cx: x - r * 0.3, cy: y - ry * 0.35, r: Math.max(1, r * 0.22), fill: '#fff8e6' });
  node.append(pupil, shine);
  return {
    node,
    pose(closed, lookX = 0) {
      node.setAttribute('transform', scaleAbout(1, Math.max(0.08, 1 - closed), x, y));
      pupil.setAttribute('transform', translate(lookX, 0));
    },
  };
}

/** A round hedgehog whose spines are leaves. */
export const bramblet: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const bob = el('g');
  root.append(shadow(50), bob);

  const cx = 100;
  const cy = 124;
  const leafCount = 9 + Math.floor(rng() * 4);
  type Leaf = { node: SVGGElement; x: number; y: number; a: number; phase: number };
  const leaves: Leaf[] = [];
  const addLeaves = (layer: number) => {
    for (let i = 0; i < leafCount; i++) {
      const s = (i + layer * 0.5) / (leafCount - 0.5);
      const a = -176 + s * 150 + range(rng, -5, 5);
      const rad = (a * Math.PI) / 180;
      const len = range(rng, 26, 36) * (layer ? 0.9 : 1);
      const node = el('g');
      node.appendChild(el('path', { d: leafPath(len, 9), fill: layer ? c(98, 42, 44) : c(104, 38, 30), stroke: INK, 'stroke-width': 1.2 }));
      node.appendChild(el('path', { d: `M2 0L${len - 4} 0`, stroke: layer ? c(90, 40, 62) : c(100, 35, 22), 'stroke-width': 1.1 }));
      leaves.push({ node, x: cx + Math.cos(rad) * 30, y: cy - 6 + Math.sin(rad) * 24, a, phase: rng() * TAU });
      bob.appendChild(node);
    }
  };
  addLeaves(0);

  const body = smoothClosed(blobPoints(cx, cy, 44, 34, [[0.03, 3, 1]]));
  bob.appendChild(
    el('path', {
      d: body,
      fill: linearGradient(defs, [[0, c(30, 38, 46)], [1, c(26, 42, 30)]]),
      stroke: INK,
      'stroke-width': 2,
    }),
  );
  addLeaves(1);

  // A berry or a flower riding on top, different for each individual.
  const crown = el('g', { transform: translate(cx - 6, cy - 48) });
  if (rng() < 0.5) {
    for (let i = 0; i < 3; i++)
      crown.appendChild(el('circle', { cx: (i - 1) * 6, cy: i === 1 ? -4 : 0, r: 5, fill: fixed(352, 62, 46), stroke: INK, 'stroke-width': 1 }));
  } else {
    for (let i = 0; i < 5; i++)
      crown.appendChild(el('path', { d: leafPath(10, 4), fill: fixed(48, 80, 82), stroke: INK, 'stroke-width': 0.8, transform: `rotate(${i * 72 - 90})` }));
    crown.appendChild(el('circle', { r: 3, fill: fixed(40, 85, 52) }));
  }
  bob.appendChild(crown);

  const face = el('g');
  face.appendChild(el('ellipse', { cx: 132, cy: 134, rx: 22, ry: 18, fill: c(36, 45, 78), stroke: INK, 'stroke-width': 1.5 }));
  face.appendChild(el('ellipse', { cx: 150, cy: 138, rx: 9, ry: 7, fill: c(34, 45, 72), stroke: INK, 'stroke-width': 1.5 }));
  face.appendChild(el('circle', { cx: 157, cy: 136, r: 4, fill: INK }));
  face.appendChild(el('ellipse', { cx: 124, cy: 142, rx: 5, ry: 3, fill: fixed(355, 70, 70), opacity: 0.55 }));
  const eyes = [eye(126, 127, 4.5, INK), eye(142, 126, 4, INK)];
  face.append(...eyes.map((e) => e.node));
  bob.appendChild(face);

  const feet = [78, 96, 114, 132].map((x) => {
    const foot = el('ellipse', { cx: x, cy: 159, rx: 7, ry: 4.5, fill: c(26, 40, 26), stroke: INK, 'stroke-width': 1.2 });
    bob.appendChild(foot);
    return foot;
  });

  return {
    root,
    tick(t) {
      const breathe = 1 + 0.02 * Math.sin(t * 2.1);
      bob.setAttribute('transform', `${translate(0, -Math.abs(Math.sin(t * 2.1)) * 3)} ${scaleAbout(1 / breathe, breathe, cx, 160)}`);
      for (const leaf of leaves) {
        const sway = 5 * Math.sin(t * 2.4 + leaf.phase) + 3 * wobble(t * 1.3 + leaf.phase);
        leaf.node.setAttribute('transform', `${translate(leaf.x, leaf.y)} rotate(${(leaf.a + sway).toFixed(1)})`);
      }
      const closed = blink(t, 3.6);
      eyes.forEach((e) => e.pose(closed));
      feet.forEach((foot, i) => foot.setAttribute('transform', translate(0, -2 * Math.max(0, Math.sin(t * 4.2 + i * 1.6)))));
      crown.setAttribute('transform', `${translate(cx - 6, cy - 48)} rotate(${(6 * Math.sin(t * 2.4)).toFixed(1)})`);
    },
  };
};

/** A floating fish with veil fins that ripple like mist. */
export const driftfin: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const float = el('g');
  root.append(shadow(40), float);
  const ribbonCount = 3;
  const ribbons = Array.from({ length: ribbonCount }, (_, j) => {
    const node = el('path', { fill: c(186 + j * 12, 55, 66 - j * 6), stroke: c(195, 50, 35), 'stroke-width': 1, opacity: 0.75 });
    float.appendChild(node);
    return node;
  });
  const tailLength = range(rng, 48, 56);

  const dorsal = el('path', { fill: c(190, 50, 60), stroke: INK, 'stroke-width': 1.2, opacity: 0.85 });
  const belly = el('path', { fill: c(190, 50, 60), stroke: INK, 'stroke-width': 1.2, opacity: 0.85 });
  float.append(dorsal, belly);

  const bodyPts: Point[] = [
    [154, 100], [142, 82], [118, 71], [94, 75], [76, 88], [68, 100], [76, 112], [94, 123], [118, 127], [142, 118],
  ];
  float.appendChild(
    el('path', {
      d: smoothClosed(bodyPts),
      fill: linearGradient(defs, [[0, c(198, 48, 38)], [0.55, c(188, 42, 58)], [1, c(180, 40, 82)]]),
      stroke: INK,
      'stroke-width': 2,
    }),
  );
  // Scales: rows of little arcs.
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++) {
      const x = 86 + i * 12 + row * 6;
      const y = 88 + row * 10;
      float.appendChild(el('path', { d: `M${x} ${y}a5 5 0 0 0 10 0`, fill: 'none', stroke: c(185, 50, 80), 'stroke-width': 1.2, opacity: 0.6 }));
    }
  float.appendChild(el('path', { d: 'M128 84q-6 16 0 32', fill: 'none', stroke: c(200, 45, 30), 'stroke-width': 1.6 }));
  float.appendChild(el('path', { d: 'M146 106q4 2 7-1', fill: 'none', stroke: INK, 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
  const barbels = [el('path'), el('path')];
  for (const b of barbels) {
    b.setAttribute('fill', 'none');
    b.setAttribute('stroke', c(185, 45, 70));
    b.setAttribute('stroke-width', '1.4');
    b.setAttribute('stroke-linecap', 'round');
    float.appendChild(b);
  }
  const fin = el('path', { d: leafPath(26, 9), fill: c(186, 55, 70), stroke: INK, 'stroke-width': 1.2 });
  float.appendChild(fin);
  const theEye = eye(137, 93, 7.5, fixed(178, 60, 32), { sclera: '#fbf3dc', pupil: 0.4 });
  float.appendChild(theEye.node);

  const bubbles = Array.from({ length: 4 }, () => {
    const b = el('circle', { fill: 'none', stroke: c(190, 50, 70), 'stroke-width': 1.3 });
    root.appendChild(b);
    return b;
  });

  return {
    root,
    tick(t) {
      const fy = 5 * Math.sin(t * 1.4);
      float.setAttribute('transform', `${translate(10, fy)} ${rotateAbout(3 * Math.sin(t * 1.4 + 1), 110, 100)}`);
      ribbons.forEach((node, j) => {
        const top: Point[] = [];
        const bottom: Point[] = [];
        const spread = (j - 1) * 9;
        for (let i = 0; i <= 10; i++) {
          const s = i / 10;
          const x = 74 - s * tailLength - s * j * 4;
          const y = 100 + spread * (0.3 + s * 1.6) + 11 * s * Math.sin(s * 4.5 - t * 3.2 + j * 0.9);
          const w = 3 + 12 * s * (1 - s * 0.45);
          top.push([x, y - w]);
          bottom.push([x, y + w]);
        }
        node.setAttribute('d', smoothClosed([...top, ...bottom.reverse()]));
      });
      const wave = (x0: number, x1: number, y0: number, h: number, phase: number) => {
        const pts: Point[] = [];
        for (let i = 0; i <= 6; i++) {
          const s = i / 6;
          pts.push([x0 + (x1 - x0) * s, y0 + h * Math.sin(Math.PI * s) * (1 + 0.15 * Math.sin(t * 3 + s * 5 + phase))]);
        }
        return smoothOpen(pts) + 'Z';
      };
      dorsal.setAttribute('d', wave(124, 82, 78, -24, 0));
      belly.setAttribute('d', wave(116, 90, 122, 14, 2));
      barbels[0].setAttribute('d', smoothOpen([[150, 104], [140, 112 + 3 * Math.sin(t * 2)], [124, 118 + 5 * Math.sin(t * 2 - 1)], [108, 120 + 6 * Math.sin(t * 2 - 2)]]));
      barbels[1].setAttribute('d', smoothOpen([[150, 106], [144, 116 + 3 * Math.sin(t * 2.3)], [134, 126 + 4 * Math.sin(t * 2.3 - 1)], [120, 132 + 5 * Math.sin(t * 2.3 - 2)]]));
      fin.setAttribute('transform', `${translate(116, 108)} rotate(${(120 + 18 * Math.sin(t * 5)).toFixed(1)})`);
      theEye.pose(blink(t, 4.4, 1), 1.5 * Math.sin(t * 0.7));
      bubbles.forEach((b, i) => {
        const p = (t * 0.35 + i / bubbles.length) % 1;
        b.setAttribute('cx', (168 + 8 * Math.sin(p * 9 + i)).toFixed(1));
        b.setAttribute('cy', (96 + fy - p * 80).toFixed(1));
        b.setAttribute('r', (2 + p * 3 + i * 0.4).toFixed(1));
        b.setAttribute('opacity', (Math.sin(p * Math.PI) * 0.9).toFixed(2));
      });
    },
  };
};

/** A sitting fox kit with a tail made of living flame. */
export const emberkit: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const flames = el('g');
  const breathe = el('g');
  root.append(shadow(46), flames, breathe);

  const tailBase: Point = [76, 150];
  const tailTip: Point = [range(rng, 36, 46), range(rng, 52, 62)];
  const flameLayers = [
    { color: fixed(10, 82, 46), w: 26, len: 1 },
    { color: fixed(24, 95, 54), w: 18, len: 0.82 },
    { color: fixed(46, 100, 68), w: 9, len: 0.58 },
  ].map((layer) => {
    const node = el('path', { fill: layer.color });
    flames.appendChild(node);
    return { ...layer, node };
  });
  flames.firstElementChild?.setAttribute('stroke', INK);
  flames.firstElementChild?.setAttribute('stroke-width', '1.5');

  const fur = c(22, 72, 50);
  const furDark = c(18, 70, 36);
  const cream = c(36, 60, 88);

  breathe.appendChild(el('ellipse', { cx: 82, cy: 150, rx: 18, ry: 10, fill: fur, stroke: INK, 'stroke-width': 1.5, transform: rotateAbout(-40, 82, 150) }));
  breathe.appendChild(
    el('path', {
      d: smoothClosed(blobPoints(104, 138, 30, 32, [[0.05, 2, 0]])),
      fill: linearGradient(defs, [[0, fur], [1, furDark]]),
      stroke: INK,
      'stroke-width': 2,
    }),
  );
  breathe.appendChild(el('path', { d: 'M108 112q14 14 4 40q-10-6-14-20q2-12 10-20z', fill: cream }));
  for (const x of [104, 120]) {
    breathe.appendChild(el('rect', { x: x - 6, y: 146, width: 12, height: 22, rx: 6, fill: fur, stroke: INK, 'stroke-width': 1.5 }));
    breathe.appendChild(el('ellipse', { cx: x, cy: 166, rx: 6.5, ry: 4, fill: INK }));
  }

  const head = el('g');
  breathe.appendChild(head);
  const ears = [
    { base: [98, 72] as Point, d: 'M90 76L90 40L112 64Z', inner: 'M94 70L94 50L106 63Z' },
    { base: [124, 66] as Point, d: 'M114 64L132 38L136 72Z', inner: 'M120 63L130 47L131 68Z' },
  ].map((ear) => {
    const g = el('g');
    g.appendChild(el('path', { d: ear.d, fill: fur, stroke: INK, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
    g.appendChild(el('path', { d: ear.inner, fill: fixed(16, 80, 40) }));
    head.appendChild(g);
    return { g, base: ear.base };
  });
  head.appendChild(
    el('path', {
      d: 'M84 92Q86 66 112 66Q138 66 140 92L150 102Q148 110 138 112Q124 122 104 118Q86 114 80 102Z',
      fill: fur,
      stroke: INK,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    }),
  );
  head.appendChild(el('path', { d: 'M112 104Q130 98 148 103Q146 110 136 112Q122 118 110 112Z', fill: cream }));
  head.appendChild(el('circle', { cx: 149, cy: 102, r: 4, fill: INK }));
  const eyes = [eye(108, 90, 5.5, fixed(40, 92, 52), { ry: 4.5, pupil: 0.3 }), eye(128, 88, 5, fixed(40, 92, 52), { ry: 4.2, pupil: 0.3 })];
  head.append(...eyes.map((e) => e.node));

  const sparks = Array.from({ length: 6 }, () => {
    const s = el('circle', { r: 2, fill: fixed(45, 100, 66) });
    root.appendChild(s);
    return s;
  });

  return {
    root,
    tick(t) {
      flameLayers.forEach((layer, k) => {
        const left: Point[] = [];
        const right: Point[] = [];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const s = i / steps;
          const sl = s * layer.len;
          const along = 0.08 + sl;
          const bx = tailBase[0] + (tailTip[0] - tailBase[0]) * along + Math.sin(sl * 2.8 - t * 3) * 10 * sl;
          const by = tailBase[1] + (tailTip[1] - tailBase[1]) * along;
          const w = layer.w * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.1 + 0.08)), 0.7) * (1 - 0.2 * s);
          const lick = 4 * s * wobble(s * 8 - t * 9 + k);
          left.push([bx - w - lick, by + w * 0.2]);
          right.push([bx + w + lick * 0.6, by - w * 0.2]);
        }
        const tipFlick: Point = [left[steps][0] + 6 * wobble(t * 6 + k), left[steps][1] - 8 - 4 * wobble(t * 5 + k * 2)];
        layer.node.setAttribute('d', smoothClosed([...left, tipFlick, ...right.reverse()]));
      });
      const b = 1 + 0.018 * Math.sin(t * 2);
      breathe.setAttribute('transform', scaleAbout(1, b, 104, 170));
      head.setAttribute('transform', rotateAbout(3 * Math.sin(t * 0.9), 112, 110));
      ears.forEach((ear, i) => {
        const twitch = 12 * Math.pow(Math.max(0, Math.sin(t * 1.1 + i * 2)), 12);
        ear.g.setAttribute('transform', rotateAbout(i ? twitch : -twitch, ear.base[0], ear.base[1]));
      });
      const closed = blink(t, 3.2, 0.5);
      eyes.forEach((e) => e.pose(closed, 1.2));
      sparks.forEach((s, i) => {
        const p = (t * 0.5 + i / sparks.length) % 1;
        s.setAttribute('cx', (tailTip[0] + 12 * Math.sin(p * 7 + i * 2) + i * 2).toFixed(1));
        s.setAttribute('cy', (tailTip[1] - 4 - p * 46).toFixed(1));
        s.setAttribute('r', (2.4 * (1 - p)).toFixed(2));
        s.setAttribute('opacity', (1 - p).toFixed(2));
      });
    },
  };
};

/** A faceted boulder on four stubby legs, growing crystals. */
export const cragmite: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const body = el('g');
  root.append(shadow(56), body);

  const legs = [70, 88, 114, 132].map((x) => {
    const leg = el('path', { d: `M${x - 7} 140h14l-2 26h-10z`, fill: c(30, 8, 34), stroke: INK, 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
    body.appendChild(leg);
    return { leg, x };
  });

  const cx = 100;
  const cy = 118;
  const n = 9;
  const verts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + range(rng, -0.12, 0.12);
    const r = range(rng, 0.88, 1.08);
    verts.push([cx + Math.cos(a) * 54 * r, cy + Math.sin(a) * 34 * r * (Math.sin(a) > 0 ? 0.85 : 1.05)]);
  }
  const hub: Point = [cx - 8, cy - 10];
  const light = (-135 * Math.PI) / 180;
  verts.forEach((v, i) => {
    const w = verts[(i + 1) % n];
    const mid = Math.atan2((v[1] + w[1]) / 2 - cy, (v[0] + w[0]) / 2 - cx);
    const l = 40 + 16 * Math.cos(mid - light);
    body.appendChild(
      el('path', {
        d: `M${hub[0]} ${hub[1]}L${v[0].toFixed(1)} ${v[1].toFixed(1)}L${w[0].toFixed(1)} ${w[1].toFixed(1)}Z`,
        fill: c(32, 10, l),
        stroke: c(30, 12, 28),
        'stroke-width': 0.8,
        'stroke-linejoin': 'round',
      }),
    );
  });
  body.appendChild(el('path', { d: `M${verts.map((v) => v.map((n2) => n2.toFixed(1)).join(' ')).join('L')}Z`, fill: 'none', stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));

  for (let i = 0; i < 3; i++) {
    const [x, y] = [range(rng, 70, 120), range(rng, 92, 104)];
    body.appendChild(el('path', { d: smoothClosed(blobPoints(x, y, range(rng, 6, 10), range(rng, 3, 5), [[0.2, 3, rng() * 6]], 10)), fill: c(96, 32, 40), opacity: 0.85 }));
  }

  const glow = glowFilter(defs, 4);
  const crystals = el('g');
  const glowLayer = el('g', { filter: glow });
  body.append(glowLayer, crystals);
  const crystalHue = 260 + rng() * 40;
  [
    { x: 84, h: 44, w: 9, tilt: -18 },
    { x: 100, h: 58, w: 11, tilt: 4 },
    { x: 116, h: 36, w: 8, tilt: 22 },
  ].forEach((s) => {
    const baseY = cy - 28 + Math.abs(s.x - 100) * 0.18;
    const shape = `M${-s.w} 0L${-s.w * 0.8} ${-s.h * 0.75}L0 ${-s.h}L${s.w * 0.8} ${-s.h * 0.75}L${s.w} 0Z`;
    const transform = `${translate(s.x, baseY)} rotate(${s.tilt})`;
    glowLayer.appendChild(el('path', { d: shape, fill: fixed(crystalHue, 90, 70), transform }));
    const g = el('g', { transform });
    g.appendChild(el('path', { d: shape, fill: fixed(crystalHue, 50, 46), stroke: INK, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
    g.appendChild(el('path', { d: `M0 ${-s.h}L${s.w * 0.8} ${-s.h * 0.75}L${s.w} 0L0 0Z`, fill: fixed(crystalHue, 55, 66) }));
    g.appendChild(el('path', { d: `M0 ${-s.h}L0 0`, stroke: fixed(crystalHue, 60, 82), 'stroke-width': 1 }));
    crystals.appendChild(g);
  });

  body.appendChild(el('path', { d: 'M118 108L152 104L150 112L120 116Z', fill: c(30, 10, 26) }));
  const eyeGlow = el('g', { filter: glow });
  const eyes = el('g');
  for (const [x, y] of [[130, 118], [146, 116]] as Point[]) {
    eyeGlow.appendChild(el('ellipse', { cx: x, cy: y, rx: 6, ry: 3, fill: fixed(48, 100, 60) }));
    eyes.appendChild(el('ellipse', { cx: x, cy: y, rx: 5, ry: 2.4, fill: fixed(50, 100, 76) }));
  }
  body.append(eyeGlow, eyes);
  body.appendChild(el('path', { d: 'M132 132q8 4 16-1', fill: 'none', stroke: INK, 'stroke-width': 1.6, 'stroke-linecap': 'round' }));

  const rune = el('path', {
    d: 'M74 116l8-10l8 10l-8 10z M82 106v20 M76 116h12',
    fill: 'none',
    stroke: fixed(crystalHue, 90, 75),
    'stroke-width': 1.6,
    filter: glow,
  });
  body.appendChild(rune);

  return {
    root,
    tick(t) {
      const b = 1 + 0.012 * Math.sin(t * 1.2);
      body.setAttribute('transform', `${scaleAbout(1, b, 100, 166)} ${rotateAbout(1.5 * Math.sin(t * 0.8), 100, 166)}`);
      legs.forEach(({ leg, x }, i) => leg.setAttribute('transform', rotateAbout(6 * Math.sin(t * 2 + (i % 2) * Math.PI), x, 140)));
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.7);
      glowLayer.setAttribute('opacity', pulse.toFixed(2));
      rune.setAttribute('opacity', (0.4 + 0.6 * pulse).toFixed(2));
      const closed = blink(t, 5, 2);
      eyes.setAttribute('transform', scaleAbout(1, 1 - closed * 0.9, 138, 117));
      eyeGlow.setAttribute('transform', scaleAbout(1, 1 - closed * 0.9, 138, 117));
    },
  };
};

/** A round owl that rides its own little whirlwinds. */
export const wisplume: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const swirls = el('g');
  const hover = el('g');
  root.append(shadow(36), swirls, hover);

  const spiral = (turns: number, r0: number, r1: number) => {
    const pts: Point[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const a = s * turns * TAU;
      const r = r0 + (r1 - r0) * s;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.45]);
    }
    return smoothOpen(pts);
  };
  const swirlNodes = [0, 1, 2].map((i) => {
    const node = el('path', {
      d: spiral(1.4, 6, 34 + i * 6),
      fill: 'none',
      stroke: c(200, 45, 78),
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
      'stroke-dasharray': '30 18',
      opacity: 0.7,
    });
    swirls.appendChild(node);
    return node;
  });

  const wingFor = (side: 1 | -1) => {
    const g = el('g');
    const lengths = [40, 36, 31, 26];
    lengths.forEach((len, i) => {
      g.appendChild(
        el('path', {
          d: leafPath(len, 8),
          fill: i % 2 ? c(208, 34, 58) : c(210, 32, 48),
          stroke: INK,
          'stroke-width': 1.2,
          transform: `${translate(100 - side * 34, 104)} rotate(${side > 0 ? 180 - 26 - i * 16 : 26 + i * 16})`,
        }),
      );
    });
    hover.appendChild(g);
    return g;
  };
  const wings = [wingFor(1), wingFor(-1)];

  const bodyPts: Point[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    bodyPts.push([100 + Math.cos(a) * 40 * (1 + 0.12 * Math.sin(a)), 112 + Math.sin(a) * 46]);
  }
  hover.appendChild(el('path', { d: smoothClosed(bodyPts), fill: linearGradient(defs, [[0, c(206, 32, 72)], [1, c(212, 34, 50)]]), stroke: INK, 'stroke-width': 2 }));
  hover.appendChild(el('ellipse', { cx: 100, cy: 130, rx: 25, ry: 24, fill: c(40, 38, 90) }));
  for (let row = 0; row < 3; row++)
    for (let i = -2 + (row % 2) * 0.5; i <= 2; i++) {
      const x = 100 + i * 9 - 4;
      const y = 120 + row * 9;
      if (Math.abs(x + 4 - 100) > 20 - row * 2) continue;
      hover.appendChild(el('path', { d: `M${x} ${y}q4 5 8 0`, fill: 'none', stroke: c(206, 30, 62), 'stroke-width': 1.3 }));
    }

  const tufts = [
    { x: 80, y: 74, a: -118 },
    { x: 120, y: 74, a: -62 },
  ].map((tuft) => {
    const node = el('path', { d: leafPath(20, 5), fill: c(210, 32, 50), stroke: INK, 'stroke-width': 1.2 });
    hover.appendChild(node);
    return { node, ...tuft };
  });

  hover.appendChild(el('path', { d: 'M100 106C86 116 64 104 68 88C72 74 92 74 100 84C108 74 128 74 132 88C136 104 114 116 100 106Z', fill: c(40, 30, 94), stroke: c(206, 25, 60), 'stroke-width': 1.4 }));
  const iris = fixed(range(rng, 30, 46), 90, 54);
  const eyes = [eye(86, 93, 10, iris, { sclera: '#fffaf0', pupil: 0.5 }), eye(114, 93, 10, iris, { sclera: '#fffaf0', pupil: 0.5 })];
  hover.append(...eyes.map((e) => e.node));
  hover.appendChild(el('path', { d: 'M96 102L104 102L100 111Z', fill: fixed(34, 60, 42), stroke: INK, 'stroke-width': 1 }));
  for (const x of [90, 110]) hover.appendChild(el('path', { d: `M${x - 6} 158q6 6 12 0`, fill: 'none', stroke: fixed(34, 60, 38), 'stroke-width': 3, 'stroke-linecap': 'round' }));

  return {
    root,
    tick(t) {
      const hy = -6 + 6 * Math.sin(t * 1.6);
      hover.setAttribute('transform', translate(0, hy));
      const burst = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * 0.8)), 2);
      const flap = 22 * burst * Math.sin(t * 9);
      wings[0].setAttribute('transform', rotateAbout(flap, 66, 104));
      wings[1].setAttribute('transform', rotateAbout(-flap, 134, 104));
      tufts.forEach((tuft, i) =>
        tuft.node.setAttribute('transform', `${translate(tuft.x, tuft.y)} rotate(${(tuft.a + 6 * Math.sin(t * 3 + i)).toFixed(1)})`),
      );
      swirlNodes.forEach((node, i) => {
        node.setAttribute('transform', `${translate(100, 150 - i * 34 + hy * 0.4)} rotate(${((t * (60 + i * 20)) % 360).toFixed(1)})`);
        node.setAttribute('stroke-dashoffset', (-t * 40).toFixed(1));
        node.setAttribute('opacity', (0.3 + 0.3 * Math.sin(t * 1.3 + i * 2)).toFixed(2));
      });
      const closed = blink(t, 5.2, 1.4);
      eyes.forEach((e) => e.pose(closed, 1.5 * Math.sin(t * 0.5)));
    },
  };
};

/** A lantern moth with glowing eyespots and long trailing hindwings. */
export const lumoth: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const halo = el('circle', { cx: 100, cy: 104, r: 78, fill: radialGradient(defs, [[0, fixed(50, 100, 75), 0.55], [1, fixed(50, 100, 75), 0]]) });
  const hover = el('g');
  root.append(shadow(30), halo, hover);

  const wingFill = radialGradient(defs, [[0, c(48, 92, 76)], [0.7, c(36, 82, 58)], [1, c(24, 70, 42)]], 0.2, 0.5);
  const spotHue = 190 + rng() * 140;
  const makeWing = () => {
    const g = el('g');
    const fore: Point[] = [[102, 92], [124, 62], [156, 48], [176, 62], [168, 92], [128, 104]];
    const hind: Point[] = [[102, 104], [130, 106], [152, 124], [146, 144], [140, 176], [128, 150], [108, 128]];
    g.appendChild(el('path', { d: smoothClosed(hind, 0.9), fill: wingFill, stroke: INK, 'stroke-width': 1.6 }));
    g.appendChild(el('path', { d: smoothClosed(fore, 0.9), fill: wingFill, stroke: INK, 'stroke-width': 1.6 }));
    for (const [x, y] of [[130, 64], [158, 58], [166, 84], [146, 124], [138, 160]] as Point[])
      g.appendChild(el('path', { d: `M103 98Q${(103 + x) / 2} ${(98 + y) / 2 + 6} ${x} ${y}`, fill: 'none', stroke: c(30, 60, 40), 'stroke-width': 0.9, opacity: 0.6 }));
    [9, 6, 3].forEach((r, i) => g.appendChild(el('circle', { cx: 148, cy: 74, r, fill: [fixed(spotHue, 50, 30), fixed(spotHue, 70, 62), '#fffbe8'][i] })));
    g.appendChild(el('circle', { cx: 134, cy: 128, r: 4, fill: fixed(spotHue, 60, 48) }));
    hover.appendChild(g);
    return g;
  };
  const right = makeWing();
  const left = makeWing();

  const fuzzy = (x: number, y: number, r: number, fill: string) =>
    el('path', { d: smoothClosed(blobPoints(x, y, r, r, [[0.08, 11, 0]], 33)), fill, stroke: INK, 'stroke-width': 1.4 });
  hover.appendChild(el('ellipse', { cx: 100, cy: 128, rx: 7, ry: 22, fill: c(38, 50, 62), stroke: INK, 'stroke-width': 1.4 }));
  for (let i = 0; i < 4; i++) hover.appendChild(el('path', { d: `M94 ${116 + i * 8}q6 3 12 0`, fill: 'none', stroke: c(30, 50, 40), 'stroke-width': 1.2 }));
  hover.appendChild(fuzzy(100, 99, 11, c(44, 40, 88)));
  hover.appendChild(fuzzy(100, 83, 8, c(42, 45, 80)));
  for (const x of [96, 104]) hover.appendChild(el('circle', { cx: x, cy: 83, r: 2.6, fill: INK }));
  const antennae = [-1, 1].map((side) => {
    const g = el('g');
    g.appendChild(el('path', { d: `M${100 + side * 3} 77Q${100 + side * 10} 58 ${100 + side * 24} 48`, fill: 'none', stroke: INK, 'stroke-width': 1.5 }));
    for (let i = 1; i < 6; i++) {
      const s = i / 6;
      const x = 100 + side * (3 + 21 * s);
      const y = 77 - 29 * s;
      g.appendChild(el('path', { d: `M${x} ${y}l${side * 5} 2M${x} ${y}l${-side * 2} -5`, stroke: INK, 'stroke-width': 0.9 }));
    }
    hover.appendChild(g);
    return { g, side };
  });

  const sparkles = Array.from({ length: 6 }, () => {
    const s = el('path', { d: starPath(5), fill: fixed(50, 100, 82) });
    root.appendChild(s);
    return s;
  });

  return {
    root,
    tick(t) {
      const hy = -4 + 4 * Math.sin(t * 2.2);
      hover.setAttribute('transform', translate(0, hy));
      const sx = 0.6 + 0.4 * Math.cos(t * 5);
      right.setAttribute('transform', scaleAbout(sx, 1, 100, 100));
      left.setAttribute('transform', scaleAbout(-sx, 1, 100, 100));
      antennae.forEach(({ g, side }) => g.setAttribute('transform', rotateAbout(side * 4 * Math.sin(t * 3), 100, 77)));
      halo.setAttribute('opacity', (0.6 + 0.4 * Math.sin(t * 1.5)).toFixed(2));
      sparkles.forEach((s, i) => {
        const a = t * 0.6 + (i / sparkles.length) * TAU;
        const r = 66 + 8 * Math.sin(t + i);
        const k = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 1.3));
        s.setAttribute('transform', `${translate(100 + Math.cos(a) * r, 104 + Math.sin(a) * r * 0.6 + hy)} scale(${k.toFixed(2)})`);
      });
    },
  };
};

export const PET_ART: Record<string, Drawer> = { bramblet, driftfin, emberkit, cragmite, wisplume, lumoth };
export type { Art };
