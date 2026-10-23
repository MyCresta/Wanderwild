import { mulberry32, range } from '../../creatures/rng';
import type { Element } from '../../creatures/species';
import { blobPoints, el, leafPath, linearGradient, smoothClosed, starPath, TAU, translate, type Point } from '../../creatures/svg';

// A storybook backdrop for the catch scene, drawn per element. The view box is 400×700 and
// sliced to fill the screen, so the middle band (where the creature stands) always shows.

const W = 400;
const H = 700;
const HORIZON = 330;

interface Theme {
  sky: [string, string];
  hills: [string, string];
  ground: [string, string];
}

const THEMES: Record<Element, Theme> = {
  grove: { sky: ['#cfe3d0', '#f2ead0'], hills: ['#8fae76', '#6f8f58'], ground: ['#a9bf82', '#7f9a5e'] },
  tide: { sky: ['#bfdce0', '#eef0e2'], hills: ['#8fb6b8', '#6e9ca0'], ground: ['#9dc3c4', '#5f8f95'] },
  ember: { sky: ['#e9a46c', '#f6dcae'], hills: ['#9a5c44', '#6e3f30'], ground: ['#c99a6a', '#8c5f3c'] },
  stone: { sky: ['#c6cbd2', '#ece6d6'], hills: ['#8f8a86', '#6c6762'], ground: ['#b3a68e', '#857a66'] },
  gale: { sky: ['#a9cbe6', '#f1eedf'], hills: ['#a8b9a0', '#8aa087'], ground: ['#c9cf9f', '#9aa874'] },
  lumen: { sky: ['#1f2a4f', '#4d4a72'], hills: ['#2c3358', '#20264a'], ground: ['#3d4166', '#262a4a'] },
};

function hills(y: number, amp: number, seed: number, color: string): SVGPathElement {
  const rng = mulberry32(seed);
  const a = range(rng, 0, TAU);
  const b = range(rng, 0, TAU);
  const pts: Point[] = [];
  for (let x = -20; x <= W + 20; x += 20)
    pts.push([x, y - amp * (0.6 * Math.sin(x / 70 + a) + 0.4 * Math.sin(x / 31 + b))]);
  const d = pts.map(([x, py], i) => `${i ? 'L' : 'M'}${x} ${py.toFixed(1)}`).join('') + `L${W + 20} ${H}L-20 ${H}Z`;
  return el('path', { d, fill: color });
}

export function createBackdrop(element: Element, seed: number): { svg: SVGSVGElement; tick(t: number): void } {
  const theme = THEMES[element];
  const rng = mulberry32(seed);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid slice', class: 'catch-backdrop', 'aria-hidden': 'true' });
  const defs = el('defs');
  svg.appendChild(defs);
  svg.appendChild(el('rect', { width: W, height: H, fill: linearGradient(defs, [[0, theme.sky[0]], [0.5, theme.sky[1]]]) }));

  const ticks: ((t: number) => void)[] = [];
  const back = el('g');
  const front = el('g');

  if (element === 'lumen') {
    const moon = el('g', { transform: translate(310, 120) });
    moon.appendChild(el('circle', { r: 44, fill: '#f6edc8', opacity: 0.18 }));
    moon.appendChild(el('circle', { r: 30, fill: '#f6edc8' }));
    moon.appendChild(el('circle', { cx: 12, cy: -6, r: 26, fill: theme.sky[0] }));
    back.appendChild(moon);
    const stars = Array.from({ length: 40 }, () => {
      const s = el('path', { d: starPath(range(rng, 2, 5)), fill: '#fff6d6', transform: translate(range(rng, 0, W), range(rng, 0, HORIZON - 20)) });
      back.appendChild(s);
      return { s, phase: rng() * TAU };
    });
    ticks.push((t) => stars.forEach(({ s, phase }) => s.setAttribute('opacity', (0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + phase))).toFixed(2))));
  }

  if (element === 'ember') back.appendChild(el('circle', { cx: 120, cy: HORIZON - 10, r: 70, fill: '#f8c46a', opacity: 0.55 }));

  if (element === 'gale' || element === 'grove' || element === 'tide') {
    const clouds = Array.from({ length: 4 }, (_, i) => {
      const g = el('g');
      const y = range(rng, 60, HORIZON - 120);
      g.appendChild(el('path', { d: smoothClosed(blobPoints(0, 0, range(rng, 40, 70), range(rng, 14, 22), [[0.12, 3, rng() * 6], [0.06, 5, rng() * 6]])), fill: '#fffaf0', opacity: 0.85 }));
      back.appendChild(g);
      return { g, y, x0: (i / 4) * (W + 160), speed: range(rng, 6, 14) * (element === 'gale' ? 3 : 1) };
    });
    ticks.push((t) =>
      clouds.forEach((c) => c.g.setAttribute('transform', translate(((c.x0 + t * c.speed) % (W + 160)) - 80, c.y))),
    );
  }

  if (element === 'stone') {
    const peaks: Point[] = [[-20, H]];
    for (let x = -20; x <= W + 20; x += 40) peaks.push([x, HORIZON - range(rng, 40, 130)], [x + 20, HORIZON - range(rng, 10, 50)]);
    peaks.push([W + 20, H]);
    back.appendChild(el('path', { d: `M${peaks.map((p) => p.join(' ')).join('L')}Z`, fill: '#9ea2ad' }));
  }

  back.appendChild(hills(HORIZON + 10, 26, seed + 1, theme.hills[0]));
  back.appendChild(hills(HORIZON + 50, 18, seed + 2, theme.hills[1]));

  if (element === 'tide') {
    back.appendChild(el('rect', { x: 0, y: HORIZON + 40, width: W, height: 120, fill: '#7fb0b5' }));
    const ripples = Array.from({ length: 10 }, () => {
      const r = el('path', { d: 'M0 0q10 -4 20 0t20 0', fill: 'none', stroke: '#e9f4ef', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.8 });
      back.appendChild(r);
      return { r, x: range(rng, 0, W), y: range(rng, HORIZON + 50, HORIZON + 150), phase: rng() * TAU };
    });
    ticks.push((t) =>
      ripples.forEach(({ r, x, y, phase }) => {
        r.setAttribute('transform', translate(x + 8 * Math.sin(t * 0.8 + phase), y));
        r.setAttribute('opacity', (0.3 + 0.5 * Math.abs(Math.sin(t * 0.9 + phase))).toFixed(2));
      }),
    );
  }

  svg.appendChild(back);
  svg.appendChild(el('path', { d: `M-20 ${HORIZON + 140}Q${W / 2} ${HORIZON + 100} ${W + 20} ${HORIZON + 140}L${W + 20} ${H}L-20 ${H}Z`, fill: linearGradient(defs, [[0, theme.ground[0]], [1, theme.ground[1]]]) }));

  // Foreground tufts, swaying.
  {
    const tufts = Array.from({ length: 14 }, () => {
      const g = el('g');
      const blades = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < blades; i++)
        g.appendChild(el('path', { d: leafPath(range(rng, 18, 34), 3.5), fill: theme.hills[1], transform: `rotate(${-90 + (i - blades / 2) * 16})` }));
      if (element === 'grove' && rng() < 0.4) g.appendChild(el('circle', { cy: -20, r: 4, fill: '#f3d27a' }));
      front.appendChild(g);
      const y = range(rng, HORIZON + 170, H - 10);
      return { g, x: range(rng, 0, W), y, phase: rng() * TAU, k: 0.6 + (y - HORIZON) / 400 };
    });
    ticks.push((t) =>
      tufts.forEach(({ g, x, y, phase, k }) => g.setAttribute('transform', `${translate(x, y)} scale(${k.toFixed(2)}) rotate(${(4 * Math.sin(t * 1.4 + phase)).toFixed(1)})`)),
    );
  }

  // Motes that drift up: embers, fireflies, pollen, spray, grit, wind streaks.
  const moteColor: Record<Element, string> = {
    grove: '#f3e6a0',
    tide: '#ffffff',
    ember: '#ffb347',
    stone: '#d8cdb8',
    gale: '#ffffff',
    lumen: '#fff2a0',
  };
  const motes = Array.from({ length: element === 'lumen' || element === 'ember' ? 18 : 10 }, () => {
    const m =
      element === 'gale'
        ? el('path', { d: 'M0 0h26', stroke: moteColor.gale, 'stroke-width': 2, 'stroke-linecap': 'round' })
        : el('circle', { r: range(rng, 1.5, 3.5), fill: moteColor[element] });
    front.appendChild(m);
    return { m, x: range(rng, 0, W), y: range(rng, 120, H), phase: rng(), speed: range(rng, 0.05, 0.12) };
  });
  ticks.push((t) =>
    motes.forEach(({ m, x, y, phase, speed }) => {
      const p = (t * speed + phase) % 1;
      if (element === 'gale') {
        m.setAttribute('transform', translate(((x + p * W * 2) % (W + 60)) - 30, y - 200));
        m.setAttribute('opacity', (Math.sin(p * Math.PI) * 0.8).toFixed(2));
      } else {
        m.setAttribute('transform', translate(x + 14 * Math.sin(t + phase * 9), y - p * 260));
        m.setAttribute('opacity', (Math.sin(p * Math.PI) * 0.9).toFixed(2));
      }
    }),
  );

  svg.appendChild(front);
  return { svg, tick: (t) => ticks.forEach((fn) => fn(t)) };
}
