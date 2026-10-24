import { el, smoothOpen, TAU, translate, type Point } from '../svg';
import type { ArtContext, Drawer } from './types';

const hsl = (h: number, s: number, l: number) => `hsl(${(((h % 360) + 360) % 360).toFixed(0)} ${Math.max(0, Math.min(100, s)).toFixed(0)}% ${Math.max(0, Math.min(100, l)).toFixed(0)}%)`;

/**
 * A Wildling the Blot has taken: the same drawing soaked in dark ink, its bright details
 * burning a sickly violet, with ink rising off it and dripping away.
 */
export function taken(base: Drawer): Drawer {
  return (ctx: ArtContext) => {
    const dark = (h: number, s: number, l: number) => hsl(262 + ((h % 60) - 30) * 0.3, s * 0.35 + 8, l * 0.34 + 6);
    const art = base({
      ...ctx,
      c: dark,
      fixed: (h, s, l) => (l > 62 ? hsl(292, 85, 62) : dark(h, s, l)),
    });
    const root = el('g');
    const behind = el('g');
    const front = el('g');
    root.append(behind, art.root, front);
    const tendrils = Array.from({ length: 5 }, (_, i) => {
      const p = el('path', { fill: 'none', stroke: hsl(270, 40, 14), 'stroke-width': 5 - i * 0.5, 'stroke-linecap': 'round', opacity: 0.7 });
      behind.appendChild(p);
      return { p, x: 60 + i * 20, phase: ctx.rng() * TAU };
    });
    const drips = Array.from({ length: 4 }, (_, i) => {
      const d = el('ellipse', { rx: 2.6, ry: 4, fill: hsl(270, 45, 12) });
      front.appendChild(d);
      return { d, x: 70 + i * 20 + ctx.rng() * 8, phase: ctx.rng() };
    });
    front.appendChild(el('ellipse', { cx: 100, cy: 172, rx: 48, ry: 7, fill: hsl(270, 45, 10), opacity: 0.55 }));
    return {
      root,
      tick(t) {
        art.tick(t);
        for (const { p, x, phase } of tendrils) {
          const pts: Point[] = Array.from({ length: 6 }, (_, k) => [x + 8 * Math.sin(t * 1.4 + phase + k * 0.9) * (k / 5), 170 - k * 18]);
          p.setAttribute('d', smoothOpen(pts));
        }
        for (const { d, x, phase } of drips) {
          const q = (t * 0.6 + phase) % 1;
          d.setAttribute('transform', translate(x, 140 + q * 32));
          d.setAttribute('opacity', (1 - q).toFixed(2));
        }
      },
    };
  };
}
