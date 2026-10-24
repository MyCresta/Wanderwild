import { el, glowFilter, starPath, TAU, translate, wobble } from '../svg';
import { grow } from './evolved';
import { INK } from './pets';
import type { Drawer } from './types';
import { capling, glimhare, kitewisp, pebblit, shellop, sparkwick } from './wildlings2';

// Evolved forms of the second Wildling of each element, grown from their younger selves.

export const mirecap: Drawer = (ctx) => {
  const g = grow(capling, ctx, { dh: -10, ks: 1.1, kl: 0.9 }, 1.1);
  const glow = glowFilter(ctx.defs, 2);
  const shrooms = [
    [52, 168, 0.8],
    [146, 166, 1],
    [160, 170, 0.6],
  ].map(([x, y, k]) => {
    const m = el('g', { transform: `${translate(x, y)} scale(${k})` });
    m.appendChild(el('rect', { x: -3, y: -16, width: 6, height: 16, rx: 2, fill: ctx.fixed(45, 30, 88), stroke: INK, 'stroke-width': 1 }));
    m.appendChild(el('path', { d: 'M-12 -14Q0 -30 12 -14Z', fill: ctx.fixed(180, 70, 60), stroke: INK, 'stroke-width': 1.2 }));
    m.appendChild(el('ellipse', { cx: 0, cy: -20, rx: 10, ry: 6, fill: ctx.fixed(180, 90, 70), opacity: 0.5, filter: glow }));
    g.behind.appendChild(m);
    return m;
  });
  const motes = Array.from({ length: 8 }, (_, i) => {
    const m = el('circle', { r: 2.2, fill: ctx.fixed(180, 90, 78), filter: glow });
    g.front.appendChild(m);
    return { m, phase: (i / 8) * TAU };
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      shrooms.forEach((m, i) => m.setAttribute('opacity', (0.75 + 0.25 * Math.sin(t * 2 + i)).toFixed(2)));
      for (const { m, phase } of motes) {
        const a = phase + t * 0.6;
        m.setAttribute('cx', (100 + Math.cos(a) * 62).toFixed(1));
        m.setAttribute('cy', (110 + Math.sin(a) * 22 - 10 * Math.sin(t * 1.3 + phase)).toFixed(1));
      }
    },
  };
};

export const conchwarden: Drawer = (ctx) => {
  const g = grow(shellop, ctx, { dh: 12, ks: 1.15, kl: 0.92 }, 1.08);
  const spikes = Array.from({ length: 7 }, (_, i) => {
    const a = Math.PI * (1.05 + (i / 6) * 0.95);
    const node = el('path', { d: 'M-6 0L0 -18L6 0Z', fill: ctx.c(30, 40, 82), stroke: INK, 'stroke-width': 1.2, transform: `${translate(92 + Math.cos(a) * 44, 112 + Math.sin(a) * 40)} rotate(${((a * 180) / Math.PI + 90).toFixed(1)})` });
    g.behind.appendChild(node);
    return node;
  });
  const pearl = el('circle', { cx: 92, cy: 112, r: 7, fill: ctx.fixed(300, 30, 92), stroke: INK, 'stroke-width': 1 });
  const halo = el('circle', { cx: 92, cy: 112, r: 12, fill: ctx.fixed(190, 80, 85), opacity: 0.4, filter: glowFilter(ctx.defs, 3) });
  g.front.append(halo, pearl);
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      halo.setAttribute('opacity', (0.3 + 0.25 * Math.sin(t * 1.7)).toFixed(2));
      spikes.forEach((s, i) => s.setAttribute('opacity', (0.85 + 0.15 * Math.sin(t * 2 + i)).toFixed(2)));
    },
  };
};

export const forgewyrm: Drawer = (ctx) => {
  const g = grow(sparkwick, ctx, { dh: -8, ks: 1.1, kl: 0.85 }, 1.12);
  const glow = glowFilter(ctx.defs, 1.5);
  const embers = Array.from({ length: 10 }, (_, i) => {
    const e = el('circle', { r: 1.8, fill: ctx.fixed(36, 100, 60), filter: glow });
    g.front.appendChild(e);
    return { e, x: 50 + i * 10, phase: (i * 1.37) % 1 };
  });
  const plates = Array.from({ length: 5 }, (_, i) => {
    const p = el('path', { d: 'M-6 0L0 -9L6 0Z', fill: ctx.c(10, 30, 28), stroke: INK, 'stroke-width': 1 });
    g.behind.appendChild(p);
    return { p, x: 64 + i * 18 };
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      for (const { e, x, phase } of embers) {
        const p = (t * 0.5 + phase) % 1;
        e.setAttribute('cx', (x + 6 * Math.sin(t * 2 + phase * 9)).toFixed(1));
        e.setAttribute('cy', (130 - p * 90).toFixed(1));
        e.setAttribute('opacity', (1 - p).toFixed(2));
      }
      plates.forEach(({ p, x }, i) => p.setAttribute('transform', translate(x, 152 - 10 * Math.sin(((x - 42) / 100) * Math.PI) + 3 * Math.sin(t * 3 + i))));
    },
  };
};

export const cairnlord: Drawer = (ctx) => {
  const g = grow(pebblit, ctx, { dh: 10, ks: 1, kl: 0.9 }, 1.12);
  const glow = glowFilter(ctx.defs, 1.5);
  const capstone = el('path', { d: 'M88 84L94 56L106 56L112 84Z', fill: ctx.c(28, 12, 50), stroke: INK, 'stroke-width': 1.6 });
  const mark = el('path', { d: 'M100 62L100 78M94 70L106 70', stroke: ctx.fixed(190, 90, 70), 'stroke-width': 2, filter: glow });
  g.behind.append(capstone, mark);
  const orbit = Array.from({ length: 3 }, (_, i) => {
    const r = el('g');
    r.appendChild(el('path', { d: 'M-6 -4L6 -5L5 5L-5 4Z', fill: ctx.c(30, 10, 58), stroke: INK, 'stroke-width': 1 }));
    r.appendChild(el('path', { d: starPath(2.5), fill: ctx.fixed(190, 90, 72) }));
    g.front.appendChild(r);
    return { r, phase: (i / 3) * TAU };
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      mark.setAttribute('opacity', (0.6 + 0.4 * Math.sin(t * 1.8)).toFixed(2));
      for (const { r, phase } of orbit) {
        const a = phase + t * 0.9;
        const front = Math.sin(a) > 0;
        r.setAttribute('transform', `${translate(100 + Math.cos(a) * 58, 118 + Math.sin(a) * 14)} scale(${front ? 1.1 : 0.8})`);
        r.setAttribute('opacity', front ? '1' : '0.6');
      }
    },
  };
};

export const tempestkite: Drawer = (ctx) => {
  const g = grow(kitewisp, ctx, { dh: 18, ks: 1.1, kl: 0.88 }, 1.1);
  const rings = Array.from({ length: 3 }, (_, i) => {
    const r = el('ellipse', { cx: 100, cy: 100, fill: 'none', stroke: ctx.fixed(200, 40, 92), 'stroke-width': 1.6, 'stroke-dasharray': '10 8' });
    g.behind.appendChild(r);
    return { r, phase: i / 3 };
  });
  const bolt = el('path', { d: 'M100 36L94 52L104 52L96 68', fill: 'none', stroke: ctx.fixed(52, 100, 70), 'stroke-width': 2.4, 'stroke-linejoin': 'round', filter: glowFilter(ctx.defs, 1.2) });
  g.front.appendChild(bolt);
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      for (const { r, phase } of rings) {
        const p = (t * 0.4 + phase) % 1;
        r.setAttribute('rx', (40 + p * 50).toFixed(1));
        r.setAttribute('ry', (14 + p * 16).toFixed(1));
        r.setAttribute('opacity', (0.7 * (1 - p)).toFixed(2));
        r.setAttribute('stroke-dashoffset', (t * 20).toFixed(1));
      }
      bolt.setAttribute('opacity', wobble(t * 4) > 0.35 ? '1' : '0.15');
    },
  };
};

export const moonhare: Drawer = (ctx) => {
  const g = grow(glimhare, ctx, { dh: 200, ks: 0.8, kl: 0.95 }, 1.08);
  const glow = glowFilter(ctx.defs, 3);
  const moon = el('path', { d: 'M0 -30A30 30 0 1 0 0 30A22 22 0 1 1 0 -30Z', fill: ctx.fixed(52, 80, 82), opacity: 0.85, filter: glow });
  const moonWrap = el('g', { transform: translate(100, 96) });
  moonWrap.appendChild(moon);
  g.behind.appendChild(moonWrap);
  const stars = Array.from({ length: 6 }, (_, i) => {
    const s = el('path', { d: starPath(4), fill: ctx.fixed(52, 100, 85) });
    g.front.appendChild(s);
    return { s, phase: (i / 6) * TAU };
  });
  return {
    root: g.root,
    tick(t) {
      g.tickBase(t);
      moonWrap.setAttribute('transform', `${translate(100, 96)} rotate(${(8 * Math.sin(t * 0.5)).toFixed(1)})`);
      for (const { s, phase } of stars) {
        const a = phase + t * 0.5;
        s.setAttribute('transform', `${translate(100 + Math.cos(a) * 70, 104 + Math.sin(a) * 40)} scale(${(0.6 + 0.4 * Math.sin(t * 3 + phase)).toFixed(2)})`);
      }
    },
  };
};

export const EVOLVED2_ART: Record<string, Drawer> = { mirecap, conchwarden, forgewyrm, cairnlord, tempestkite, moonhare };
