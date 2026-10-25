import { range } from '../rng';
import { blink, blobPoints, el, glowFilter, leafPath, linearGradient, radialGradient, rotateAbout, scaleAbout, smoothClosed, smoothOpen, TAU, translate, wobble, type Point } from '../svg';
import { grow } from './evolved';
import { eye, INK } from './pets';
import type { Drawer } from './types';

// The third wave of Wildlings and their evolved forms, drawn like the rest: a few curves,
// a little randomness from the seed, and a tick that keeps them alive.

const SHADOW = 'rgba(42, 26, 12, 0.28)';
const shadow = (rx: number) => el('ellipse', { cx: 100, cy: 172, rx, ry: rx * 0.16, fill: SHADOW });

/** A fawn dappled with moss, with two curled fern fronds for first antlers. */
export const mossfawn: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const body = el('g');
  root.append(shadow(46), body);
  const fur = c(28, 46, 50);
  const furDark = c(24, 44, 36);
  const cream = c(38, 50, 86);
  const moss = c(96, 42, 40);

  // Legs: the far pair a shade darker, so the fawn reads as standing in depth.
  const legs = [
    { x: 76, far: true },
    { x: 116, far: true },
    { x: 70, far: false },
    { x: 122, far: false },
  ].map(({ x, far }) => {
    const g = el('g');
    g.appendChild(el('path', { d: `M${x - 4} 128L${x - 3} 164L${x + 3} 164L${x + 4} 128Z`, fill: far ? furDark : fur, stroke: INK, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
    g.appendChild(el('ellipse', { cx: x, cy: 166, rx: 4.5, ry: 3, fill: INK }));
    body.appendChild(g);
    return { g, x };
  });
  body.appendChild(el('path', { d: 'M58 114Q48 104 52 98Q60 104 64 112Z', fill: cream, stroke: INK, 'stroke-width': 1.3 }));
  body.appendChild(
    el('path', {
      d: smoothClosed(blobPoints(96, 120, 40, 20, [[0.04, 2, 0.3]])),
      fill: linearGradient(defs, [[0, fur], [1, furDark]]),
      stroke: INK,
      'stroke-width': 2,
    }),
  );
  body.appendChild(el('path', { d: 'M72 132Q96 142 120 132Q110 138 96 139Q82 138 72 132Z', fill: cream, opacity: 0.85 }));
  // Moss dapples along the back.
  const dapples = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < dapples; i++) {
    const x = 68 + (i / (dapples - 1)) * 54 + range(rng, -3, 3);
    const y = 108 + range(rng, -2, 8);
    body.appendChild(el('path', { d: smoothClosed(blobPoints(x, y, range(rng, 4, 6.5), range(rng, 3, 4.5), [[0.18, 5, rng() * TAU]], 14)), fill: moss, opacity: 0.9 }));
    body.appendChild(el('circle', { cx: x - 1.5, cy: y - 1, r: 1.2, fill: fixed(80, 60, 70), opacity: 0.8 }));
  }

  const head = el('g');
  body.appendChild(head);
  head.appendChild(el('path', { d: 'M118 112Q124 94 134 84L146 92Q140 104 132 118Z', fill: fur, stroke: INK, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
  const ears = [
    { d: 'M134 76Q118 62 112 70Q120 80 134 82Z', at: [132, 78] as Point },
    { d: 'M144 74Q150 56 158 60Q156 74 146 80Z', at: [146, 78] as Point },
  ].map(({ d, at }) => {
    const g = el('g');
    g.appendChild(el('path', { d, fill: fur, stroke: INK, 'stroke-width': 1.5 }));
    head.appendChild(g);
    return { g, at };
  });
  // Fern-frond antlers: a curl with little leaflets.
  for (const [bx, lean] of [
    [136, -1],
    [146, 1],
  ] as const) {
    const pts: Point[] = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      const curl = s * s * 1.6;
      pts.push([bx + lean * 8 * s + Math.sin(curl * 2.4) * 8 * lean, 78 - 34 * s + (1 - Math.cos(curl * 2.4)) * 5]);
    }
    head.appendChild(el('path', { d: smoothOpen(pts), fill: 'none', stroke: c(100, 46, 34), 'stroke-width': 3, 'stroke-linecap': 'round' }));
    for (let i = 2; i < 8; i += 2) {
      const [x, y] = pts[i];
      for (const side of [-1, 1]) head.appendChild(el('path', { d: leafPath(8, 3), fill: c(100, 52, 44), transform: `${translate(x, y)} rotate(${side < 0 ? 200 : -20})` }));
    }
  }
  head.appendChild(el('path', { d: smoothClosed(blobPoints(146, 88, 15, 11, [[0.06, 2, 0.4]])), fill: fur, stroke: INK, 'stroke-width': 1.8 }));
  head.appendChild(el('path', { d: 'M150 90Q160 88 164 94Q160 100 150 98Z', fill: cream, stroke: INK, 'stroke-width': 1.2 }));
  head.appendChild(el('ellipse', { cx: 163, cy: 93, rx: 2.6, ry: 2.2, fill: INK }));
  const e = eye(146, 85, 4.6, fixed(26, 50, 30), { sclera: fixed(40, 30, 96), pupil: 0.55 });
  head.appendChild(e.node);
  head.appendChild(el('circle', { cx: 141, cy: 93, r: 2.4, fill: fixed(8, 60, 74), opacity: 0.5 }));

  return {
    root,
    tick(t) {
      const prance = Math.max(0, Math.sin(t * 1.6));
      body.setAttribute('transform', translate(0, -2.5 * prance * prance));
      head.setAttribute('transform', rotateAbout(4 * Math.sin(t * 0.8) - 2 * prance, 128, 112));
      ears.forEach((ear, i) => {
        const flick = 18 * Math.pow(Math.max(0, Math.sin(t * 0.9 + i * 2.2)), 14);
        ear.g.setAttribute('transform', rotateAbout(i ? -flick : flick, ear.at[0], ear.at[1]));
      });
      legs.forEach((leg, i) => leg.g.setAttribute('transform', rotateAbout(3 * Math.sin(t * 1.6 + i * 1.3) * prance, leg.x, 128)));
      e.pose(blink(t, 3.8, 0.4), 0.6);
    },
  };
};

/** An otter sitting up on its tail, a favourite skipping stone held to its chest. */
export const rillotter: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const sway = el('g');
  const tail = el('path', { fill: c(24, 34, 34), stroke: INK, 'stroke-width': 1.8 });
  root.append(shadow(44), tail, sway);
  const fur = c(26, 36, 42);
  const furDark = c(22, 34, 30);
  const cream = c(36, 44, 84);

  sway.appendChild(
    el('path', {
      d: smoothClosed(blobPoints(100, 128, 28, 40, [[0.05, 2, 1.4], [0.03, 3, 0.2]])),
      fill: linearGradient(defs, [[0, fur], [1, furDark]]),
      stroke: INK,
      'stroke-width': 2,
    }),
  );
  sway.appendChild(el('path', { d: smoothClosed(blobPoints(102, 132, 17, 30, [[0.04, 2, 0]])), fill: cream }));
  for (const x of [86, 116]) sway.appendChild(el('ellipse', { cx: x, cy: 166, rx: 11, ry: 5, fill: furDark, stroke: INK, 'stroke-width': 1.4 }));
  // The pebble, held in both paws.
  const pebble = el('g');
  pebble.appendChild(el('ellipse', { cx: 0, cy: 0, rx: 9, ry: 6.5, fill: radialGradient(defs, [[0, fixed(200, 10, 78)], [1, fixed(210, 12, 52)]], 0.35, 0.3), stroke: INK, 'stroke-width': 1.4 }));
  pebble.appendChild(el('path', { d: 'M-4 -1Q0 -4 4 -1', fill: 'none', stroke: fixed(200, 30, 90), 'stroke-width': 1, opacity: 0.8 }));
  sway.appendChild(pebble);
  const paws = [88, 114].map((x) => {
    const p = el('ellipse', { cx: x, cy: 0, rx: 7, ry: 5.5, fill: fur, stroke: INK, 'stroke-width': 1.4 });
    sway.appendChild(p);
    return p;
  });

  const head = el('g');
  sway.appendChild(head);
  for (const x of [84, 120]) head.appendChild(el('circle', { cx: x, cy: 70, r: 6, fill: fur, stroke: INK, 'stroke-width': 1.5 }));
  head.appendChild(el('path', { d: smoothClosed(blobPoints(102, 82, 24, 19, [[0.04, 2, 1.6]])), fill: fur, stroke: INK, 'stroke-width': 2 }));
  head.appendChild(el('path', { d: smoothClosed(blobPoints(103, 92, 14, 9, [[0.05, 2, 0]])), fill: cream }));
  head.appendChild(el('path', { d: 'M98 86Q103 82 108 86Q103 91 98 86Z', fill: INK }));
  head.appendChild(el('path', { d: 'M98 94Q103 98 108 94', fill: 'none', stroke: INK, 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = 103 + side * 9;
      head.appendChild(el('path', { d: `M${x} ${90 + k * 2}L${x + side * 15} ${86 + k * 4}`, stroke: fixed(40, 20, 88), 'stroke-width': 0.9, opacity: 0.85 }));
    }
  }
  const eyes = [eye(93, 78, 4.5, INK, { sclera: fixed(40, 20, 96), pupil: 0.6 }), eye(113, 78, 4.5, INK, { sclera: fixed(40, 20, 96), pupil: 0.6 })];
  head.append(...eyes.map((x) => x.node));

  const drops = Array.from({ length: 4 }, (_, i) => {
    const d = el('path', { d: 'M0 -4Q3 0 0 3Q-3 0 0 -4Z', fill: fixed(196, 70, 70), opacity: 0.8 });
    root.appendChild(d);
    return { d, x: 64 + i * 22 + range(rng, -4, 4), phase: rng() };
  });

  return {
    root,
    tick(t) {
      const s = Math.sin(t * 1.3);
      sway.setAttribute('transform', rotateAbout(2.5 * s, 100, 168));
      head.setAttribute('transform', rotateAbout(5 * Math.sin(t * 0.9 + 0.6), 102, 100));
      // A little toss of the pebble now and then.
      const toss = Math.max(0, Math.sin(t * 1.1));
      const lift = 14 * Math.pow(toss, 6);
      pebble.setAttribute('transform', `${translate(101, 116 - lift)} rotate(${(lift * 12).toFixed(0)})`);
      paws.forEach((p) => p.setAttribute('cy', (120 - lift * 0.3).toFixed(1)));
      const swish = 8 * Math.sin(t * 1.8);
      tail.setAttribute('d', `M84 158Q58 168 ${44 + swish} ${150 - swish * 0.4}Q${40 + swish} ${142} ${48 + swish} ${144}Q64 156 92 148Z`);
      eyes.forEach((x) => x.pose(blink(t, 3.6, 1.1), 0.8 * Math.sin(t * 0.5)));
      for (const { d, x, phase } of drops) {
        const q = (t * 0.4 + phase) % 1;
        d.setAttribute('transform', translate(x + 4 * wobble(t + phase * 9), 70 + q * 90));
        d.setAttribute('opacity', (0.8 * Math.sin(q * Math.PI)).toFixed(2));
      }
    },
  };
};

/** A dandelion clock that woke up: a puff of wishing-seeds round a small, shy face. */
export const dandlewisp: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const sway = el('g');
  root.append(shadow(34), sway);
  // Stem and leaf feet.
  sway.appendChild(el('path', { d: 'M100 122Q96 146 100 166', fill: 'none', stroke: c(100, 44, 38), 'stroke-width': 5, 'stroke-linecap': 'round' }));
  for (const side of [-1, 1]) sway.appendChild(el('path', { d: leafPath(24, 7), fill: c(104, 46, 42), stroke: INK, 'stroke-width': 1.2, transform: `${translate(100, 166)} rotate(${side < 0 ? 190 : -10})` }));
  const puff = el('g');
  sway.appendChild(puff);
  const glow = glowFilter(defs, 1.2);
  puff.appendChild(el('circle', { cx: 100, cy: 92, r: 44, fill: radialGradient(defs, [[0, fixed(50, 40, 98), 0.9], [1, fixed(50, 30, 92), 0]]) }));
  // Seeds: a stalk out from the core, a little burst of fluff at the end.
  const seeds: { g: SVGGElement; a: number }[] = [];
  const count = 30;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + range(rng, -0.06, 0.06);
    const r = range(rng, 34, 42);
    const g = el('g');
    g.appendChild(el('path', { d: `M0 0L${r - 4} 0`, stroke: fixed(46, 20, 82), 'stroke-width': 0.9 }));
    for (let k = -2; k <= 2; k++) g.appendChild(el('path', { d: `M${r - 4} 0l${(5 * Math.cos(k * 0.45)).toFixed(1)} ${(5 * Math.sin(k * 0.45)).toFixed(1)}`, stroke: fixed(48, 30, 97), 'stroke-width': 1, 'stroke-linecap': 'round' }));
    puff.appendChild(g);
    seeds.push({ g, a: (a * 180) / Math.PI });
  }
  const core = el('g');
  sway.appendChild(core);
  core.appendChild(el('circle', { cx: 100, cy: 94, r: 19, fill: radialGradient(defs, [[0, c(62, 56, 78)], [1, c(78, 44, 56)]], 0.4, 0.35), stroke: INK, 'stroke-width': 1.8 }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    core.appendChild(el('circle', { cx: 100 + Math.cos(a) * 14, cy: 94 + Math.sin(a) * 14, r: 1.2, fill: c(56, 40, 44), opacity: 0.7 }));
  }
  const eyes = [eye(93, 92, 3.6, INK, { sclera: fixed(50, 40, 97), pupil: 0.6 }), eye(107, 92, 3.6, INK, { sclera: fixed(50, 40, 97), pupil: 0.6 })];
  core.append(...eyes.map((x) => x.node));
  core.appendChild(el('path', { d: 'M96 100Q100 103 104 100', fill: 'none', stroke: INK, 'stroke-width': 1.3, 'stroke-linecap': 'round' }));
  for (const x of [88, 112]) core.appendChild(el('circle', { cx: x, cy: 99, r: 2.4, fill: fixed(350, 60, 76), opacity: 0.5 }));
  // Seeds that come loose and drift away on the wind.
  const loose = Array.from({ length: 3 }, (_, i) => {
    const g = el('g', { filter: glow });
    g.appendChild(el('path', { d: 'M0 0L0 8', stroke: fixed(46, 20, 82), 'stroke-width': 0.8 }));
    for (let k = -2; k <= 2; k++) g.appendChild(el('path', { d: `M0 0l${(4 * Math.sin(k * 0.5)).toFixed(1)} ${(-4 * Math.cos(k * 0.5)).toFixed(1)}`, stroke: fixed(48, 30, 97), 'stroke-width': 0.9 }));
    root.appendChild(g);
    return { g, phase: i / 3 + rng() * 0.2 };
  });
  return {
    root,
    tick(t) {
      const lean = 5 * Math.sin(t * 0.9) + 2 * wobble(t * 1.7);
      sway.setAttribute('transform', rotateAbout(lean, 100, 168));
      seeds.forEach(({ g, a }, i) => g.setAttribute('transform', `${translate(100, 92)} rotate(${(a + 2 * Math.sin(t * 1.6 + i)).toFixed(1)})`));
      puff.setAttribute('transform', scaleAbout(1 + 0.02 * Math.sin(t * 2.1), 1 + 0.02 * Math.sin(t * 2.1), 100, 92));
      eyes.forEach((x) => x.pose(blink(t, 4.2, 0.7), 0.6 * Math.sin(t * 0.6)));
      for (const { g, phase } of loose) {
        const q = (t * 0.18 + phase) % 1;
        g.setAttribute('transform', `${translate(120 + q * 70, 70 - q * 40 + 8 * Math.sin(q * 9))} rotate(${(20 * Math.sin(t + phase * 6)).toFixed(0)})`);
        g.setAttribute('opacity', (Math.sin(q * Math.PI)).toFixed(2));
      }
    },
  };
};

/** Mossfawn grown into a stag whose antlers are a living canopy. */
export const elderstag: Drawer = (ctx) => {
  const g = grow(mossfawn, ctx, { dh: -4, ks: 1.05, kl: 0.88 }, 1.14);
  const branch = ctx.c(28, 36, 28);
  const leaf = ctx.c(100, 50, 40);
  const antlers = el('g');
  g.behind.appendChild(antlers);
  const leaves: SVGPathElement[] = [];
  for (const [bx, dir] of [
    [136, -1],
    [148, 1],
  ] as const) {
    const tines: [Point, Point][] = [
      [[bx, 80], [bx + dir * 10, 28]],
      [[bx + dir * 3, 64], [bx + dir * 26, 44]],
      [[bx + dir * 6, 46], [bx + dir * 26, 20]],
      [[bx + dir * 2, 56], [bx - dir * 12, 34]],
    ];
    for (const [a, b] of tines) {
      antlers.appendChild(el('path', { d: smoothOpen([a, [(a[0] + b[0]) / 2 + dir * 2, (a[1] + b[1]) / 2], b]), fill: 'none', stroke: branch, 'stroke-width': 3.6, 'stroke-linecap': 'round' }));
      for (let k = 0; k < 2; k++) {
        const l = el('path', { d: leafPath(9, 3.4), fill: leaf, stroke: INK, 'stroke-width': 0.6, transform: `${translate(b[0], b[1])} rotate(${(dir > 0 ? -40 : 220) + k * 70 * dir})` });
        antlers.appendChild(l);
        leaves.push(l);
      }
    }
  }
  const wren = el('circle', { cx: 144, cy: 34, r: 3.5, fill: ctx.fixed(30, 40, 46), stroke: INK, 'stroke-width': 0.8 });
  antlers.appendChild(wren);
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      antlers.setAttribute('transform', rotateAbout(4 * Math.sin(t * 0.8), 140, 100));
      leaves.forEach((l, i) => l.setAttribute('opacity', (0.85 + 0.15 * Math.sin(t * 2 + i)).toFixed(2)));
      wren.setAttribute('cy', (34 - 3 * Math.max(0, Math.sin(t * 3.1))).toFixed(1));
    },
  };
};

/** Rillotter grown big, its tail a rudder of rushing water. */
export const torrentail: Drawer = (ctx) => {
  const g = grow(rillotter, ctx, { dh: -6, ks: 1.1, kl: 0.9 }, 1.12);
  const water = [ctx.fixed(196, 70, 52), ctx.fixed(190, 70, 66), ctx.fixed(186, 60, 84)];
  const ribbons = water.map((color, i) => {
    const p = el('path', { fill: 'none', stroke: color, 'stroke-width': 8 - i * 2.4, 'stroke-linecap': 'round', opacity: 0.9 });
    g.behind.appendChild(p);
    return p;
  });
  // A ring of splash where it stands, as if the brook follows it about.
  const splash = el('path', { fill: ctx.fixed(192, 60, 74), stroke: ctx.fixed(196, 60, 46), 'stroke-width': 1.2, opacity: 0.75 });
  g.behind.appendChild(splash);
  const spray = Array.from({ length: 6 }, (_, i) => {
    const d = el('circle', { r: 2, fill: ctx.fixed(190, 70, 86) });
    g.front.appendChild(d);
    return { d, phase: i / 6 };
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      ribbons.forEach((p, i) => {
        const pts: Point[] = Array.from({ length: 7 }, (_, k) => [88 - k * 9, 156 - k * 6 + 6 * Math.sin(t * 3 + k * 0.9 + i)]);
        p.setAttribute('d', smoothOpen(pts));
      });
      const ring: Point[] = Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * TAU;
        const crest = k % 2 ? 1 : 1.25 + 0.12 * Math.sin(t * 4 + k);
        return [100 + Math.cos(a) * 48 * crest, 168 + Math.sin(a) * 9 * crest];
      });
      splash.setAttribute('d', smoothClosed(ring));
      for (const { d, phase } of spray) {
        const q = (t * 0.7 + phase) % 1;
        d.setAttribute('cx', (34 - q * 10 + 4 * Math.sin(phase * 20)).toFixed(1));
        d.setAttribute('cy', (120 - q * 30).toFixed(1));
        d.setAttribute('opacity', (1 - q).toFixed(2));
      }
    },
  };
};

/** Dandlewisp grown into a crown of a thousand wishes, with a little storm of seeds about it. */
export const seedstorm: Drawer = (ctx) => {
  const g = grow(dandlewisp, ctx, { dh: 8, ks: 1.1, kl: 0.94 }, 1.16);
  const glow = glowFilter(ctx.defs, 1.6);
  const halo = el('circle', { cx: 100, cy: 92, r: 54, fill: 'none', stroke: ctx.fixed(48, 70, 80), 'stroke-width': 2, opacity: 0.4, filter: glow });
  g.behind.appendChild(halo);
  const winds = Array.from({ length: 3 }, (_, i) => {
    const p = el('path', { fill: 'none', stroke: ctx.fixed(200, 30, 86), 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.7 });
    g.front.appendChild(p);
    return { p, phase: (i / 3) * TAU };
  });
  const orbit = Array.from({ length: 8 }, (_, i) => {
    const s = el('g', { filter: glow });
    s.appendChild(el('path', { d: 'M0 0L0 7', stroke: ctx.fixed(46, 20, 82), 'stroke-width': 0.8 }));
    for (let k = -2; k <= 2; k++) s.appendChild(el('path', { d: `M0 0l${(4 * Math.sin(k * 0.5)).toFixed(1)} ${(-4 * Math.cos(k * 0.5)).toFixed(1)}`, stroke: ctx.fixed(48, 50, 95), 'stroke-width': 0.9 }));
    g.front.appendChild(s);
    return { s, phase: (i / 8) * TAU };
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      halo.setAttribute('opacity', (0.3 + 0.2 * Math.sin(t * 1.5)).toFixed(2));
      for (const { p, phase } of winds) {
        const a = t * 0.8 + phase;
        const pts: Point[] = Array.from({ length: 6 }, (_, k) => {
          const b = a + k * 0.28;
          return [100 + Math.cos(b) * 64, 96 + Math.sin(b) * 22];
        });
        p.setAttribute('d', smoothOpen(pts));
      }
      for (const { s, phase } of orbit) {
        const a = phase + t * 0.6;
        s.setAttribute('transform', `${translate(100 + Math.cos(a) * 66, 92 + Math.sin(a) * 26)} rotate(${((a * 180) / Math.PI).toFixed(0)})`);
        s.setAttribute('opacity', (0.6 + 0.4 * Math.sin(a)).toFixed(2));
      }
    },
  };
};

export const WILDLING3_ART: Record<string, Drawer> = { mossfawn, rillotter, dandlewisp, elderstag, torrentail, seedstorm };
