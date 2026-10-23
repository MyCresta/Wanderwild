import { range } from '../rng';
import {
  blink,
  blobPoints,
  el,
  glowFilter,
  leafPath,
  linearGradient,
  rotateAbout,
  scaleAbout,
  smoothClosed,
  smoothOpen,
  TAU,
  translate,
  wobble,
  type Point,
} from '../svg';
import type { Drawer } from './types';

// Blotspawn share one palette: wet ink with a sour glow in the eyes.
const SHADOW = 'rgba(20, 14, 30, 0.35)';
const shadow = (rx: number) => el('ellipse', { cx: 100, cy: 172, rx, ry: rx * 0.16, fill: SHADOW });

/** An inky blob with too many eyes and a puddle for feet. */
export const smudgeling: Drawer = ({ c, fixed, rng, defs }) => {
  const ink = c(238, 32, 16);
  const root = el('g');
  root.appendChild(shadow(58));
  for (let i = 0; i < 6; i++) {
    const a = range(rng, 0, TAU);
    const d = range(rng, 58, 72);
    root.appendChild(el('ellipse', { cx: 100 + Math.cos(a) * d, cy: 168 + Math.sin(a) * 6, rx: range(rng, 2, 5), ry: range(rng, 1.5, 3), fill: ink }));
  }
  root.appendChild(el('ellipse', { cx: 100, cy: 162, rx: 58, ry: 10, fill: ink }));
  const fill = linearGradient(defs, [[0, c(240, 28, 30)], [1, ink]]);
  const body = el('path', { fill, stroke: c(240, 30, 8), 'stroke-width': 2 });
  const sheen = el('path', { d: 'M70 104q8-20 30-24', fill: 'none', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.18 });
  root.append(body, sheen);

  const glow = glowFilter(defs, 2.5);
  const count = 3 + Math.floor(rng() * 3);
  const eyes = Array.from({ length: count }, (_, i) => {
    const x = 74 + (52 * (i + 0.5)) / count + range(rng, -5, 5);
    const y = range(rng, 100, 124);
    const r = range(rng, 5, 10) * (i === Math.floor(count / 2) ? 1.3 : 1);
    const g = el('g');
    g.appendChild(el('circle', { cx: x, cy: y, r: r + 1.5, fill: fixed(78, 90, 55), filter: glow, opacity: 0.6 }));
    g.appendChild(el('circle', { cx: x, cy: y, r, fill: fixed(70, 85, 66) }));
    const pupil = el('ellipse', { cx: x, cy: y, rx: r * 0.22, ry: r * 0.75, fill: '#0b0812' });
    g.appendChild(pupil);
    root.appendChild(g);
    return { g, pupil, x, y, period: range(rng, 2.5, 5.5), phase: rng() * 5 };
  });

  const mouth = el('path', { fill: '#0b0812', stroke: c(240, 30, 8), 'stroke-width': 1 });
  const teeth = el('path', { fill: fixed(60, 30, 80) });
  root.append(mouth, teeth);

  const drips = Array.from({ length: 3 }, (_, i) => {
    const d = el('ellipse', { fill: ink });
    root.appendChild(d);
    return { d, x: 78 + i * 22 + range(rng, -4, 4), phase: rng() };
  });

  const phases = [rng() * TAU, rng() * TAU, rng() * TAU];
  return {
    root,
    tick(t) {
      const pts = blobPoints(100, 122, 50, 40, [
        [0.06, 3, phases[0] + t * 1.6],
        [0.04, 5, phases[1] - t * 2.2],
        [0.025, 8, phases[2] + t * 3],
      ]).map(([x, y]): Point => [x, Math.min(y, 160)]);
      body.setAttribute('d', smoothClosed(pts));
      const squash = 1 + 0.04 * Math.sin(t * 2.4);
      root.setAttribute('transform', scaleAbout(1 / squash, squash, 100, 165));
      for (const e of eyes) {
        const closed = blink(t, e.period, e.phase);
        e.g.setAttribute('transform', `${translate(0, 2 * Math.sin(t * 1.6 + e.x))} ${scaleAbout(1, Math.max(0.08, 1 - closed), e.x, e.y)}`);
        e.pupil.setAttribute('transform', translate(2.5 * Math.sin(t * 0.7 + e.phase), 0));
      }
      const open = 3 + 6 * Math.max(0, Math.sin(t * 1.3));
      const top: Point[] = [];
      const bottom: Point[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = 80 + i * 5;
        const y = 136 + Math.sin(i * 1.3 + t) * 1.5 - Math.sin((i / 8) * Math.PI) * 3;
        top.push([x, y]);
        bottom.push([x, y + open * Math.sin((i / 8) * Math.PI)]);
      }
      mouth.setAttribute('d', smoothOpen(top) + smoothOpen(bottom.reverse()).replace('M', 'L') + 'Z');
      let td = '';
      for (let i = 1; i < 8; i += 2) td += `M${top[i][0] - 2} ${top[i][1]}l2 ${2 + open * 0.3}l2 ${-2 - open * 0.3}z`;
      teeth.setAttribute('d', td);
      for (const drip of drips) {
        const p = (t * 0.6 + drip.phase) % 1;
        drip.d.setAttribute('cx', drip.x.toFixed(1));
        drip.d.setAttribute('cy', (148 + p * 14).toFixed(1));
        drip.d.setAttribute('rx', (2.5 - p).toFixed(2));
        drip.d.setAttribute('ry', (3 + p * 3).toFixed(2));
        drip.d.setAttribute('opacity', (1 - p * p).toFixed(2));
      }
    },
  };
};

/** An ink bat whose wings drip as it flaps. */
export const murkwing: Drawer = ({ c, fixed, rng, defs }) => {
  const ink = c(250, 30, 15);
  const bone = c(250, 22, 32);
  const root = el('g');
  const shadowNode = shadow(40);
  const fly = el('g');
  root.append(shadowNode, fly);

  const wing = (side: 1 | -1) => {
    const g = el('g', side < 0 ? { transform: 'translate(200 0) scale(-1 1)' } : {});
    const membrane = el('path', { fill: ink, stroke: c(250, 30, 6), 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
    const bones = el('path', { fill: 'none', stroke: bone, 'stroke-width': 1.6, 'stroke-linecap': 'round' });
    const drop = el('ellipse', { fill: ink });
    g.append(membrane, bones, drop);
    fly.appendChild(g);
    return { membrane, bones, drop };
  };
  const wings = [wing(1), wing(-1)];
  const span = range(rng, 0.92, 1.08);

  const fill = linearGradient(defs, [[0, c(250, 26, 26)], [1, ink]]);
  fly.appendChild(el('ellipse', { cx: 100, cy: 108, rx: 15, ry: 22, fill, stroke: c(250, 30, 6), 'stroke-width': 1.8 }));
  fly.appendChild(el('path', { d: 'M88 76L84 50L98 68Z M112 76L116 50L102 68Z', fill: ink, stroke: c(250, 30, 6), 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  fly.appendChild(el('circle', { cx: 100, cy: 82, r: 15, fill, stroke: c(250, 30, 6), 'stroke-width': 1.8 }));
  const glow = glowFilter(defs, 2.5);
  const eyes = el('g');
  for (const x of [93, 107]) {
    eyes.appendChild(el('ellipse', { cx: x, cy: 80, rx: 5, ry: 4, fill: fixed(355, 90, 50), filter: glow }));
    eyes.appendChild(el('path', { d: `M${x - 4} 80q4-5 8 0q-4 3-8 0z`, fill: fixed(10, 100, 72) }));
  }
  fly.appendChild(eyes);
  fly.appendChild(el('path', { d: 'M94 90q6 4 12 0 M96 90l1.5 5l1.5-5 M101 90l1.5 5l1.5-5', fill: fixed(40, 20, 88), stroke: c(250, 30, 6), 'stroke-width': 0.8 }));
  for (const x of [94, 106]) fly.appendChild(el('path', { d: `M${x} 128l-3 8M${x} 128l3 8`, stroke: bone, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));

  return {
    root,
    tick(t) {
      const phi = Math.sin(t * 6);
      const bodyY = -6 - 5 * phi + 3 * Math.sin(t * 0.9);
      fly.setAttribute('transform', `${translate(6 * Math.sin(t * 0.7), bodyY)} ${rotateAbout(4 * Math.sin(t * 0.7), 100, 100)}`);
      shadowNode.setAttribute('transform', scaleAbout(1 + bodyY / 120, 1, 100, 172));
      const shoulder: Point = [112, 96];
      const elbow: Point = [138, 84 - 18 * phi];
      const tips: Point[] = [
        [100 + 78 * span, 62 - 32 * phi],
        [100 + 82 * span, 100 - 22 * phi],
        [100 + 60 * span, 128 - 10 * phi],
      ];
      const end: Point = [112, 118];
      const scallop = (a: Point, b: Point) => {
        const mx = (a[0] + b[0]) / 2 - 10;
        const my = (a[1] + b[1]) / 2 - 2;
        return `Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
      };
      const d =
        `M${shoulder[0]} ${shoulder[1]}L${elbow[0]} ${elbow[1].toFixed(1)}L${tips[0][0].toFixed(1)} ${tips[0][1].toFixed(1)}` +
        scallop(tips[0], tips[1]) +
        scallop(tips[1], tips[2]) +
        scallop(tips[2], end) +
        'Z';
      const boneD = `M${shoulder[0]} ${shoulder[1]}L${elbow[0]} ${elbow[1].toFixed(1)}` + tips.map((p) => `M${elbow[0]} ${elbow[1].toFixed(1)}L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      wings.forEach((w, i) => {
        w.membrane.setAttribute('d', d);
        w.bones.setAttribute('d', boneD);
        const p = (t * 0.7 + i * 0.5) % 1;
        w.drop.setAttribute('cx', tips[2][0].toFixed(1));
        w.drop.setAttribute('cy', (tips[2][1] + 4 + p * 40).toFixed(1));
        w.drop.setAttribute('rx', (2.4 - p * 1.2).toFixed(2));
        w.drop.setAttribute('ry', (3 + p * 2).toFixed(2));
        w.drop.setAttribute('opacity', (1 - p).toFixed(2));
      });
      eyes.setAttribute('opacity', (0.75 + 0.25 * Math.sin(t * 4)).toFixed(2));
    },
  };
};

/** A carnivorous ink-vine that snaps its jaws. */
export const thornmaw: Drawer = ({ c, fixed, rng, defs }) => {
  const ink = c(150, 30, 14);
  const inkLight = c(150, 26, 26);
  const root = el('g');
  root.appendChild(shadow(46));

  for (const [a, len] of [[-160, 46], [-24, 44], [-120, 34], [-60, 36]] as [number, number][]) {
    const g = el('g', { transform: `${translate(100, 168)} rotate(${a})` });
    g.appendChild(el('path', { d: leafPath(len, 11), fill: a < -90 ? inkLight : ink, stroke: c(150, 30, 6), 'stroke-width': 1.5 }));
    for (let i = 1; i < 4; i++) g.appendChild(el('path', { d: `M${(len * i) / 4} ${-8 + i}l3 -6l2 6z`, fill: c(150, 30, 6) }));
    root.appendChild(g);
  }
  const stem = el('path', { fill: 'none', stroke: ink, 'stroke-width': 9, 'stroke-linecap': 'round' });
  const thorns = el('path', { fill: c(150, 30, 6) });
  root.append(stem, thorns);

  const head = el('g');
  root.appendChild(head);
  const lower = el('g');
  const upper = el('g');
  const mouthDark = fixed(350, 55, 22);
  const toothColor = fixed(48, 30, 84);
  lower.appendChild(el('path', { d: 'M-32 0Q-26 30 4 30Q32 26 38 0Z', fill: inkLight, stroke: c(150, 30, 6), 'stroke-width': 1.8 }));
  lower.appendChild(el('path', { d: 'M-28 0Q-22 18 4 20Q28 18 34 0Z', fill: mouthDark }));
  let lowerTeeth = '';
  for (let x = -24; x < 30; x += 9) lowerTeeth += `M${x} 1l4 -9l4 9z`;
  lower.appendChild(el('path', { d: lowerTeeth, fill: toothColor }));
  upper.appendChild(el('path', { d: 'M-36 0Q-32 -38 2 -40Q36 -38 40 0Z', fill: linearGradient(defs, [[0, inkLight], [1, ink]]), stroke: c(150, 30, 6), 'stroke-width': 1.8 }));
  let upperTeeth = '';
  for (let x = -30; x < 34; x += 8) upperTeeth += `M${x} -1l4 11l4 -11z`;
  upper.appendChild(el('path', { d: upperTeeth, fill: toothColor }));
  for (let i = 0; i < 6; i++)
    upper.appendChild(el('circle', { cx: range(rng, -26, 30), cy: range(rng, -30, -8), r: range(rng, 1.5, 3.5), fill: c(150, 40, 40), opacity: 0.8 }));
  const glow = glowFilter(defs, 2.5);
  upper.appendChild(el('ellipse', { cx: 8, cy: -26, rx: 10, ry: 7, fill: fixed(80, 95, 55), filter: glow }));
  upper.appendChild(el('ellipse', { cx: 8, cy: -26, rx: 8, ry: 6, fill: fixed(75, 90, 68) }));
  const pupil = el('ellipse', { cx: 8, cy: -26, rx: 2, ry: 5, fill: '#08100a' });
  upper.appendChild(pupil);
  const drool = el('ellipse', { rx: 2.4, ry: 4, fill: fixed(80, 60, 55), opacity: 0.8 });
  head.append(lower, upper, drool);

  const sway = range(rng, 0.8, 1.2);
  return {
    root,
    tick(t) {
      const hx = 104 + 12 * Math.sin(t * 1.1 * sway);
      const hy = 88 + 4 * Math.sin(t * 2.2);
      const pts: Point[] = [];
      for (let i = 0; i <= 6; i++) {
        const s = i / 6;
        pts.push([100 + (hx - 100) * s * s + 10 * Math.sin(s * Math.PI) * Math.sin(t * 1.1 + 1), 168 - (168 - hy - 18) * s]);
      }
      stem.setAttribute('d', smoothOpen(pts));
      let td = '';
      [1, 2, 3, 4].forEach((i) => {
        const [x, y] = pts[i];
        const side = i % 2 ? 1 : -1;
        td += `M${(x + side * 3).toFixed(1)} ${(y - 3).toFixed(1)}l${side * 8} -2l${-side * 8} 7z`;
      });
      thorns.setAttribute('d', td);
      const snap = Math.pow(Math.max(0, Math.sin(t * 2)), 4);
      const open = 6 + 22 * (1 - snap) * (0.5 + 0.5 * Math.sin(t * 0.7));
      const tilt = -12 + 8 * Math.sin(t * 1.1 * sway + 0.6);
      head.setAttribute('transform', `${translate(hx, hy)} rotate(${tilt.toFixed(1)})`);
      upper.setAttribute('transform', `rotate(${(-open * 0.55).toFixed(1)} -34 0)`);
      lower.setAttribute('transform', `rotate(${(open * 0.45).toFixed(1)} -30 0)`);
      pupil.setAttribute('transform', translate(2 * Math.sin(t * 0.8), 0));
      const p = (t * 0.5) % 1;
      drool.setAttribute('cx', '18');
      drool.setAttribute('cy', (24 + p * 30).toFixed(1));
      drool.setAttribute('opacity', (0.8 * (1 - p)).toFixed(2));
    },
  };
};

/** A wailing ghost of candle smoke with a snuffed wick for a crown. */
export const wickwraith: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const shadowNode = shadow(36);
  const float = el('g');
  root.append(shadowNode, float);

  const arms = [el('path'), el('path')];
  for (const arm of arms) {
    arm.setAttribute('fill', 'none');
    arm.setAttribute('stroke', c(240, 22, 22));
    arm.setAttribute('stroke-width', '6');
    arm.setAttribute('stroke-linecap', 'round');
    float.appendChild(arm);
  }
  const fill = linearGradient(defs, [[0, c(240, 18, 34)], [0.7, c(240, 26, 16)], [1, c(240, 30, 10)]]);
  const sheet = el('path', { fill, stroke: c(240, 30, 6), 'stroke-width': 1.8, opacity: 0.94 });
  float.appendChild(sheet);

  // The candle stub on its head, wax running down.
  const wax = fixed(44, 35, 82);
  float.appendChild(el('path', { d: 'M90 50h20v14q-4 6-6 0q-3 8-6 0q-4 5-8 -2z', fill: wax, stroke: '#1b1424', 'stroke-width': 1.4 }));
  float.appendChild(el('ellipse', { cx: 100, cy: 50, rx: 10, ry: 3, fill: fixed(44, 30, 90), stroke: '#1b1424', 'stroke-width': 1.2 }));
  float.appendChild(el('path', { d: 'M100 50q-1-5 1-8', fill: 'none', stroke: '#1b1424', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
  const ember = el('circle', { cx: 101, cy: 42, r: 1.8, fill: fixed(20, 100, 55) });
  float.appendChild(ember);

  const smoke = [0, 1, 2].map(() => {
    const p = el('path', { fill: 'none', stroke: fixed(240, 8, 60), 'stroke-width': 2.5, 'stroke-linecap': 'round' });
    float.appendChild(p);
    return p;
  });

  const glow = glowFilter(defs, 3);
  const eyeGlow = fixed(45, 100, 62);
  const face = el('g');
  for (const x of [88, 112]) {
    face.appendChild(el('ellipse', { cx: x, cy: 86, rx: 8, ry: 11, fill: '#07050c' }));
    face.appendChild(el('ellipse', { cx: x, cy: 88, rx: 3.5, ry: 4.5, fill: eyeGlow, filter: glow }));
    face.appendChild(el('ellipse', { cx: x, cy: 88, rx: 2, ry: 2.5, fill: fixed(50, 100, 85) }));
  }
  const mouth = el('ellipse', { cx: 100, cy: 110, rx: 6, fill: '#07050c' });
  face.appendChild(mouth);
  float.appendChild(face);

  const hem = range(rng, 0.8, 1.2);
  return {
    root,
    tick(t) {
      const fy = 2 + 6 * Math.sin(t * 1.2);
      float.setAttribute('transform', translate(4 * Math.sin(t * 0.6), fy));
      shadowNode.setAttribute('transform', scaleAbout(1 + fy / 60, 1, 100, 172));
      const pts: Point[] = [[100, 54]];
      pts.push([122, 60], [132, 84], [138, 120], [146, 150]);
      const tatters = 7;
      for (let k = 0; k <= tatters; k++) {
        const s = k / tatters;
        const x = 146 - s * 92;
        const y = 150 + (k % 2 ? 4 : 16) * hem + 6 * Math.sin(k * 1.9 + t * 3.2);
        pts.push([x + 4 * Math.sin(t * 2 + k), y]);
      }
      pts.push([62, 120], [68, 84], [78, 60]);
      sheet.setAttribute('d', smoothClosed(pts, 0.9));
      arms.forEach((arm, i) => {
        const side = i ? 1 : -1;
        const sx = 100 + side * 30;
        const wave = (s: number) => 8 * Math.sin(t * 2.4 + s * 4 + i);
        arm.setAttribute(
          'd',
          smoothOpen([0, 0.33, 0.66, 1].map((s): Point => [sx + side * s * 30, 104 + s * 8 + wave(s) * s])),
        );
      });
      smoke.forEach((p, j) => {
        const pts2: Point[] = [];
        for (let i = 0; i <= 6; i++) {
          const s = i / 6;
          const drift = ((t * 0.4 + j / 3) % 1) * 10;
          pts2.push([101 + 9 * s * Math.sin(s * 5 - t * 2 + j * 2) + j * 2, 40 - s * (24 + j * 4) - drift * 0.6]);
        }
        p.setAttribute('d', smoothOpen(pts2));
        p.setAttribute('opacity', (0.35 + 0.2 * Math.sin(t + j)).toFixed(2));
      });
      mouth.setAttribute('ry', (5 + 4 * Math.abs(Math.sin(t * 1.5))).toFixed(1));
      face.setAttribute('opacity', (0.85 + 0.15 * wobble(t * 3)).toFixed(2));
      ember.setAttribute('opacity', (0.5 + 0.5 * wobble(t * 5)).toFixed(2));
      face.setAttribute('transform', scaleAbout(1, 1 - 0.85 * blink(t, 6, 3), 100, 88));
    },
  };
};

export const MONSTER_ART: Record<string, Drawer> = { smudgeling, murkwing, thornmaw, wickwraith };
