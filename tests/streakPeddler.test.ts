import { describe, expect, it } from 'vitest';
import { haversine } from '../src/geo/distance';
import { migrate, newSave } from '../src/game/save';
import { GameState, STRIDE_M } from '../src/game/state';
import { keepStreak, STREAK_STEPS, streakDays, streakXp, yesterdayKey } from '../src/game/streak';
import { GEAR_PRICE, peddlerToday, peddlerWare, placePeddler, RUNE_PRICE } from '../src/game/peddler';
import { dayKey } from '../src/game/hearthstead';

const here = { lat: 55.9533, lng: -3.1883 };
const noon = new Date(2026, 9, 27, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('walk streak', () => {
  it('grows on consecutive days, survives until the day after, then ends', () => {
    const streak = { day: '', days: 0 };
    expect(keepStreak(streak, STREAK_STEPS - 1, noon)).toBe(0);
    expect(keepStreak(streak, STREAK_STEPS, noon)).toBe(1);
    expect(keepStreak(streak, STREAK_STEPS + 500, noon)).toBe(0);
    expect(keepStreak(streak, STREAK_STEPS, noon + DAY)).toBe(2);
    // Still alive the next day before the goal is reached; gone the day after that.
    expect(streakDays(streak, noon + 2 * DAY)).toBe(2);
    expect(streakDays(streak, noon + 3 * DAY)).toBe(0);
    expect(keepStreak(streak, STREAK_STEPS, noon + 3 * DAY)).toBe(1);
  });

  it('knows yesterday across a clock change', () => {
    // 2026-03-29 is the 23-hour day in Europe; just after midnight the next day.
    const late = new Date(2026, 2, 30, 0, 30).getTime();
    expect(yesterdayKey(late)).toBe(dayKey(new Date(2026, 2, 29, 12).getTime()));
  });

  it('caps the XP bonus', () => {
    expect(streakXp({ day: dayKey(noon), days: 3 }, noon)).toBeCloseTo(1.06);
    expect(streakXp({ day: dayKey(noon), days: 40 }, noon)).toBeCloseTo(1.2);
  });

  it('is kept by walking and adds to XP', () => {
    const game = new GameState(newSave(noon));
    game.recordWalk(STREAK_STEPS * STRIDE_M + 1, noon);
    expect(game.streak(noon)).toEqual({ days: 1, kept: true });
    expect(game.streak(noon + DAY)).toEqual({ days: 1, kept: false });
    const xp = game.save.wayfarer.xp;
    game.grantXp(100);
    expect(game.save.wayfarer.xp - xp).toBe(102);
  });

  it('survives a save round trip', () => {
    const save = newSave(noon);
    save.streak = { day: dayKey(noon), days: 4 };
    expect(migrate(JSON.parse(JSON.stringify(save)), noon).streak).toEqual(save.streak);
  });
});

describe('wandering peddler', () => {
  it('camps within a kilometre and stays all day', () => {
    const p = placePeddler(here, noon);
    const d = haversine(here, p);
    expect(d).toBeGreaterThan(390);
    expect(d).toBeLessThan(1010);
    expect(peddlerToday(p, here, noon + 60_000)).toBe(p);
    expect(peddlerToday(p, here, noon + DAY)).not.toBe(p);
  });

  it('only sells gear that beats what the slot wears', () => {
    const p = placePeddler(here, noon);
    const ware = peddlerWare(p, 5, { staff: { slot: 'staff', rarity: 'fine', plus: 2, runes: [] } });
    expect(ware?.kind).toBe('gear');
    if (ware?.kind === 'gear') {
      expect(ware.rarity).toBe('rare');
      expect(ware.price).toBe(GEAR_PRICE.rare);
    }
    // Every slot already Rare below level 20: nothing to sell, and no runes yet.
    const allRare = Object.fromEntries((['staff', 'cloak', 'boots', 'lantern', 'charm'] as const).map((slot) => [slot, { slot, rarity: 'rare' as const, plus: 0, runes: [] }]));
    expect(peddlerWare(p, 12, allRare)).toBeNull();
    expect(peddlerWare(p, 16, allRare)).toMatchObject({ kind: 'rune', price: RUNE_PRICE });
  });

  it('sells once for coin and keeps the slot upgrades', () => {
    const game = new GameState(newSave(noon));
    game.save.gear.boots = { slot: 'boots', rarity: 'worn', plus: 3, runes: [] };
    game.peddler(here, noon);
    const ware = game.peddlerWare()!;
    expect(game.buyFromPeddler()).toBeNull();
    game.save.currencies.coin = 1000;
    const text = game.buyFromPeddler();
    expect(text).toMatch(/^Bought/);
    expect(game.save.currencies.coin).toBe(1000 - ware.price);
    expect(game.save.peddler?.sold).toBe(true);
    expect(game.buyFromPeddler()).toBeNull();
    if (ware.kind === 'gear') expect(game.save.gear[ware.slot]?.rarity).toBe(ware.rarity);
    if (ware.kind === 'gear' && ware.slot === 'boots') expect(game.save.gear.boots?.plus).toBe(3);
    expect(migrate(JSON.parse(JSON.stringify(game.save)), noon).peddler).toEqual(game.save.peddler);
  });
});
