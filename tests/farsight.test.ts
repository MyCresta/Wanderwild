import { describe, expect, it } from 'vitest';
import { CURIO_WINDOW_MS, curioReward, curiosNear, FARSIGHT_RANGE_M, FARSIGHT_SHARE } from '../src/game/farsight';
import { SPAWN_CELL_M, SPAWN_WINDOW_MS, spawnsNear } from '../src/game/spawns';
import { creatureForSpawn } from '../src/creatures/stats';
import { haversine } from '../src/geo/distance';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';

const here = { lat: 55.9533, lng: -3.1883 };
const noon = Date.UTC(2026, 9, 23, 12);

describe('curios', () => {
  it('are the same for everyone on a day and change the next day', () => {
    const a = curiosNear(here.lat, here.lng, noon);
    expect(a.length).toBeGreaterThan(3);
    expect(curiosNear(here.lat, here.lng, noon + 60_000)).toEqual(a);
    const tomorrow = curiosNear(here.lat, here.lng, noon + CURIO_WINDOW_MS).map((c) => c.id);
    expect(tomorrow.some((id) => a.some((c) => c.id === id))).toBe(false);
  });

  it('leave out ones already found', () => {
    const [first, ...rest] = curiosNear(here.lat, here.lng, noon);
    expect(curiosNear(here.lat, here.lng, noon, { [first.id]: first.expiresAt })).toEqual(rest);
  });

  it('pay in full on foot and a share by Farsight', () => {
    for (const curio of curiosNear(here.lat, here.lng, noon)) {
      const full = curioReward(curio, 'wildwood', true);
      const far = curioReward(curio, 'wildwood', false);
      const total = (r: typeof full) => r.coin + r.xp + r.wanderlight + Object.values(r.materials).reduce((s, n) => s + (n ?? 0), 0);
      expect(total(full)).toBeGreaterThan(0);
      expect(total(far)).toBeLessThanOrEqual(total(full));
      expect(total(far)).toBeGreaterThanOrEqual(Math.floor(total(full) * FARSIGHT_SHARE) - 1);
    }
  });

  it('can only be picked up once and the save remembers it', () => {
    const game = new GameState(newSave(noon));
    const [curio] = curiosNear(here.lat, here.lng, noon);
    expect(game.findCurio(curio, 'hearthfields', true)).not.toBeNull();
    expect(game.findCurio(curio, 'hearthfields', true)).toBeNull();
    const reloaded = migrate(JSON.parse(JSON.stringify(game.save)), noon);
    expect(reloaded.curiosFound[curio.id]).toBe(curio.expiresAt);
  });
});

describe('the Farsight ring', () => {
  it('holds enough to do, but not endless loot', () => {
    const cells = Math.ceil(FARSIGHT_RANGE_M / SPAWN_CELL_M) + 1;
    let foes = 0;
    let curios = 0;
    const days = 10;
    for (let i = 0; i < days; i++) {
      const t = noon + i * CURIO_WINDOW_MS + (i % 4) * SPAWN_WINDOW_MS;
      foes += spawnsNear(here.lat, here.lng, t, cells)
        .filter((s) => haversine(here, s) <= FARSIGHT_RANGE_M)
        .filter((s) => creatureForSpawn(s, 10).species.kind === 'monster').length;
      curios += curiosNear(here.lat, here.lng, t, {}, Math.ceil(FARSIGHT_RANGE_M / 120) + 1).filter(
        (c) => haversine(here, c) <= FARSIGHT_RANGE_M,
      ).length;
    }
    // Per 15 minute window, and per day.
    expect(foes / days).toBeGreaterThan(15);
    expect(foes / days).toBeLessThan(50);
    expect(curios / days).toBeGreaterThan(30);
    expect(curios / days).toBeLessThan(80);
  });
});
