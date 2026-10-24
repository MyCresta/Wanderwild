import { describe, expect, it } from 'vitest';
import { bandFull, bandSize, BLOT_TRUST_M, dismissFollower, FOLLOW_MS, followerTrust, releasePet, startFollowing, walkNeeded, WALK_TO_BEFRIEND } from '../src/creatures/befriend';
import { addPet, emptyCollection } from '../src/creatures/collection';
import { getSpecies } from '../src/creatures/species';

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

  it('trusts faster when you drive off Blotspawn, and wanders off if kept waiting', () => {
    const c = emptyCollection();
    startFollowing(c, 'a', wild(), 0, 0);
    followerTrust(c, BLOT_TRUST_M, 10);
    expect(c.follower!.walkedM).toBe(BLOT_TRUST_M);
    expect(followerTrust(c, 10, FOLLOW_MS + 1)).toEqual({ kind: 'left', name: 'Driftfin' });
    expect(c.pets).toHaveLength(0);
  });

  it('a charm shortens the walk, but never below half', () => {
    expect(walkNeeded('common', 0.2)).toBe(Math.round(WALK_TO_BEFRIEND.common * 0.8));
    expect(walkNeeded('rare', 2)).toBe(WALK_TO_BEFRIEND.rare / 2);
  });
});

describe('the band', () => {
  it('starts at 6 and grows with Wayfarer level to 12', () => {
    expect(bandSize(1)).toBe(6);
    expect(bandSize(10)).toBe(8);
    expect(bandSize(99)).toBe(12);
  });

  it('is full at its size, and releasing makes room but keeps the last one', () => {
    const c = emptyCollection();
    for (let i = 0; i < 6; i++) addPet(c, wild());
    expect(bandFull(c, 1)).toBe(true);
    const first = c.pets[0];
    c.companionUid = first.uid;
    c.party = [first.uid];
    expect(releasePet(c, first.uid)).toBe(true);
    expect(c.companionUid).not.toBe(first.uid);
    expect(c.party).toEqual([]);
    expect(bandFull(c, 1)).toBe(false);
    while (c.pets.length > 1) releasePet(c, c.pets[0].uid);
    expect(releasePet(c, c.pets[0].uid)).toBe(false);
  });
});
