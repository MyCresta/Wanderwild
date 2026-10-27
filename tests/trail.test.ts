import { describe, expect, it } from 'vitest';
import { drawTrail, trailChest, trailToday } from '../src/game/trail';
import { companionFind, FIND_EVERY_M, findsBetween } from '../src/game/companionFinds';
import { haversine } from '../src/geo/distance';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';

const here = { lat: 55.9533, lng: -3.1883 };
const noon = new Date(2026, 9, 27, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('daily wander trail', () => {
  it('draws three marks within a kilometre, spread round the compass', () => {
    const trail = drawTrail(here, noon);
    expect(trail.marks).toHaveLength(3);
    for (const m of trail.marks) {
      const d = haversine(here, m);
      expect(d).toBeGreaterThan(240);
      expect(d).toBeLessThan(710);
    }
    expect(haversine(trail.marks[0], trail.marks[1])).toBeGreaterThan(200);
  });

  it('keeps the same trail all day and draws a new one tomorrow', () => {
    const trail = drawTrail(here, noon);
    expect(trailToday(trail, here, noon + 60_000)).toBe(trail);
    expect(trailToday(trail, here, noon + DAY)).not.toBe(trail);
    // Far away with nothing reached, it is drawn again where you are.
    const away = { lat: here.lat + 0.1, lng: here.lng };
    expect(trailToday(trail, away, noon).origin).toEqual(away);
  });

  it('opens a chest at the third mark, smaller if one was peeked, and peeks only once', () => {
    const game = new GameState(newSave(noon));
    game.trail(here, noon);
    expect(game.reachTrailMark(0, 'farsight', 'wildwood')?.chest).toBeNull();
    expect(game.reachTrailMark(1, 'farsight', 'wildwood')).toBeNull();
    expect(game.reachTrailMark(1, 'foot', 'wildwood')?.chest).toBeNull();
    const coin = game.save.currencies.coin;
    const chest = game.reachTrailMark(2, 'foot', 'wildwood')?.chest;
    expect(chest?.peeked).toBe(true);
    expect(game.save.currencies.coin).toBe(coin + chest!.coin);
    expect(game.save.trail?.opened).toBe(true);

    const walked = drawTrail(here, noon);
    for (const m of walked.marks) m.reached = 'foot';
    expect(trailChest(walked, 'wildwood').coin).toBeGreaterThan(chest!.coin);
  });

  it('survives a save round trip', () => {
    const save = newSave(noon);
    save.trail = drawTrail(here, noon);
    save.trail.marks[0].reached = 'foot';
    expect(migrate(JSON.parse(JSON.stringify(save))).trail).toEqual(save.trail);
    expect(migrate({ ...save, trail: 'junk' }).trail).toBeNull();
  });
});

describe('companion finds', () => {
  it('come about every thousand steps', () => {
    expect(FIND_EVERY_M).toBe(750);
    expect(findsBetween(0, 749)).toBe(0);
    expect(findsBetween(749, 751)).toBe(1);
    expect(findsBetween(0, 3000)).toBe(4);
  });

  it('follow the companion’s element', () => {
    const relic = (n: number) => companionFind('grove', 1, n).materials.shrineRelic;
    const n = [1, 2, 3, 4, 5, 6, 7, 8].find((i) => !relic(i))!;
    expect(companionFind('grove', 1, n).materials.ironbark).toBeGreaterThan(0);
    expect(companionFind('tide', 1, n).materials.mistwool).toBeGreaterThan(0);
    expect(companionFind('ember', 1, n).coin).toBeGreaterThan(0);
    expect(companionFind('lumen', 1, n).wanderlight).toBeGreaterThan(0);
    expect(companionFind('grove', 30, n).materials.ironbark).toBeGreaterThan(companionFind('grove', 1, n).materials.ironbark!);
  });
});
