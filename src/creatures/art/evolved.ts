import { bramblet, cragmite, driftfin, emberkit, lumoth, wisplume } from './pets';
import {
  blobPoints,
  el,
  glowFilter,
  leafPath,
  polyPath,
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
import type { ArtContext, Drawer } from './types';

// Evolved forms grow out of their younger selves: the base drawing, recoloured and scaled up,
// with new parts layered behind and in front.

const INK = '#2a1d10';

interface Grown {
  root: SVGGElement;
  behind: SVGGElement;
  front: SVGGElement;
  tickBase(t: number): void;
}

function grow(base: Drawer, ctx: ArtContext, tone: { dh?: number; ks?: number; kl?: number }, scale: number): Grown {
  const { dh = 0, ks = 1, kl = 1 } = tone;
  const art = base({ ...ctx, c: (h, s, l) => ctx.c(h + dh, s * ks, l * kl) });
  const root = el('g');
  const behind = el('g');
  const front = el('g');
  const body = el('g', { transform: scaleAbout(scale, scale, 100, 172) });
  body.append(behind, art.root, front);
  root.appendChild(body);
  return { root, behind, front, tickBase: art.tick };
}

/** A flame tongue from `base` toward `tip`, as a closed path. */
function flamePath(base: Point, tip: Point, width: number, t: number, k: number): string {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    const bx = base[0] + (tip[0] - base[0]) * s + Math.sin(s * 2.8 - t * 3 + k) * 8 * s;
    const by = base[1] + (tip[1] - base[1]) * s;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.1 + 0.08)), 0.7) * (1 - 0.2 * s);
    const lick = 3.5 * s * wobble(s * 8 - t * 9 + k);
    left.push([bx - w - lick, by + w * 0.2]);
    right.push([bx + w + lick * 0.6, by - w * 0.2]);
  }
  const flick: Point = [left[10][0] + 5 * wobble(t * 6 + k), left[10][1] - 7 - 3 * wobble(t * 5 + k * 2)];
  return smoothClosed([...left, flick, ...right.reverse()]);
}

export const thornwarden: Drawer = (ctx) => {
  const g = grow(bramblet, ctx, { dh: -8, ks: 1.1, kl: 0.88 }, 1.08);
  const thorns = Array.from({ length: 7 }, (_, i) => {
    const a = -165 + i * 25;
    const node = el('path', { d: 'M-5 0Q-2 -22 0 -40Q2 -22 5 0Z', fill: ctx.c(20, 30, 24), stroke: INK, 'stroke-width': 1.2 });
    g.behind.appendChild(node);
    return { node, a };
  });
  const roses = [
    [84, 74],
    [100, 68],
    [116, 74],
  ].map(([x, y], i) => {
    const rose = el('g');
    rose.appendChild(el('circle', { r: 7, fill: ctx.fixed(345 + i * 6, 62, 48), stroke: INK, 'stroke-width': 1 }));
    rose.appendChild(el('path', { d: 'M0 0a3 3 0 1 1 3 -2a5 5 0 1 1 -6 4', fill: 'none', stroke: ctx.fixed(345, 60, 30), 'stroke-width': 1.1 }));
    rose.appendChild(el('path', { d: leafPath(9, 3), fill: ctx.c(100, 40, 34), transform: `translate(4 4) rotate(30)` }));
    g.front.appendChild(rose);
    return { rose, x, y, phase: i };
  });
  const pollen = Array.from({ length: 5 }, () => {
    const p = el('circle', { r: 2, fill: ctx.fixed(52, 90, 75) });
    g.front.appendChild(p);
    return p;
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      thorns.forEach(({ node, a }, i) => {
        const rad = (a * Math.PI) / 180;
        node.setAttribute('transform', `${translate(100 + Math.cos(rad) * 40, 118 + Math.sin(rad) * 30)} rotate(${(a + 90 + 3 * Math.sin(t * 2 + i)).toFixed(1)})`);
      });
      const bob = -Math.abs(Math.sin(t * 2.1)) * 3;
      roses.forEach(({ rose, x, y, phase }) => rose.setAttribute('transform', `${translate(x, y + bob)} rotate(${(8 * Math.sin(t * 2 + phase)).toFixed(1)})`));
      pollen.forEach((p, i) => {
        const a = t * 0.8 + (i / pollen.length) * TAU;
        p.setAttribute('cx', (100 + Math.cos(a) * 62).toFixed(1));
        p.setAttribute('cy', (110 + Math.sin(a) * 26).toFixed(1));
        p.setAttribute('opacity', (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i))).toFixed(2));
      });
    },
  };
};

export const veilwyrm: Drawer = (ctx) => {
  const g = grow(driftfin, ctx, { dh: 18, ks: 1.15, kl: 0.9 }, 1.1);
  const crest = el('path', { fill: ctx.c(200, 60, 55), stroke: INK, 'stroke-width': 1.2, opacity: 0.9 });
  g.behind.appendChild(crest);
  const veils = [0, 1].map((i) => {
    const v = el('path', { fill: 'none', stroke: ctx.c(190 + i * 20, 60, 70), 'stroke-width': 3 - i, 'stroke-linecap': 'round', opacity: 0.8 });
    g.front.appendChild(v);
    return v;
  });
  const glow = glowFilter(ctx.defs, 3);
  const orbs = Array.from({ length: 3 }, () => {
    const o = el('circle', { r: 5, fill: ctx.fixed(185, 80, 75), filter: glow });
    g.front.appendChild(o);
    return o;
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      const fy = 5 * Math.sin(t * 1.4);
      const pts: Point[] = [];
      for (let i = 0; i <= 8; i++) {
        const s = i / 8;
        pts.push([140 - s * 70, 76 + fy - 34 * Math.sin(Math.PI * s) - 6 * Math.sin(s * 6 - t * 3)]);
      }
      crest.setAttribute('d', smoothOpen([[146, 84 + fy], ...pts, [70, 88 + fy]]) + 'Z');
      veils.forEach((v, i) => {
        const vp: Point[] = [];
        for (let k = 0; k <= 8; k++) {
          const s = k / 8;
          vp.push([150 - s * 110, 104 + fy + i * 8 + s * 30 + 10 * s * Math.sin(s * 5 - t * 2.4 + i)]);
        }
        v.setAttribute('d', smoothOpen(vp));
      });
      orbs.forEach((o, i) => {
        const a = t * 1.1 + (i / 3) * TAU;
        o.setAttribute('cx', (110 + Math.cos(a) * 70).toFixed(1));
        o.setAttribute('cy', (100 + fy + Math.sin(a) * 22).toFixed(1));
        o.setAttribute('opacity', (0.5 + 0.5 * Math.sin(a)).toFixed(2));
      });
    },
  };
};

export const pyrevixen: Drawer = (ctx) => {
  const g = grow(emberkit, ctx, { dh: -6, ks: 1.1, kl: 0.92 }, 1.08);
  const extra = [
    { tip: [24, 96] as Point, k: 1.3 },
    { tip: [64, 44] as Point, k: 2.6 },
  ].map(({ tip, k }) => {
    const layers = [
      { color: ctx.fixed(5, 80, 44), w: 20 },
      { color: ctx.fixed(28, 95, 56), w: 12 },
      { color: ctx.fixed(48, 100, 72), w: 5 },
    ].map((layer, i) => {
      const node = el('path', { fill: layer.color, ...(i === 0 ? { stroke: INK, 'stroke-width': 1.3 } : {}) });
      g.behind.appendChild(node);
      return { node, ...layer };
    });
    return { tip, k, layers };
  });
  const crown = el('path', { fill: ctx.fixed(40, 100, 62), stroke: INK, 'stroke-width': 1 });
  g.front.appendChild(crown);
  g.front.appendChild(el('path', { d: 'M100 84l6 -4M100 92l7 -2M136 86l-5 -4', stroke: ctx.fixed(10, 85, 40), 'stroke-width': 2, 'stroke-linecap': 'round' }));
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      for (const tail of extra)
        tail.layers.forEach((layer, i) => {
          const tip: Point = [76 + (tail.tip[0] - 76) * (1 - i * 0.2), 150 + (tail.tip[1] - 150) * (1 - i * 0.2)];
          layer.node.setAttribute('d', flamePath([76, 150], tip, layer.w, t, tail.k + i));
        });
      crown.setAttribute('d', flamePath([112, 70], [114, 46 + 3 * Math.sin(t * 3)], 6, t * 1.3, 5));
    },
  };
};

export const bastilith: Drawer = (ctx) => {
  const g = grow(cragmite, ctx, { dh: 4, ks: 1.1, kl: 0.95 }, 1.06);
  const tower = el('g');
  const stone = ctx.c(32, 12, 58);
  tower.appendChild(el('path', { d: 'M48 86h26v-30h-4v-6h-4v6h-4v-6h-4v6h-4v-6h-4v6h-2z', fill: stone, stroke: INK, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  for (const [x, y] of [[54, 64], [62, 72], [54, 80]] as Point[]) tower.appendChild(el('path', { d: `M${x} ${y}h6`, stroke: ctx.c(30, 12, 38), 'stroke-width': 1.2 }));
  tower.appendChild(el('rect', { x: 58, y: 60, width: 5, height: 8, rx: 2.5, fill: ctx.fixed(45, 90, 60) }));
  tower.appendChild(el('path', { d: 'M61 50v-18', stroke: INK, 'stroke-width': 1.5 }));
  const flag = el('path', { fill: ctx.fixed(355, 60, 45), stroke: INK, 'stroke-width': 1 });
  tower.appendChild(flag);
  g.behind.appendChild(tower);
  const ivy = el('path', { d: 'M74 86q-8 10 -2 22q4 8 -2 16', fill: 'none', stroke: ctx.c(100, 35, 34), 'stroke-width': 2 });
  g.front.appendChild(ivy);
  for (const [x, y] of [[70, 100], [74, 112], [70, 122]] as Point[]) g.front.appendChild(el('path', { d: leafPath(7, 3), fill: ctx.c(100, 40, 40), transform: `${translate(x, y)} rotate(200)` }));
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      const pts: Point[] = [[61, 32]];
      for (let i = 1; i <= 5; i++) pts.push([61 + i * 4, 32 + 2 * Math.sin(t * 5 - i) + i * 0.3]);
      for (let i = 5; i >= 0; i--) pts.push([61 + i * 4, 42 + 2 * Math.sin(t * 5 - i) - i * 0.3]);
      flag.setAttribute('d', polyPath(pts));
    },
  };
};

export const stormplume: Drawer = (ctx) => {
  const g = grow(wisplume, ctx, { dh: 20, ks: 1.1, kl: 0.82 }, 1.06);
  const cloud = el('path', { d: smoothClosed(blobPoints(100, 38, 36, 12, [[0.14, 4, 1], [0.06, 7, 2]])), fill: ctx.fixed(225, 18, 42), stroke: INK, 'stroke-width': 1.2 });
  const bolt = el('path', { d: 'M104 46l-8 14h7l-6 14l14 -18h-7l6 -10z', fill: ctx.fixed(52, 100, 66), stroke: INK, 'stroke-width': 1 });
  const rain = Array.from({ length: 6 }, (_, i) => {
    const r = el('path', { d: 'M0 0l-2 7', stroke: ctx.fixed(205, 60, 70), 'stroke-width': 1.6, 'stroke-linecap': 'round' });
    g.behind.appendChild(r);
    return { r, x: 72 + i * 11 };
  });
  g.behind.append(bolt, cloud);
  const horns = [-1, 1].map((side) => {
    const h = el('path', { d: `M${100 + side * 18} 76Q${100 + side * 34} 62 ${100 + side * 30} 42Q${100 + side * 26} 60 ${100 + side * 10} 72Z`, fill: ctx.c(40, 30, 80), stroke: INK, 'stroke-width': 1.3 });
    g.front.appendChild(h);
    return h;
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      const hy = -6 + 6 * Math.sin(t * 1.6);
      cloud.setAttribute('transform', translate(3 * Math.sin(t * 0.7), hy * 0.5));
      const flash = (t % 3.2) < 0.18 ? 1 : 0;
      bolt.setAttribute('opacity', String(flash));
      bolt.setAttribute('transform', translate(0, hy * 0.5));
      rain.forEach(({ r, x }, i) => {
        const p = (t * 1.6 + i / rain.length) % 1;
        r.setAttribute('transform', translate(x, 50 + p * 34 + hy * 0.5));
        r.setAttribute('opacity', (0.8 * (1 - p)).toFixed(2));
      });
      horns.forEach((h) => h.setAttribute('transform', translate(0, hy)));
    },
  };
};

export const gloamwing: Drawer = (ctx) => {
  const g = grow(lumoth, ctx, { dh: 225, ks: 0.75, kl: 0.8 }, 1.08);
  const glow = glowFilter(ctx.defs, 4);
  const lanternGlow = el('circle', { r: 16, fill: radialGradient(ctx.defs, [[0, ctx.fixed(48, 100, 80), 0.9], [1, ctx.fixed(48, 100, 60), 0]]) });
  const lantern = el('g');
  lantern.appendChild(el('path', { d: 'M100 150v10', stroke: INK, 'stroke-width': 1.4 }));
  lantern.appendChild(el('path', { d: 'M94 160h12l-2 14h-8z', fill: ctx.fixed(48, 95, 66), stroke: INK, 'stroke-width': 1.3, filter: glow }));
  lantern.appendChild(el('path', { d: 'M94 160h12l-2 14h-8z M100 160v14', fill: 'none', stroke: INK, 'stroke-width': 1.1 }));
  g.front.append(lanternGlow, lantern);
  const motes = Array.from({ length: 7 }, () => {
    const m = el('path', { d: starPath(4), fill: ctx.fixed(270, 60, 80) });
    g.front.appendChild(m);
    return m;
  });
  const rings = [0, 1].map(() => {
    const r = el('ellipse', { cx: 100, cy: 104, fill: 'none', stroke: ctx.fixed(270, 60, 75), 'stroke-width': 1.2 });
    g.behind.appendChild(r);
    return r;
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      const hy = -4 + 4 * Math.sin(t * 2.2);
      const swing = 10 * Math.sin(t * 1.8);
      lantern.setAttribute('transform', `${translate(0, hy)} ${rotateAbout(swing, 100, 150)}`);
      const a = (swing * Math.PI) / 180;
      lanternGlow.setAttribute('cx', (100 - Math.sin(a) * 18).toFixed(1));
      lanternGlow.setAttribute('cy', (150 + Math.cos(a) * 18 + hy).toFixed(1));
      lanternGlow.setAttribute('opacity', (0.7 + 0.3 * wobble(t * 4)).toFixed(2));
      motes.forEach((m, i) => {
        const p = (t * 0.25 + i / motes.length) % 1;
        m.setAttribute('transform', `${translate(100 + 60 * Math.sin(i * 2.1 + t * 0.5), 170 - p * 150)} scale(${(Math.sin(p * Math.PI)).toFixed(2)})`);
      });
      rings.forEach((r, i) => {
        const p = (t * 0.4 + i * 0.5) % 1;
        r.setAttribute('rx', (40 + p * 50).toFixed(1));
        r.setAttribute('ry', (14 + p * 18).toFixed(1));
        r.setAttribute('opacity', (0.6 * (1 - p)).toFixed(2));
      });
    },
  };
};

export const EVOLVED_ART: Record<string, Drawer> = { thornwarden, veilwyrm, pyrevixen, bastilith, stormplume, gloamwing };
