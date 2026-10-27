import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  capMs,
  collect,
  newHearthstead,
  stored,
  storageHours,
  STRIDE_DAILY_CAP_MS,
  strideBoost,
  tick,
} from '../src/game/hearthstead';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';

const HOUR = 3_600_000;
const mine = BUILDINGS.mine;

describe('hearthstead buildings', () => {
  it('produce over real time, including while the app was closed', () => {
    const h = newHearthstead(0);
    h.buildings.mine = { level: 1, progressMs: 0 };
    tick(h, 2 * HOUR);
    expect(stored(mine, h.buildings.mine)).toBe(6);
  });

  it('stop at their storage cap (8 hours at level 1)', () => {
    const h = newHearthstead(0);
    h.buildings.mine = { level: 1, progressMs: 0 };
    tick(h, 30 * HOUR);
    expect(h.buildings.mine.progressMs).toBe(capMs(1));
    expect(storageHours(1)).toBe(8);
    expect(storageHours(9)).toBe(24);
  });

  it('keep part-made units after collecting', () => {
    const b = { level: 1, progressMs: 1.5 * HOUR }; // 4.5 ore
    expect(collect(mine, b)).toBe(4);
    expect(b.progressMs).toBeCloseTo(HOUR / 6);
  });

  it('fast-forward 10 minutes per 100 m walked, up to 8 hours a day', () => {
    const h = newHearthstead(0);
    h.buildings.mine = { level: 1, progressMs: 0 };
    const noon = new Date(2026, 9, 23, 12).getTime();
    expect(strideBoost(h, 6, noon)).toBe(HOUR);
    expect(stored(mine, h.buildings.mine)).toBe(3);
    expect(strideBoost(h, 100, noon)).toBe(STRIDE_DAILY_CAP_MS - HOUR);
    expect(strideBoost(h, 1, noon)).toBe(0);
    // A new day resets the cap.
    expect(strideBoost(h, 1, noon + 24 * HOUR)).toBe(10 * 60_000);
  });
});

describe('hearthstead in the game', () => {
  it('needs Wayfarer level 3, then builds, collects and upgrades', () => {
    const game = new GameState(newSave(0));
    expect(game.build('mine', 0)).toBe(false);
    game.grantXp(283 + 520);
    expect(game.build('mine', 0)).toBe(true);
    expect(game.collect('mine', 4 * HOUR)).toBe(12);
    expect(game.save.materials.cobbleOre).toBe(12);
    expect(game.canUpgrade('mine')).toBe(false);
    game.save.currencies.coin = 100;
    game.save.materials.ironbark = 10;
    expect(game.upgrade('mine', 4 * HOUR)).toBe(true);
    expect(game.save.hearthstead.buildings.mine?.level).toBe(2);
    expect(game.save.currencies.coin).toBe(60);
    expect(game.save.materials.ironbark).toBe(6);
  });

  it('brews a tonic every two hours, with no limit on how many you carry', () => {
    const game = new GameState(newSave(0));
    game.grantXp(283 + 520);
    game.build('herbGarden', 0);
    expect(game.collect('herbGarden', 4 * HOUR)).toBe(2);
    expect(game.collect('herbGarden', 12 * HOUR)).toBe(4);
    expect(game.collect('herbGarden', 24 * HOUR)).toBe(4);
    expect(game.save.supplies.tonic).toBe(10);
  });

  it('applies the stride boost while walking', () => {
    const game = new GameState(newSave(0));
    game.grantXp(283 + 520);
    game.build('herbGarden', 0);
    const events: string[] = [];
    game.on((e) => e.kind === 'stride' && events.push(e.kind));
    game.recordWalk(300, 0);
    expect(events).toEqual(['stride']);
    expect(game.save.hearthstead.buildings.herbGarden?.progressMs).toBe(30 * 60_000);
  });
});

describe('save migration', () => {
  it('upgrades a version 1 save with an empty Hearthstead', () => {
    const v1 = { version: 1, currencies: { coin: 7, wanderlight: 3 }, wayfarer: { xp: 900 } };
    const save = migrate(v1, 10);
    expect(save.version).toBe(5);
    expect(save.currencies.coin).toBe(7);
    expect(save.hearthstead).toEqual({ buildings: {}, lastTick: 10, strideDay: '', strideUsedMs: 0 });
  });

  it('drops retired eggs and hatchlings from old saves', () => {
    const save = migrate({ version: 5, eggs: [{ id: 'e', km: 2, seed: 1, walkedM: 10, foundAt: 0 }], hatchlings: [{ seed: 3 }] }, 10);
    expect('eggs' in save).toBe(false);
    expect('hatchlings' in save).toBe(false);
  });
});
