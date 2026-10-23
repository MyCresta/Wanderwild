import { describe, expect, it } from 'vitest';
import { haversine, WalkTracker, type Fix } from '../src/geo/distance';

// About 0.0001 degrees of latitude is 11.1 m.
const fix = (latOffset: number, seconds: number, accuracy = 5): Fix => ({
  lat: 55.95 + latOffset,
  lng: -3.19,
  accuracy,
  time: seconds * 1000,
});

describe('haversine', () => {
  it('measures one degree of latitude as about 111 km', () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
  });
});

describe('WalkTracker', () => {
  it('counts a steady walk', () => {
    const t = new WalkTracker();
    for (let i = 0; i <= 10; i++) t.add(fix(i * 0.0001, i * 10)); // ~11 m every 10 s
    expect(t.totalMetres).toBeGreaterThan(105);
    expect(t.totalMetres).toBeLessThan(118);
  });

  it('ignores jitter while standing still', () => {
    const t = new WalkTracker();
    for (let i = 0; i < 20; i++) t.add(fix((i % 2) * 0.00003, i * 5)); // ~3 m wobble
    expect(t.totalMetres).toBe(0);
  });

  it('ignores inaccurate fixes', () => {
    const t = new WalkTracker();
    t.add(fix(0, 0));
    expect(t.add(fix(0.001, 60, 200))).toBe(0);
  });

  it('does not count driving', () => {
    const t = new WalkTracker();
    t.add(fix(0, 0));
    expect(t.add(fix(0.002, 10))).toBe(0); // ~222 m in 10 s
    expect(t.add(fix(0.0021, 20))).toBeGreaterThan(0); // walking again from the new spot
  });

  it('continues from a saved total', () => {
    const t = new WalkTracker(500);
    t.add(fix(0, 0));
    t.add(fix(0.0001, 10));
    expect(t.totalMetres).toBeGreaterThan(510);
  });
});
