import { describe, expect, it } from 'vitest';
import {
  creatureOffset,
  flickVelocity,
  flightPose,
  isHit,
  landingPoint,
  oddsColor,
  pressInWindow,
  PRESS_AT,
  ringQuality,
  ringScale,
  speedFor,
  throwGrade,
  wobbleOdds,
  WOBBLES,
} from '../src/ui/catch/physics';

describe('throwing', () => {
  it('measures flick speed from the most recent samples', () => {
    const v = flickVelocity([
      { x: 0, y: 500, t: 0 },
      { x: 0, y: 490, t: 200 },
      { x: 10, y: 440, t: 250 },
      { x: 20, y: 390, t: 300 },
    ]);
    expect(v.y).toBeCloseTo(-1000);
    expect(v.x).toBeCloseTo(200);
  });

  it('flies from the hand to the landing point in an arc', () => {
    const start = { x: 200, y: 700 };
    const land = landingPoint(start, { x: 0, y: -1000 }, 500);
    expect(land.y).toBeLessThan(start.y);
    expect(flightPose(start, land, 0)).toMatchObject({ x: 200, y: 700, scale: 1 });
    const end = flightPose(start, land, 1);
    expect(end.x).toBeCloseTo(land.x);
    expect(end.y).toBeCloseTo(land.y);
    expect(flightPose(start, land, 0.5).y).toBeLessThan((start.y + land.y) / 2);
  });

  it('eases off for hard flicks, and speedFor inverts it', () => {
    const start = { x: 0, y: 0 };
    const soft = -landingPoint(start, { x: 0, y: -800 }, 500).y;
    const hard = -landingPoint(start, { x: 0, y: -4000 }, 500).y;
    expect(hard).toBeGreaterThan(soft);
    expect(hard).toBeLessThan(500);
    expect(-landingPoint(start, { x: 0, y: -speedFor(300, 500) }, 500).y).toBeCloseTo(300);
  });

  it('ignores the pause before the finger lifts', () => {
    const v = flickVelocity([
      { x: 0, y: 100, t: 0 },
      { x: 0, y: 50, t: 50 },
      { x: 0, y: 50, t: 120 },
    ]);
    expect(v.y).toBeCloseTo(-1000);
  });

  it('hits within the radius only', () => {
    expect(isHit({ x: 0, y: 0 }, { x: 50, y: 0 }, 50)).toBe(true);
    expect(isHit({ x: 0, y: 0 }, { x: 51, y: 0 }, 50)).toBe(false);
    expect(isHit({ x: 0, y: 0 }, { x: 0, y: 75 }, 50)).toBe(true);
  });
});

describe('the closing ring', () => {
  it('sweeps between wide and tight, and tighter is better', () => {
    const scales = Array.from({ length: 300 }, (_, i) => ringScale(i / 30));
    expect(Math.max(...scales)).toBeLessThanOrEqual(1);
    expect(Math.min(...scales)).toBeGreaterThan(0.15);
    expect(ringQuality(0.2)).toBeGreaterThan(ringQuality(0.8));
    expect(throwGrade(ringQuality(0.18))).toBe('Excellent!');
    expect(throwGrade(ringQuality(1))).toBeNull();
  });

  it('colours slim odds red and good odds green', () => {
    expect(oddsColor(0.05)).toContain('hsl(0 ');
    expect(oddsColor(0.9)).toContain('hsl(120 ');
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

describe('creature movement', () => {
  it('hops away when dodging and drifts back after', () => {
    const still = creatureOffset(10, 0, null, 1);
    const hopping = creatureOffset(10, 0, { at: 9.5, dir: 1 }, 1);
    expect(hopping.x - still.x).toBeGreaterThan(60);
    expect(creatureOffset(20, 0, { at: 9.5, dir: 1 }, 1)).toEqual(creatureOffset(20, 0, null, 1));
  });
});
