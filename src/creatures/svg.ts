// Helpers for building creatures out of SVG with a bit of trigonometry.

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const TAU = Math.PI * 2;

export type Point = readonly [number, number];
type Attrs = Record<string, string | number>;

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children) node.appendChild(child);
  return node;
}

let idCounter = 0;
/** Unique id for gradients and filters, since many creatures share one document. */
export const uid = (prefix: string) => `${prefix}-${(idCounter++).toString(36)}`;

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Straight-edged path through the points. */
export function polyPath(points: readonly Point[], closed = true): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + (closed ? 'Z' : '');
}

/** Smooth closed path through every point (Catmull-Rom spline as cubic Béziers). */
export function smoothClosed(points: readonly Point[], tension = 1): string {
  const n = points.length;
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const k = tension / 6;
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) * k)} ${f(p1[1] + (p2[1] - p0[1]) * k)},` +
      `${f(p2[0] - (p3[0] - p1[0]) * k)} ${f(p2[1] - (p3[1] - p1[1]) * k)},${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

/** Smooth open path through the points. */
export function smoothOpen(points: readonly Point[], tension = 1): string {
  const n = points.length;
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const k = tension / 6;
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) * k)} ${f(p1[1] + (p2[1] - p0[1]) * k)},` +
      `${f(p2[0] - (p3[0] - p1[0]) * k)} ${f(p2[1] - (p3[1] - p1[1]) * k)},${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** A wave added to a circle's radius: amplitude (fraction of r), frequency, phase. */
export type Harmonic = readonly [amp: number, freq: number, phase: number];

/** Points on a wobbly circle: r(θ) = r · (1 + Σ amp·sin(freq·θ + phase)). */
export function blobPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  harmonics: readonly Harmonic[],
  steps = 28,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    let k = 1;
    for (const [amp, freq, phase] of harmonics) k += amp * Math.sin(freq * a + phase);
    points.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return points;
}

/** A leaf or petal pointing along +x from the origin. */
export const leafPath = (length: number, width: number) =>
  `M0 0Q${f(length * 0.45)} ${f(-width)} ${f(length)} 0Q${f(length * 0.45)} ${f(width)} 0 0Z`;

/** Four-pointed twinkle star centred on the origin. */
export const starPath = (r: number) => {
  const q = r * 0.22;
  return `M0 ${-r}Q${q} ${-q} ${r} 0Q${q} ${q} 0 ${r}Q${-q} ${q} ${-r} 0Q${-q} ${-q} 0 ${-r}Z`;
};

export function linearGradient(defs: SVGDefsElement, stops: [number, string][], x2 = 0, y2 = 1): string {
  const id = uid('lg');
  defs.appendChild(
    el(
      'linearGradient',
      { id, x1: 0, y1: 0, x2, y2 },
      ...stops.map(([offset, color]) => el('stop', { offset, 'stop-color': color })),
    ),
  );
  return `url(#${id})`;
}

export function radialGradient(defs: SVGDefsElement, stops: [number, string, number?][], cx = 0.5, cy = 0.5): string {
  const id = uid('rg');
  defs.appendChild(
    el(
      'radialGradient',
      { id, cx, cy, r: 0.6 },
      ...stops.map(([offset, color, opacity = 1]) =>
        el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }),
      ),
    ),
  );
  return `url(#${id})`;
}

export function glowFilter(defs: SVGDefsElement, blur: number): string {
  const id = uid('glow');
  const filter = el('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  filter.appendChild(el('feGaussianBlur', { stdDeviation: blur }));
  defs.appendChild(filter);
  return `url(#${id})`;
}

export const translate = (x: number, y: number) => `translate(${f(x)} ${f(y)})`;
export const rotateAbout = (deg: number, x: number, y: number) => `rotate(${f(deg)} ${f(x)} ${f(y)})`;
/** Scale about a fixed point. */
export const scaleAbout = (sx: number, sy: number, x: number, y: number) =>
  `translate(${f(x)} ${f(y)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${f(-x)} ${f(-y)})`;

/** 0..1 eyelid closure: a quick blink every `period` seconds, offset by `phase`. */
export function blink(t: number, period = 4, phase = 0): number {
  const p = (((t + phase) % period) + period) % period;
  return p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0;
}

/** Smooth 1D value noise: a sum of incommensurate sines, cheap and good enough for flicker. */
export const wobble = (x: number) => Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 4.1 + 0.4) * 0.2;
