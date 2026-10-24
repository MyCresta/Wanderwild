import { range } from '../rng';
import { blink, blobPoints, el, glowFilter, linearGradient, radialGradient, scaleAbout, smoothClosed, smoothOpen, starPath, TAU, translate, wobble, type Point } from '../svg';
import { eye, INK } from './pets';
import type { Drawer } from './types';

// The second Wildling of each element, drawn the same way as the first: shapes from a few
// curves, a little randomness from the seed, and a tick that keeps them breathing.

const SHADOW = 'rgba(42, 26, 12, 0.28)';
const shadow = (rx: number) => el('ellipse', { cx: 100, cy: 172, rx, ry: rx * 0.16, fill: SHADOW });

/** A squat toad under a spotted toadstool cap. */
export const capling: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const bob = el('g');
  root.append(shadow(46), bob);
  const body = smoothClosed(blobPoints(100, 140, 40, 26, [[0.04, 2, 0.6]]));
  bob.appendChild(el('path', { d: body, fill: linearGradient(defs, [[0, c(96, 34, 52)], [1, c(90, 38, 34)]]), stroke: INK, 'stroke-width': 2 }));
  bob.appendChild(el('ellipse', { cx: 100, cy: 150, rx: 26, ry: 12, fill: c(70, 40, 74), opacity: 0.8 }));
  const feet = [70, 130].map((x) => {
    const foot = el('path', { d: `M${x - 12} 166Q${x} 154 ${x + 12} 166Z`, fill: c(92, 36, 38), stroke: INK, 'stroke-width': 1.4 });
    bob.appendChild(foot);
    return foot;
  });
  const cap = el('g');
  const capPts: Point[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    capPts.push([100 + Math.cos(a) * 54, 116 + Math.sin(a) * 40 * (1 + 0.05 * Math.sin(i * 1.7))]);
  }
  capPts.push([150, 120], [100, 126], [50, 120]);
  cap.appendChild(el('path', { d: smoothClosed(capPts), fill: radialGradient(defs, [[0, fixed(8, 70, 58)], [1, fixed(356, 62, 40)]], 0.5, 0.3), stroke: INK, 'stroke-width': 2 }));
  const spots = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < spots; i++) {
    const a = Math.PI * (1.15 + 0.7 * (i / (spots - 1)));
    const r = range(rng, 18, 38);
    cap.appendChild(el('ellipse', { cx: 100 + Math.cos(a) * r * 1.2, cy: 112 + Math.sin(a) * r * 0.8, rx: range(rng, 4, 7), ry: range(rng, 3, 5), fill: fixed(45, 60, 92), opacity: 0.95 }));
  }
  bob.appendChild(cap);
  const eyes = [eye(84, 130, 6, c(48, 70, 50), { sclera: fixed(50, 60, 90) }), eye(116, 130, 6, c(48, 70, 50), { sclera: fixed(50, 60, 90) })];
  bob.append(...eyes.map((e) => e.node));
  const mouth = el('path', { d: 'M90 146Q100 152 110 146', fill: 'none', stroke: INK, 'stroke-width': 1.6, 'stroke-linecap': 'round' });
  bob.appendChild(mouth);
  const spores = Array.from({ length: 5 }, (_, i) => {
    const s = el('circle', { r: 1.8, fill: fixed(60, 70, 80), opacity: 0.7 });
    root.appendChild(s);
    return { s, x: 70 + i * 15, phase: rng() * TAU };
  });
  return {
    root,
    tick(t) {
      const puff = 1 + 0.04 * Math.sin(t * 1.8);
      bob.setAttribute('transform', scaleAbout(puff, 1 / puff, 100, 166));
      cap.setAttribute('transform', `rotate(${(3 * Math.sin(t * 1.2)).toFixed(1)} 100 120)`);
      eyes.forEach((e) => e.pose(blink(t, 4.4)));
      feet.forEach((f, i) => f.setAttribute('transform', translate(0, -1.5 * Math.max(0, Math.sin(t * 3 + i * Math.PI)))));
      for (const { s, x, phase } of spores) {
        const p = ((t * 0.25 + phase) % 1 + 1) % 1;
        s.setAttribute('cx', (x + 8 * Math.sin(t + phase)).toFixed(1));
        s.setAttribute('cy', (90 - p * 60).toFixed(1));
        s.setAttribute('opacity', (0.8 * (1 - p)).toFixed(2));
      }
    },
  };
};

/** A snail whose shell is a logarithmic spiral, with eye-stalks that peer about. */
export const shellop: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const glide = el('g');
  root.append(shadow(52), glide);
  const foot = el('path', { fill: c(200, 30, 70), stroke: INK, 'stroke-width': 1.8 });
  glide.appendChild(foot);
  // Shell: r = a·e^(bθ), drawn as a filled whorl plus its seam.
  const spiral: Point[] = [];
  const turns = 2.6 + rng() * 0.4;
  for (let i = 0; i <= 80; i++) {
    const th = (i / 80) * turns * TAU;
    // Growth chosen so the last whorl ends at radius 40, however many turns.
    const r = 4 * Math.exp((Math.log(10) / (turns * TAU)) * th);
    spiral.push([92 + Math.cos(th) * r, 112 + Math.sin(th) * r * 0.92]);
  }
  const outer = spiral[spiral.length - 1];
  const rOuter = Math.hypot(outer[0] - 92, (outer[1] - 112) / 0.92);
  glide.appendChild(el('ellipse', { cx: 92, cy: 112, rx: rOuter, ry: rOuter * 0.92, fill: linearGradient(defs, [[0, c(190, 50, 72)], [1, c(214, 44, 46)]]), stroke: INK, 'stroke-width': 2 }));
  glide.appendChild(el('path', { d: smoothOpen(spiral), fill: 'none', stroke: c(220, 40, 30), 'stroke-width': 2.2 }));
  for (let i = 0; i < 5; i++) glide.appendChild(el('circle', { cx: 92 + range(rng, -22, 22), cy: 112 + range(rng, -18, 18), r: range(rng, 1.5, 3), fill: fixed(190, 60, 92), opacity: 0.8 }));
  const head = el('g');
  head.appendChild(el('ellipse', { cx: 146, cy: 146, rx: 16, ry: 13, fill: c(200, 30, 72), stroke: INK, 'stroke-width': 1.8 }));
  head.appendChild(el('path', { d: 'M140 152Q146 156 152 152', fill: 'none', stroke: INK, 'stroke-width': 1.4 }));
  const stalks = [0, 1].map((i) => {
    const g = el('g');
    const line = el('path', { fill: 'none', stroke: c(200, 30, 60), 'stroke-width': 3, 'stroke-linecap': 'round' });
    const e = eye(0, 0, 5, INK, { sclera: fixed(50, 40, 95) });
    const wrap = el('g');
    wrap.appendChild(e.node);
    g.append(line, wrap);
    head.appendChild(g);
    return { line, e, wrap, base: [140 + i * 12, 136] as Point, phase: i * 1.3 };
  });
  glide.appendChild(head);
  return {
    root,
    tick(t) {
      const stretch = Math.sin(t * 1.6);
      const len = 58 + 4 * stretch;
      foot.setAttribute('d', `M${100 - len} 166Q${100 - len} 150 100 148Q${142 + 3 * stretch} 140 ${160 + 3 * stretch} 160Q${150} 170 ${100 - len} 166Z`);
      head.setAttribute('transform', translate(3 * stretch, 0));
      for (const s of stalks) {
        const tip: Point = [s.base[0] + 4 * Math.sin(t * 1.3 + s.phase), s.base[1] - 22 + 2 * Math.sin(t * 2 + s.phase)];
        s.line.setAttribute('d', `M${s.base[0]} ${s.base[1]}Q${s.base[0]} ${s.base[1] - 12} ${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`);
        s.wrap.setAttribute('transform', translate(tip[0], tip[1]));
        s.e.pose(blink(t, 4.6, s.phase), 1.2 * Math.sin(t * 0.7 + s.phase));
      }
      glide.setAttribute('transform', translate(0, -1 * Math.abs(stretch)));
    },
  };
};

/** A slender salamander with a flickering crest of flame along its spine. */
export const sparkwick: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  root.appendChild(shadow(56));
  const body = el('path', { fill: linearGradient(defs, [[0, c(18, 70, 52)], [1, c(8, 64, 38)]]), stroke: INK, 'stroke-width': 1.8 });
  const crest = el('g', { filter: glowFilter(defs, 0.6) });
  const legs = el('g');
  const head = el('g');
  root.append(legs, body, crest, head);
  head.appendChild(el('ellipse', { cx: 0, cy: 0, rx: 18, ry: 12, fill: c(16, 70, 50), stroke: INK, 'stroke-width': 1.8 }));
  head.appendChild(el('path', { d: 'M4 6Q12 8 17 4', fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
  const e = eye(4, -3, 4.5, fixed(48, 95, 55));
  head.appendChild(e.node);
  const flames = Array.from({ length: 6 }, (_, i) => {
    const node = el('path', { fill: fixed(30 + i * 4, 95, 55 + (i % 2) * 8) });
    crest.appendChild(node);
    return { node, phase: rng() * TAU };
  });
  const spine = (t: number): Point[] =>
    Array.from({ length: 12 }, (_, i) => {
      const s = i / 11;
      return [42 + s * 100, 146 - 10 * Math.sin(s * Math.PI) + 5 * Math.sin(s * 5 - t * 3) * (1 - s)];
    });
  return {
    root,
    tick(t) {
      const pts = spine(t);
      const top = pts.map(([x, y], i) => [x, y - 9 * Math.sin((i / 11) * Math.PI * 0.9 + 0.2)] as Point);
      const bottom = pts.map(([x, y], i) => [x, y + 8 * Math.sin((i / 11) * Math.PI * 0.9 + 0.2)] as Point).reverse();
      body.setAttribute('d', smoothClosed([...top, ...bottom]));
      const [hx, hy] = pts[pts.length - 1];
      head.setAttribute('transform', translate(hx + 8, hy - 4));
      e.pose(blink(t, 3.8));
      flames.forEach(({ node, phase }, i) => {
        const [x, y] = top[3 + i];
        const h = 14 + 6 * wobble(t * 5 + phase);
        node.setAttribute('d', `M${x - 5} ${y + 2}Q${x - 4 + 3 * Math.sin(t * 7 + phase)} ${y - h * 0.6} ${x + 2 * Math.sin(t * 9 + phase)} ${y - h}Q${x + 4} ${y - h * 0.5} ${x + 5} ${y + 2}Z`);
      });
      legs.replaceChildren(
        ...[0.2, 0.35, 0.7, 0.85].map((s, i) => {
          const [x, y] = pts[Math.round(s * 11)];
          const step = 4 * Math.sin(t * 4 + i * 1.6);
          return el('path', { d: `M${x} ${y}L${x + step - 4} 168L${x + step + 4} 168`, fill: 'none', stroke: c(10, 60, 34), 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        }),
      );
    },
  };
};

/** A little cairn of pebbles that has decided to walk. */
export const pebblit: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const stack = el('g');
  root.append(shadow(42), stack);
  const stones = [
    { y: 150, rx: 38, ry: 18 },
    { y: 122, rx: 30, ry: 15 },
    { y: 99, rx: 22, ry: 12 },
  ].map((s, i) => {
    const node = el('path', {
      d: smoothClosed(blobPoints(100, s.y, s.rx, s.ry, [[0.06, 3, rng() * 6], [0.03, 5, rng() * 6]])),
      fill: linearGradient(defs, [[0, c(30, 10, 66 - i * 4)], [1, c(26, 12, 44 - i * 4)]]),
      stroke: INK,
      'stroke-width': 1.8,
    });
    stack.appendChild(node);
    return { node, phase: i * 0.9 };
  });
  const moss = el('path', { d: `M80 ${92}Q100 ${80} 120 ${92}`, fill: 'none', stroke: c(100, 40, 42), 'stroke-width': 4, 'stroke-linecap': 'round' });
  stack.appendChild(moss);
  const eyes = [eye(92, 120, 4, fixed(190, 70, 60)), eye(108, 120, 4, fixed(190, 70, 60))];
  stack.append(...eyes.map((e) => e.node));
  const rune = el('path', { d: starPath(5), fill: fixed(190, 80, 70), transform: translate(100, 150), opacity: 0.7, filter: glowFilter(defs, 1) });
  stack.appendChild(rune);
  return {
    root,
    tick(t) {
      stones.forEach(({ node, phase }, i) => node.setAttribute('transform', translate(2.5 * i * Math.sin(t * 1.4 + phase), 0)));
      eyes.forEach((e) => e.node.setAttribute('transform', translate(5 * Math.sin(t * 1.4 + 0.9), 0)));
      eyes.forEach((e) => e.pose(blink(t, 5)));
      moss.setAttribute('transform', translate(5 * Math.sin(t * 1.4 + 1.8), 0));
      rune.setAttribute('opacity', (0.45 + 0.35 * Math.sin(t * 2)).toFixed(2));
      stack.setAttribute('transform', translate(0, -2 * Math.abs(Math.sin(t * 1.4))));
    },
  };
};

/** A kite-shaped ray that glides on the wind, trailing a knotted ribbon tail. */
export const kitewisp: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const glide = el('g');
  root.append(shadow(36), glide);
  const tail = el('path', { fill: 'none', stroke: c(200, 40, 50), 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  const bows = Array.from({ length: 3 }, () => {
    const b = el('path', { d: 'M-6 -4L0 0L-6 4M6 -4L0 0L6 4', fill: 'none', stroke: fixed(350, 60, 55), 'stroke-width': 2, 'stroke-linecap': 'round' });
    glide.appendChild(b);
    return b;
  });
  const wing = el('path', { fill: linearGradient(defs, [[0, c(205, 46, 76)], [1, c(214, 40, 54)]], 1, 1), stroke: INK, 'stroke-width': 2 });
  glide.prepend(tail);
  glide.appendChild(wing);
  const spars = el('path', { d: 'M100 64L100 140M56 100L144 100', stroke: c(220, 30, 40), 'stroke-width': 1.4, opacity: 0.6 });
  glide.appendChild(spars);
  const eyes = [eye(90, 96, 4.5, INK, { sclera: fixed(50, 40, 95) }), eye(110, 96, 4.5, INK, { sclera: fixed(50, 40, 95) })];
  glide.append(...eyes.map((e) => e.node));
  const swirl = el('path', { d: 'M96 112q4 4 8 0', fill: 'none', stroke: INK, 'stroke-width': 1.4, 'stroke-linecap': 'round' });
  glide.appendChild(swirl);
  const tilt = rng() * 2 - 1;
  return {
    root,
    tick(t) {
      const flap = 6 * Math.sin(t * 2.2);
      wing.setAttribute('d', smoothClosed([[100, 60], [128, 84 - flap * 0.4], [150, 100 - flap], [126, 116], [100, 142], [74, 116], [50, 100 - flap], [72, 84 - flap * 0.4]], 0.6));
      const pts: Point[] = Array.from({ length: 8 }, (_, i) => [100 + 10 * Math.sin(t * 2.5 - i * 0.8) * (i / 7), 142 + i * 5]);
      pts.push([pts[7][0] - 20, 160 + 3 * Math.sin(t * 3)]);
      tail.setAttribute('d', smoothOpen(pts));
      bows.forEach((b, i) => {
        const [x, y] = pts[2 + i * 2];
        b.setAttribute('transform', translate(x, y));
      });
      glide.setAttribute('transform', `${translate(0, -6 + 6 * Math.sin(t * 1.1))} rotate(${(tilt * 4 + 4 * Math.sin(t * 0.8)).toFixed(1)} 100 100)`);
      eyes.forEach((e) => e.pose(blink(t, 4.2)));
    },
  };
};

/** A hare whose long ears glow at the tips like lanterns. */
export const glimhare: Drawer = ({ c, fixed, rng, defs }) => {
  const root = el('g');
  const bob = el('g');
  root.append(shadow(42), bob);
  const glow = glowFilter(defs, 3);
  const ears = [0, 1].map((i) => {
    const g = el('g');
    g.appendChild(el('path', { d: 'M-8 0Q-12 -44 0 -62Q12 -44 8 0Z', fill: c(40, 24, 82), stroke: INK, 'stroke-width': 1.6 }));
    g.appendChild(el('path', { d: 'M-4 -6Q-6 -40 0 -54Q6 -40 4 -6Z', fill: c(350, 50, 82) }));
    g.appendChild(el('circle', { cx: 0, cy: -60, r: 9, fill: fixed(52, 100, 72), opacity: 0.6, filter: glow }));
    g.appendChild(el('circle', { cx: 0, cy: -60, r: 4, fill: fixed(52, 100, 88) }));
    bob.appendChild(g);
    return { g, x: 92 + i * 20, a: i ? 14 : -10, phase: i * 1.7 };
  });
  bob.appendChild(el('path', { d: smoothClosed(blobPoints(100, 140, 34, 28, [[0.05, 2, 0.4]])), fill: linearGradient(defs, [[0, c(40, 26, 86)], [1, c(36, 22, 66)]]), stroke: INK, 'stroke-width': 2 }));
  bob.appendChild(el('ellipse', { cx: 100, cy: 108, rx: 22, ry: 19, fill: c(40, 26, 86), stroke: INK, 'stroke-width': 2 }));
  bob.appendChild(el('circle', { cx: 132, cy: 150, r: 9, fill: fixed(45, 30, 96), stroke: INK, 'stroke-width': 1.4 }));
  bob.appendChild(el('path', { d: starPath(5), fill: fixed(52, 90, 70), transform: translate(100, 96) }));
  const eyes = [eye(91, 110, 4, INK), eye(109, 110, 4, INK)];
  bob.append(...eyes.map((e) => e.node));
  bob.appendChild(el('path', { d: 'M97 119L100 122L103 119', fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
  bob.appendChild(el('ellipse', { cx: 88, cy: 120, rx: 4, ry: 2.4, fill: fixed(355, 70, 72), opacity: 0.5 }));
  bob.appendChild(el('ellipse', { cx: 112, cy: 120, rx: 4, ry: 2.4, fill: fixed(355, 70, 72), opacity: 0.5 }));
  const twitch = rng() * TAU;
  return {
    root,
    tick(t) {
      const hop = Math.max(0, Math.sin(t * 2.6));
      bob.setAttribute('transform', `${translate(0, -6 * hop * hop)} ${scaleAbout(1 + 0.03 * (1 - hop), 1 - 0.03 * (1 - hop), 100, 168)}`);
      for (const ear of ears) ear.g.setAttribute('transform', `${translate(ear.x, 96)} rotate(${(ear.a + 6 * Math.sin(t * 1.5 + ear.phase) + 4 * Math.max(0, wobble(t * 3 + twitch))).toFixed(1)})`);
      eyes.forEach((e) => e.pose(blink(t, 3.4)));
    },
  };
};

export const WILDLING2_ART: Record<string, Drawer> = { capling, shellop, sparkwick, pebblit, kitewisp, glimhare };
