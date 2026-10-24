import { describe, expect, it } from 'vitest';
import { REACH_M, playerReach } from '../src/geo/reach';
import { haversine } from '../src/geo/distance';
import { spawnsNear } from '../src/game/spawns';

const fix = (accuracy: number) => ({ lat: 55.9533, lng: -3.1883, accuracy, time: 0 });

describe('creature reach', () => {
  it('adds gear bonuses and forgives part of the GPS error', () => {
    expect(playerReach(fix(0))).toBe(REACH_M);
    expect(playerReach(fix(15), 10)).toBe(REACH_M + 25);
    expect(playerReach(fix(500))).toBe(REACH_M + 40);
  });

  it('usually leaves some of the shown creatures within reach', () => {
    // The map shows the 3x3 cells around the player, which reach well past the ring.
    let inReach = 0;
    let shown = 0;
    for (let i = 0; i < 200; i++) {
      const here = { ...fix(10), lat: 55.95 + i * 0.0013, lng: -3.19 + i * 0.0007 };
      const spawns = spawnsNear(here.lat, here.lng, i * 15 * 60 * 1000, 1);
      shown += spawns.length;
      inReach += spawns.filter((s) => haversine(here, s) <= playerReach(here)).length;
    }
    expect(shown / 200).toBeGreaterThan(9);
    expect(inReach / 200).toBeGreaterThan(1.5);
  });
});
