import { describe, expect, it } from 'vitest';
import { cellAt, cellsAround } from '../src/game/cells';
import { pointInPolygon, realmFromFeatures, distanceToLineM } from '../src/game/realms';
import { exportSave, importSave, migrate, newSave } from '../src/game/save';
import { rollShrineReward, shrineKind, SHRINE_COOLDOWN_MS, type Shrine } from '../src/game/shrines';
import { spawnsInCell, spawnsNear, SPAWN_WINDOW_MS } from '../src/game/spawns';
import { GameState } from '../src/game/state';
import { levelFromXp, nextUnlock, xpForLevel } from '../src/game/wayfarer';

describe('wayfarer levels', () => {
  it('follows 100 × level^1.5 per level, matching the roadmap table', () => {
    expect(xpForLevel(3)).toBe(520);
    expect(xpForLevel(10)).toBe(3162);
    expect(xpForLevel(30)).toBe(16432);
  });

  it('turns total XP into a level and progress', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: 283 });
    expect(levelFromXp(283)).toEqual({ level: 2, into: 0, needed: 520 });
    expect(levelFromXp(283 + 520 + 10).level).toBe(3);
    expect(nextUnlock(3)?.level).toBe(5);
  });
});

describe('cells', () => {
  it('gives the same cell to nearby points and a different one further away', () => {
    const a = cellAt(55.9533, -3.1883, 150);
    expect(cellAt(55.95331, -3.18831, 150).id).toBe(a.id);
    expect(cellAt(55.9553, -3.1883, 150).id).not.toBe(a.id);
  });

  it('makes cells roughly square in metres', () => {
    const c = cellAt(55.95, -3.19, 150);
    const heightM = (c.north - c.south) * 111_320;
    const widthM = (c.east - c.west) * 111_320 * Math.cos((55.95 * Math.PI) / 180);
    expect(heightM).toBeCloseTo(150, 0);
    expect(Math.abs(widthM - 150)).toBeLessThan(1);
  });

  it('lists the neighbourhood around a point', () => {
    const cells = cellsAround(55.95, -3.19, 150, 1);
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((c) => c.id)).size).toBe(9);
    expect(cells.map((c) => c.id)).toContain(cellAt(55.95, -3.19, 150).id);
  });
});

describe('spawns', () => {
  const t = Date.UTC(2026, 9, 23, 12, 0);

  it('are the same for everyone in the same place and window', () => {
    expect(spawnsNear(55.95, -3.19, t)).toEqual(spawnsNear(55.95, -3.19, t + 60_000));
  });

  it('change when the 15-minute window moves on', () => {
    const now = spawnsNear(55.95, -3.19, t).map((s) => s.id);
    const later = spawnsNear(55.95, -3.19, t + SPAWN_WINDOW_MS).map((s) => s.id);
    expect(now.some((id) => later.includes(id))).toBe(false);
  });

  it('stay inside their cell', () => {
    const cell = cellAt(55.95, -3.19, 150);
    for (let w = 0; w < 50; w++)
      for (const s of spawnsInCell(cell, w)) {
        expect(s.lat).toBeGreaterThan(cell.south);
        expect(s.lat).toBeLessThan(cell.north);
        expect(s.lng).toBeGreaterThan(cell.west);
        expect(s.lng).toBeLessThan(cell.east);
      }
  });

  it('are mostly common with the occasional rare', () => {
    const all = Array.from({ length: 400 }, (_, w) => spawnsInCell(cellAt(51.5, -0.12, 150), w)).flat();
    const share = (r: string) => all.filter((s) => s.rarity === r).length / all.length;
    expect(all.length).toBeGreaterThan(400);
    expect(share('common')).toBeGreaterThan(0.5);
    expect(share('rare')).toBeGreaterThan(0.03);
    expect(share('legendary')).toBeLessThan(0.03);
  });
});

describe('realms', () => {
  it('maps OpenMapTiles features to realms, most specific first', () => {
    expect(realmFromFeatures([])).toBe('hearthfields');
    expect(realmFromFeatures([{ layer: 'landuse', class: 'residential' }])).toBe('hearthfields');
    expect(realmFromFeatures([{ layer: 'park', class: 'park' }])).toBe('wildwood');
    expect(realmFromFeatures([{ layer: 'landcover', class: 'wood' }])).toBe('wildwood');
    expect(realmFromFeatures([{ layer: 'landuse', class: 'retail' }])).toBe('stoneward');
    expect(
      realmFromFeatures([
        { layer: 'landuse', class: 'cemetery' },
        { layer: 'landcover', class: 'grass' },
      ]),
    ).toBe('barrows');
    expect(realmFromFeatures([{ layer: 'park' }], true)).toBe('tidemere');
  });

  it('tests points against polygons with holes', () => {
    const square = (s: number, o = 0) => [
      [o, o],
      [o + s, o],
      [o + s, o + s],
      [o, o + s],
      [o, o],
    ];
    const donut = { type: 'Polygon' as const, coordinates: [square(10), square(2, 4)] };
    expect(pointInPolygon(1, 1, donut)).toBe(true);
    expect(pointInPolygon(5, 5, donut)).toBe(false);
    expect(pointInPolygon(11, 5, donut)).toBe(false);
  });

  it('measures distance to a river line', () => {
    // A line 0.0003° (about 33 m) north of the point.
    const line = [
      [-3.2, 55.9503],
      [-3.18, 55.9503],
    ];
    expect(distanceToLineM(-3.19, 55.95, line)).toBeCloseTo(33.2, 0);
  });
});

describe('shrines', () => {
  const shrine: Shrine = { id: 'shrine:test', name: 'St Giles', kind: 'chapel', lat: 55.9495, lng: -3.1908 };

  it('recognises places of worship, libraries and viewpoints', () => {
    expect(shrineKind('place_of_worship')).toBe('chapel');
    expect(shrineKind('attraction', 'viewpoint')).toBe('vista');
    expect(shrineKind('cafe')).toBeUndefined();
  });

  it('gives the realm material', () => {
    const reward = rollShrineReward(shrine, 'barrows', 0);
    expect(reward.materials.gravemoss).toBeGreaterThan(0);
    expect(reward.coin).toBeGreaterThanOrEqual(8);
  });
});

describe('game state', () => {
  it('pays Wanderlight, coin and XP for each full 100 m walked', () => {
    const game = new GameState(newSave(0));
    game.recordWalk(250, 0);
    expect(game.save.currencies.wanderlight).toBe(2);
    expect(game.save.wayfarer.xp).toBe(60);
    game.recordWalk(60, 0);
    expect(game.save.currencies.wanderlight).toBe(3);
    expect(game.save.distanceMetres).toBe(310);
  });

  it('does not pay out distance walked before the save existed', () => {
    const game = new GameState(newSave(0, 5000));
    game.recordWalk(50, 0);
    expect(game.save.currencies.wanderlight).toBe(0);
  });

  it('announces level ups with what they unlock', () => {
    const game = new GameState(newSave(0));
    const events: unknown[] = [];
    game.on((e) => e.kind === 'levelUp' && events.push(e));
    game.grantXp(283 + 520);
    expect(events).toEqual([{ kind: 'levelUp', level: 3, unlocks: [expect.objectContaining({ level: 3 })] }]);
  });

  it('puts a shrine on cooldown and blesses the wayfarer', () => {
    const game = new GameState(newSave(0));
    const shrine: Shrine = { id: 'shrine:a', name: 'A', kind: 'vista', lat: 0, lng: 0 };
    expect(game.useShrine(shrine, 'wildwood', 1000)).toBe(true);
    expect(game.useShrine(shrine, 'wildwood', 2000)).toBe(false);
    expect(game.save.materials.ironbark).toBeGreaterThan(0);
    expect(game.isBlessed(2000)).toBe(true);
    expect(game.useShrine(shrine, 'wildwood', 1000 + SHRINE_COOLDOWN_MS)).toBe(true);
    expect(game.save.shrinesVisited).toBe(2);
  });

  it('records each ~50 m square only once', () => {
    const game = new GameState(newSave(0));
    game.visit(55.95, -3.19);
    game.visit(55.95001, -3.19001);
    game.visit(55.951, -3.19);
    expect(game.save.visitedCells).toHaveLength(2);
  });
});

describe('save files', () => {
  it('round-trips through export and import', () => {
    const save = newSave(1000);
    save.currencies.coin = 42;
    save.materials.ironbark = 3;
    save.pets = [{ any: 'shape' }];
    expect(importSave(exportSave(save), 2000)).toEqual(save);
  });

  it('rejects files that are not Wanderwild saves', () => {
    expect(() => importSave('not json')).toThrow(/not a Wanderwild save/);
    expect(() => importSave('{"version":1}')).toThrow(/not a Wanderwild save/);
    expect(() => migrate({ version: 99 })).toThrow(/newer version/);
  });

  it('fills in missing and broken fields with defaults', () => {
    const save = migrate({ version: 1, currencies: { coin: 'lots' }, materials: { ironbark: 2, bad: 'x' } }, 5);
    expect(save.currencies).toEqual({ coin: 0, wanderlight: 0 });
    expect(save.materials).toEqual({ ironbark: 2 });
    expect(save.visitedCells).toEqual([]);
  });
});
