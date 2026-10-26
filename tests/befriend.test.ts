import { describe, expect, it } from 'vitest';
import { BLOT_TRUST_M, dismissFollower, followerTrust, followerWaitMs, HOURS_TO_BEFRIEND, startFollowing, walkNeeded, WALK_TO_BEFRIEND } from '../src/creatures/befriend';
import { elementSets, gatherRoost, keepWildling, mergeDuplicates, roosting, SET_BONUS, setBonus } from '../src/creatures/roost';
import { addPet, emptyCollection, petBoost } from '../src/creatures/collection';
import { BOOST_MAX, BOOST_PER_KIN, BOOST_ROLL, rollBoost, STAT_KEYS, statsAt } from '../src/creatures/stats';
import { getSpecies, PETS } from '../src/creatures/species';

const wild = (id = 'driftfin', level = 4) => ({ species: getSpecies(id), level, seed: 42 });

describe('befriending a Wildling', () => {
  it('joins after walking far enough together, keeping its level and look', () => {
    const c = emptyCollection();
    const f = startFollowing(c, 'spawn-1', wild(), 0, 0)!;
    expect(f.needM).toBe(WALK_TO_BEFRIEND[getSpecies('driftfin').rarity]);
    expect(c.seen).toContain('driftfin');
    expect(followerTrust(c, f.needM - 1, 1000)).toBeNull();
    const out = followerTrust(c, 5, 2000);
    expect(out?.kind).toBe('joined');
    expect(c.pets[0]).toMatchObject({ speciesId: 'driftfin', level: 4, seed: 42 });
    expect(c.follower).toBeNull();
  });

  it('only lets one follow at a time, and never a Blotspawn', () => {
    const c = emptyCollection();
    expect(startFollowing(c, 'a', wild())).not.toBeNull();
    expect(startFollowing(c, 'b', wild('bramblet'))).toBeNull();
    dismissFollower(c);
    expect(startFollowing(c, 'c', wild('smudgeling'))).toBeNull();
  });

  it('trusts faster when you drive off Blotspawn', () => {
    const c = emptyCollection();
    startFollowing(c, 'a', wild(), 0, 0);
    followerTrust(c, BLOT_TRUST_M, 0);
    expect(c.follower!.walkedM).toBe(BLOT_TRUST_M);
  });

  it('joins from home after a few hours, and walking cuts the wait', () => {
    const hour = 60 * 60 * 1000;
    const hours = HOURS_TO_BEFRIEND[getSpecies('driftfin').rarity];
    const c = emptyCollection();
    startFollowing(c, 'a', wild(), 0, 0);
    expect(followerWaitMs(c.follower!)).toBeCloseTo(hours * hour);
    expect(followerTrust(c, 0, (hours - 0.1) * hour)).toBeNull();
    expect(followerTrust(c, 0, hours * hour)?.kind).toBe('joined');

    const walker = emptyCollection();
    const f = startFollowing(walker, 'a', wild(), 0, 0)!;
    followerTrust(walker, f.needM / 2, 0);
    expect(followerWaitMs(f)).toBeCloseTo((hours * hour) / 2);
  });

  it('a charm shortens the wait as well as the walk', () => {
    const c = emptyCollection();
    const f = startFollowing(c, 'a', wild(), 0.5, 0)!;
    expect(followerWaitMs(f)).toBeCloseTo((HOURS_TO_BEFRIEND[getSpecies('driftfin').rarity] * 60 * 60 * 1000) / 2);
  });

  it('a charm shortens the walk, but never below half', () => {
    expect(walkNeeded('common', 0.2)).toBe(Math.round(WALK_TO_BEFRIEND.common * 0.8));
    expect(walkNeeded('rare', 2)).toBe(WALK_TO_BEFRIEND.rare / 2);
  });
});

describe('the Roost', () => {
  const hour = 60 * 60 * 1000;

  it('keeps one of each kind: a stronger newcomer raises the one you keep', () => {
    const c = emptyCollection();
    const first = keepWildling(c, wild('driftfin', 4));
    expect(first.upgraded).toBe(false);
    const again = keepWildling(c, wild('driftfin', 9));
    expect(again).toMatchObject({ upgraded: true, fromLevel: 4 });
    expect(c.pets).toHaveLength(1);
    expect(c.pets[0].level).toBe(9);
    // An evolved one counts as the same kind, and a weaker newcomer changes nothing.
    c.pets[0].speciesId = PETS.find((p) => p.id === 'driftfin')!.evolution!.into;
    expect(keepWildling(c, wild('driftfin', 2)).pet.level).toBe(9);
    expect(c.pets).toHaveLength(1);
  });

  it('gives each Wildling its own stat bonuses, and kin that join raise them', () => {
    const c = emptyCollection();
    const first = keepWildling(c, wild('emberkit', 4)).pet;
    const born = petBoost(first);
    for (const k of STAT_KEYS) {
      expect(born[k]).toBeGreaterThanOrEqual(0);
      expect(born[k]).toBeLessThanOrEqual(BOOST_ROLL);
    }
    const out = keepWildling(c, { ...wild('emberkit', 2), seed: 99 });
    const now = petBoost(first);
    for (const k of STAT_KEYS) {
      expect(now[k]).toBe(Math.max(born[k], rollBoost(99)[k]) + BOOST_PER_KIN);
      expect(out.gained?.[k]).toBe(now[k] - born[k]);
    }
    // Stronger stats in battle and the bestiary, never past the cap.
    const plain = statsAt(getSpecies('emberkit').base, 10);
    expect(statsAt(getSpecies('emberkit').base, 10, now).atk).toBeGreaterThanOrEqual(plain.atk);
    for (let i = 0; i < 30; i++) keepWildling(c, { ...wild('emberkit', 1), seed: 1000 + i });
    for (const k of STAT_KEYS) expect(petBoost(first)[k]).toBe(BOOST_MAX);
  });

  it('a follower joining a kind you keep upgrades it instead of adding another', () => {
    const c = emptyCollection();
    keepWildling(c, wild('driftfin', 3));
    const f = startFollowing(c, 'a', wild('driftfin', 8), 0, 0)!;
    const out = followerTrust(c, f.needM, 0);
    expect(out).toMatchObject({ kind: 'joined', upgraded: true, fromLevel: 3 });
    expect(c.pets).toHaveLength(1);
  });

  it('roosting Wildlings gather their realm material, up to a day while away', () => {
    const c = emptyCollection();
    for (const id of ['bramblet', 'driftfin', 'emberkit', 'cragmite']) keepWildling(c, wild(id));
    c.lineup = [c.pets[0].uid];
    c.companionUid = c.pets[0].uid;
    expect(roosting(c).map((p) => p.speciesId)).toEqual(['driftfin', 'emberkit', 'cragmite']);
    expect(gatherRoost(c, 0)).toEqual({});
    const found = gatherRoost(c, 5 * hour);
    expect(Object.values(found).reduce((a, b) => a + (b ?? 0), 0)).toBe(3 * 2);
    // The half-round left over carries on; a week away still only banks a day.
    expect(gatherRoost(c, 6 * hour)).not.toEqual({});
    const week = gatherRoost(c, 6 * hour + 7 * 24 * hour);
    expect(Object.values(week).reduce((a, b) => a + (b ?? 0), 0)).toBe(3 * 12);
  });

  it('folds duplicates from older saves into one, keeping the best of both', () => {
    const c = emptyCollection();
    const low = addPet(c, wild('emberkit', 4));
    const high = addPet(c, wild('emberkit', 9));
    const other = addPet(c, wild('driftfin', 2));
    low.homeRing = true;
    c.companionUid = low.uid;
    c.lineup = [low.uid, high.uid, other.uid];
    const folded = mergeDuplicates(c);
    expect(folded.get(low.uid)).toBe(high.uid);
    expect(c.pets.map((p) => p.uid)).toEqual([high.uid, other.uid]);
    expect(high).toMatchObject({ level: 9, homeRing: true });
    expect(c.companionUid).toBe(high.uid);
    expect(c.lineup).toEqual([high.uid, other.uid]);
    expect(mergeDuplicates(c).size).toBe(0);
  });

  it('Wildlings away on an expedition neither roost nor gather', () => {
    const c = emptyCollection();
    for (const id of ['bramblet', 'driftfin', 'emberkit']) keepWildling(c, wild(id));
    c.lineup = [c.pets[0].uid];
    c.companionUid = c.pets[0].uid;
    const away = new Set([c.pets[1].uid]);
    expect(roosting(c, away).map((p) => p.speciesId)).toEqual(['emberkit']);
    gatherRoost(c, 0, away);
    expect(Object.values(gatherRoost(c, 2 * hour, away)).reduce((a, b) => a + (b ?? 0), 0)).toBe(1);
  });

  it('completing an element makes its Wildlings hit harder', () => {
    const c = emptyCollection();
    keepWildling(c, wild('bramblet'));
    expect(setBonus(c, 'bramblet')).toBe(1);
    const grove = elementSets(c).find((s) => s.element === 'grove')!;
    for (const k of grove.kinds) keepWildling(c, wild(k.id));
    expect(elementSets(c).find((s) => s.element === 'grove')!.complete).toBe(true);
    expect(setBonus(c, 'bramblet')).toBe(1 + SET_BONUS);
    expect(setBonus(c, 'driftfin')).toBe(1);
  });
});
