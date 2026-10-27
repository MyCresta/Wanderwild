import { describe, expect, it } from 'vitest';
import { trailSpot } from '../src/game/expeditions';

describe('expedition trails', () => {
  it('walks out for the first half and home for the second', () => {
    expect(trailSpot(0)).toEqual({ at: 0, back: false });
    expect(trailSpot(0.25)).toEqual({ at: 0.5, back: false });
    expect(trailSpot(0.5)).toEqual({ at: 1, back: true });
    expect(trailSpot(0.75)).toEqual({ at: 0.5, back: true });
    expect(trailSpot(1)).toEqual({ at: 0, back: true });
    expect(trailSpot(2).at).toBe(0);
  });
});
