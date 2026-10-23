import { describe, expect, it } from 'vitest';
import {
  DEEDS,
  earnDeeds,
  newDeeds,
  parseDeeds,
  recordRealm,
  recordShrines,
  recordWalk,
  recordWin,
  wearTitle,
  wornTitle,
  type DeedStats,
} from '../src/game/deeds';
import { migrate, newSave } from '../src/game/save';

const base = (over: Partial<DeedStats> = {}): Omit<DeedStats, 'counters' | 'deedsEarned'> => ({
  distanceMetres: 0,
  shrinesVisited: 0,
  cellsWalked: 0,
  wayfarerLevel: 1,
  coin: 0,
  wanderlight: 0,
  speciesBound: 0,
  speciesSeen: 0,
  bestPetLevel: 0,
  huntsSolved: 0,
  huntsWithoutClues: 0,
  ...over,
});

const at = (y: number, m: number, d: number, hour: number) => new Date(y, m - 1, d, hour, 30).getTime();

describe('deeds', () => {
  it('have unique ids and sensible goals', () => {
    expect(new Set(DEEDS.map((d) => d.id)).size).toBe(DEEDS.length);
    for (const d of DEEDS) expect(d.goal).toBeGreaterThan(0);
  });

  it('awards "Walked a Marathon" and everything below it at 42.2 km, once', () => {
    const state = newDeeds();
    const fresh = earnDeeds(state, base({ distanceMetres: 42_195 })).map((d) => d.id);
    expect(fresh).toEqual(expect.arrayContaining(['first-steps', 'league', 'roadworn', 'marathon']));
    expect(fresh).not.toContain('centurion');
    expect(earnDeeds(state, base({ distanceMetres: 50_000 }))).toEqual([]);
  });

  it('earns Renowned after 25 other deeds', () => {
    const state = newDeeds();
    Object.assign(state.counters, { petsBound: 60, blotspawnBanished: 200 });
    const fresh = earnDeeds(
      state,
      base({ distanceMetres: 600_000, shrinesVisited: 60, cellsWalked: 2000, wayfarerLevel: 50, coin: 2000, wanderlight: 200, speciesBound: 6, speciesSeen: 10, bestPetLevel: 30 }),
    );
    expect(fresh.map((d) => d.id)).toContain('renowned');
  });

  it('tracks daily distance, streaks and walks by night and dawn', () => {
    const c = newDeeds().counters;
    recordWalk(c, 1200, at(2026, 10, 20, 23));
    recordWalk(c, 1100, at(2026, 10, 21, 6));
    recordWalk(c, 1000, at(2026, 10, 22, 12));
    expect(c.streak).toBe(3);
    expect(c.nightMetres).toBe(1200);
    expect(c.dawnMetres).toBe(1100);
    recordWalk(c, 1500, at(2026, 10, 24, 12));
    expect(c.streak).toBe(1);
    expect(c.bestStreak).toBe(3);
    expect(c.bestDayMetres).toBe(1500);
  });

  it('counts realms, wins and the secret feats', () => {
    const c = newDeeds().counters;
    expect(recordRealm(c, 'wildwood', at(2026, 10, 20, 12))).toBe(true);
    expect(recordRealm(c, 'wildwood', at(2026, 10, 20, 12))).toBe(false);
    recordRealm(c, 'barrows', at(2026, 10, 20, 23));
    expect(c.feats).toContain('barrowsAtNight');
    recordWin(c, 'pet', 'legendary');
    recordWin(c, 'monster', 'common');
    expect([c.petsBound, c.legendaryBound, c.blotspawnBanished]).toEqual([1, 1, 1]);

    const t = at(2026, 10, 20, 12);
    recordShrines(c, 4, t); // first look only takes the count
    recordShrines(c, 5, t);
    recordShrines(c, 6, t + 5 * 60_000);
    expect(c.feats).not.toContain('shrineDash');
    recordShrines(c, 7, t + 12 * 60_000);
    expect(c.feats).toContain('shrineDash');
  });

  it('only lets earned titles be worn', () => {
    const state = newDeeds();
    expect(wearTitle(state, 'marathon')).toBe(false);
    earnDeeds(state, base({ distanceMetres: 42_195 }));
    expect(wearTitle(state, 'marathon')).toBe(true);
    expect(wornTitle(state)).toBe('the Marathoner');
    expect(wearTitle(state, 'first-steps')).toBe(false); // no title on that deed
  });

  it('survive a save round trip and repair bad data', () => {
    const save = newSave(0);
    earnDeeds(save.deeds, base({ distanceMetres: 42_195 }), 5);
    wearTitle(save.deeds, 'marathon');
    recordRealm(save.deeds.counters, 'tidemere', 0);
    const back = migrate(JSON.parse(JSON.stringify(save)));
    expect(back.deeds).toEqual(save.deeds);

    const broken = parseDeeds({ earned: { marathon: 'x', nope: 1, league: 3 }, title: 'marathon', counters: { petsBound: 'lots', realms: [1, 'wildwood'] } });
    expect(broken.earned).toEqual({ league: 3 });
    expect(broken.title).toBeNull();
    expect(broken.counters.petsBound).toBe(0);
    expect(broken.counters.realms).toEqual(['wildwood']);
    expect(migrate({ version: 1 }).deeds).toEqual(newDeeds());
  });
});
