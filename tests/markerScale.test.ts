import { describe, expect, it } from 'vitest';
import { markerScale } from '../src/map/markerScale';

describe('markerScale', () => {
  it('is full size at play zoom', () => expect(markerScale(16)).toBe(1));
  it('shrinks when zoomed out, but not below the floor', () => {
    expect(markerScale(14)).toBeLessThan(1);
    expect(markerScale(14)).toBeGreaterThan(markerScale(12));
    expect(markerScale(3)).toBe(0.55);
  });
  it('grows a little zoomed in', () => expect(markerScale(20)).toBe(1.1));
  it('steps in twentieths', () => expect((markerScale(15.37) * 20) % 1).toBeCloseTo(0));
});
