import { describe, expect, it } from 'vitest';
import { spawnsNear } from '../src/game/spawns';
import { creatureForSpawn } from '../src/creatures/stats';
import { skyElements, skyLine, weatherFromCode } from '../src/game/weather';

describe('weather', () => {
  it('reads WMO weather codes', () => {
    expect(weatherFromCode(0)).toBe('clear');
    expect(weatherFromCode(3)).toBe('clouds');
    expect(weatherFromCode(45)).toBe('fog');
    expect(weatherFromCode(61)).toBe('rain');
    expect(weatherFromCode(81)).toBe('rain');
    expect(weatherFromCode(73)).toBe('snow');
    expect(weatherFromCode(95)).toBe('storm');
  });

  it('favours the weather element, and lumen at night', () => {
    expect(skyElements({ weather: 'rain', night: false })).toEqual(['tide']);
    expect(skyElements({ weather: null, night: true })).toEqual(['lumen']);
    expect(skyLine({ weather: 'rain', night: true })).toContain('Tide');
    expect(skyLine({ weather: 'rain', night: true })).toContain('Night');
  });

  const spawns = Array.from({ length: 40 }, (_, i) => spawnsNear(55.95 + i * 0.01, -3.19, 1_800_000_000_000, 1)).flat();

  it('brings out more Tide Wildlings in the rain', () => {
    const tide = (rain: boolean) =>
      spawns.map((s) => creatureForSpawn(s, 5, { weather: rain ? 'rain' : null, night: false })).filter((e) => e.species.kind === 'pet' && e.species.element === 'tide').length;
    expect(tide(true)).toBeGreaterThan(tide(false) * 1.5);
  });

  it('brings out more and deeper Blotspawn after dark', () => {
    const day = spawns.map((s) => creatureForSpawn(s, 10, { weather: null, night: false }));
    const night = spawns.map((s) => creatureForSpawn(s, 10, { weather: null, night: true }));
    const foes = (list: typeof day) => list.filter((e) => e.species.kind === 'monster');
    expect(foes(night).length).toBeGreaterThan(foes(day).length);
    const avg = (list: typeof day) => foes(list).reduce((sum, e) => sum + e.level, 0) / foes(list).length;
    expect(avg(night)).toBeGreaterThan(avg(day));
  });

  it('leaves spawns as they were without a sky', () => {
    for (const s of spawns.slice(0, 50)) expect(creatureForSpawn(s, 5, { weather: null, night: false })).toEqual(creatureForSpawn(s, 5));
  });
});
