import { describe, expect, it } from 'vitest';
import { foeThreat, INK_CELL_M, inkDepth } from '../src/creatures/foes';
import { creatureForSpawn, spawnInkDepth } from '../src/creatures/stats';

describe('ink depth across the map', () => {
  // A walk across town: one spawn every 50 m along a street.
  const spawns = Array.from({ length: 400 }, (_, i) => ({ seed: i * 7919 + 5, rarity: 'common' as const, lat: 51.5 + i * 0.00045, lng: -0.12 }));
  const foes = spawns.map((s) => creatureForSpawn(s, 10)).filter((e) => e.species.kind === 'monster' && e.rank === 'normal');

  it('has thin, even and deep patches', () => {
    const depths = new Set(spawns.map(spawnInkDepth));
    expect([...depths].sort()).toEqual(['deep', 'even', 'thin']);
  });

  it('spreads foe levels well beyond the party level', () => {
    const levels = foes.map((e) => e.level);
    expect(Math.min(...levels)).toBeLessThanOrEqual(6);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(14);
    for (const l of levels) expect(l).toBeGreaterThanOrEqual(5);
  });

  it('keeps the same depth for a whole patch, and the same foe at a spawn', () => {
    expect(inkDepth(`${INK_CELL_M}:1:1`)).toBe(inkDepth(`${INK_CELL_M}:1:1`));
    expect(creatureForSpawn(spawns[3], 10)).toEqual(creatureForSpawn(spawns[3], 10));
  });

  it('runs deeper in the Barrows', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `400:${i}:7`);
    const deep = (barrows: boolean) => ids.filter((id) => inkDepth(id, barrows) === 'deep').length;
    expect(deep(true)).toBeGreaterThan(deep(false));
  });
});

describe('foe threat', () => {
  it('reads the level gap and rank', () => {
    expect(foeThreat(5, 10)).toBe('easy');
    expect(foeThreat(10, 10)).toBe('even');
    expect(foeThreat(13, 10)).toBe('hard');
    expect(foeThreat(16, 10)).toBe('deadly');
    expect(foeThreat(10, 10, 'boss')).toBe('hard');
  });
});
