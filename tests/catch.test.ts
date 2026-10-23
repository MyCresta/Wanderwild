import { describe, expect, it } from 'vitest';
import {
  coveredPoints,
  GILDED_QUALITY,
  gradeLevels,
  MIN_QUALITY,
  oddsColor,
  patienceSeconds,
  pressInWindow,
  PRESS_AT,
  radialOutline,
  scoreSketch,
  sketchGrade,
  TOLERANCE,
  wobbleOdds,
  WOBBLES,
  type Vec,
} from '../src/ui/catch/sketch';

const circle = (cx: number, cy: number, r: number, n = 72): Vec[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

describe('finding the outline', () => {
  it('traces the edge of a filled disc', () => {
    const outline = radialOutline((x, y) => Math.hypot(x - 100, y - 110) <= 50);
    expect(outline.length).toBe(72);
    for (const p of outline) expect(Math.hypot(p.x - 100, p.y - 110)).toBeGreaterThan(44);
    for (const p of outline) expect(Math.hypot(p.x - 100, p.y - 110)).toBeLessThan(52);
  });

  it('softens thin spikes so they are fair to trace', () => {
    const spiky = radialOutline((x, y) => Math.hypot(x - 100, y - 100) <= 40 || (Math.abs(y - 100) < 2 && x > 100 && x < 190));
    const reach = Math.max(...spiky.map((p) => p.x));
    expect(reach).toBeLessThan(170);
  });

  it('is empty for a blank drawing', () => {
    expect(radialOutline(() => false)).toEqual([]);
  });
});

describe('grading a sketch', () => {
  const outline = circle(100, 100, 60);

  it('scores a perfect trace as masterful', () => {
    const score = scoreSketch(outline, [circle(100, 100, 60, 200)]);
    expect(score.coverage).toBe(1);
    expect(score.quality).toBeGreaterThan(0.95);
    expect(sketchGrade(score.quality)).toBe('Masterful');
  });

  it('forgives a little wobble but not a wide miss', () => {
    const close = scoreSketch(outline, [circle(100, 100, 64, 200)]).quality;
    const wide = scoreSketch(outline, [circle(100, 100, 60 + TOLERANCE * 2.5, 200)]).quality;
    expect(close).toBeGreaterThan(0.75);
    expect(wide).toBeLessThan(MIN_QUALITY);
  });

  it('needs the whole way round', () => {
    const half = circle(100, 100, 60, 200).slice(0, 100);
    const score = scoreSketch(outline, [half]);
    expect(score.coverage).toBeCloseTo(0.5, 1);
    expect(score.quality).toBeLessThan(0.35);
  });

  it('accepts a trace in several strokes', () => {
    const full = circle(100, 100, 60, 200);
    expect(scoreSketch(outline, [full.slice(0, 110), full.slice(100)]).quality).toBeGreaterThan(0.95);
  });

  it('does not reward scribbling all over the page', () => {
    const scribble: Vec[] = [];
    for (let i = 0; i < 400; i++) scribble.push({ x: 30 + ((i * 37) % 140), y: 30 + ((i * 53) % 140) });
    const score = scoreSketch(outline, [scribble]);
    expect(score.quality).toBeLessThan(MIN_QUALITY);
  });

  it('marks which parts of the outline the line has passed', () => {
    const covered = coveredPoints(outline, [[{ x: 160, y: 100 }]]);
    expect(covered[0]).toBe(true);
    expect(covered[36]).toBe(false);
  });

  it('scores nothing for no trace', () => {
    expect(scoreSketch(outline, []).quality).toBe(0);
  });
});

describe('grades', () => {
  it('rise with quality and give finer specimens', () => {
    expect(sketchGrade(0.1)).toBe('Scribble');
    expect(sketchGrade(MIN_QUALITY)).toBe('Rough');
    expect(sketchGrade(0.7)).toBe('Fine');
    expect(sketchGrade(GILDED_QUALITY)).toBe('Masterful');
    expect(gradeLevels('Masterful')).toBe(2);
    expect(gradeLevels('Fine')).toBe(1);
    expect(gradeLevels('Rough')).toBe(0);
  });

  it('rare and wary creatures hold a pose for less time', () => {
    expect(patienceSeconds('rare', 0)).toBeLessThan(patienceSeconds('common', 0));
    expect(patienceSeconds('common', 2)).toBeLessThan(patienceSeconds('common', 0));
    expect(patienceSeconds('rare', 10)).toBe(5);
  });

  it('colours slim odds red and good odds green', () => {
    expect(oddsColor(0)).toBe('hsl(0 75% 45%)');
    expect(oddsColor(0.9)).toBe('hsl(120 75% 45%)');
  });
});

describe('wobbles', () => {
  it('multiply back to the catch chance, and a held seal does better', () => {
    expect(Math.pow(wobbleOdds(0.5, false), WOBBLES)).toBeCloseTo(0.5);
    expect(wobbleOdds(0.5, true)).toBeGreaterThan(wobbleOdds(0.5, false));
    expect(wobbleOdds(0.99, true)).toBeLessThanOrEqual(0.98);
  });

  it('only counts a press near the moment the ring meets the seal', () => {
    expect(pressInWindow(PRESS_AT)).toBe(true);
    expect(pressInWindow(PRESS_AT - 0.4)).toBe(false);
  });
});
