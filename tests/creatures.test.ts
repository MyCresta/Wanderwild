import { describe, expect, it } from 'vitest';
import { Battle, makeFighter, victoryRewards } from '../src/creatures/battle';
import { addPet, emptyCollection, walkRewards } from '../src/creatures/collection';
import { mulberry32 } from '../src/creatures/rng';
import { spawnsNear } from '../src/game/spawns';
import { ALL_SPECIES, getSpecies, MONSTERS, PETS } from '../src/creatures/species';
import { addXp, creatureForSpawn, effectiveness, individualFromSeed, MAX_LEVEL, statsAt, xpToNext } from '../src/creatures/stats';
import { PET_ART } from '../src/creatures/art/pets';
import { WILDLING2_ART } from '../src/creatures/art/wildlings2';
import { WILDLING3_ART } from '../src/creatures/art/wildlings3';
import { MONSTER_ART } from '../src/creatures/art/monsters';

describe('roster', () => {
  it('has unique ids and names, and art for every species', () => {
    expect(new Set(ALL_SPECIES.map((s) => s.id)).size).toBe(ALL_SPECIES.length);
    expect(new Set(ALL_SPECIES.map((s) => s.name)).size).toBe(ALL_SPECIES.length);
    for (const pet of PETS) expect(PET_ART[pet.id] ?? WILDLING2_ART[pet.id] ?? WILDLING3_ART[pet.id]).toBeTypeOf('function');
    for (const monster of MONSTERS) expect(MONSTER_ART[monster.id]).toBeTypeOf('function');
  });

  it('has at least two Wildlings of every element, and a Taken foe for each', async () => {
    const { ELEMENTS, TAKEN } = await import('../src/creatures/species');
    const { beatenBy } = await import('../src/creatures/elements');
    for (const element of Object.keys(ELEMENTS)) expect(PETS.filter((p) => p.element === element).length).toBeGreaterThanOrEqual(2);
    expect(TAKEN).toHaveLength(PETS.length);
    for (const t of TAKEN) {
      expect(getSpecies(t.id).kind).toBe('monster');
      expect(t.weakTo).toBe(beatenBy(t.element));
    }
  });

  it('turns up Taken foes in the wild, but less often than each old Blotspawn', () => {
    let taken = 0;
    let foes = 0;
    for (let i = 0; i < 4000; i++) {
      const e = creatureForSpawn({ seed: i * 7919 + 13, rarity: 'common' }, 10);
      if (e.species.kind !== 'monster') continue;
      foes++;
      if (e.species.id.startsWith('taken-')) taken++;
    }
    expect(taken / foes).toBeGreaterThan(0.2);
    expect(taken / foes).toBeLessThan(0.6);
  });
});

describe('levelling', () => {
  it('carries leftover experience across several levels', () => {
    const pet = { level: 1, xp: 0 };
    const gained = addXp(pet, xpToNext(1) + xpToNext(2) + 5);
    expect(gained).toBe(2);
    expect(pet).toEqual({ level: 3, xp: 5 });
  });

  it('stops at the level cap', () => {
    const pet = { level: MAX_LEVEL - 1, xp: 0 };
    addXp(pet, 1e9);
    expect(pet).toEqual({ level: MAX_LEVEL, xp: 0 });
  });

  it('grows stats with level', () => {
    const { base } = getSpecies('bramblet');
    const trait = individualFromSeed(1, 'pet').trait;
    const low = statsAt(base, 1, trait);
    const high = statsAt(base, 10, trait);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.atk).toBeGreaterThan(low.atk);
  });
});

describe('spawns', () => {
  const t = Date.UTC(2026, 9, 23, 12, 0);

  it('are the same for the same place and time window', () => {
    expect(spawnsNear(55.95, -3.19, t)).toEqual(spawnsNear(55.95, -3.19, t + 60_000));
    expect(spawnsNear(55.95, -3.19, t)).not.toEqual(spawnsNear(55.95, -3.19, t + 20 * 60_000));
  });

  it('always put the same creature on the same spawn', () => {
    for (const spawn of spawnsNear(55.95, -3.19, t)) {
      const a = creatureForSpawn(spawn, 5);
      const b = creatureForSpawn(spawn, 5);
      expect(a.species.id).toBe(b.species.id);
      expect(a.seed).toBe(b.seed);
      expect(a.level).toBeGreaterThanOrEqual(1);
    }
  });

  it('favours monsters in the barrows', () => {
    const count = (realm?: 'barrows') =>
      Array.from({ length: 2000 }, (_, i) => creatureForSpawn({ seed: i * 7919, rarity: 'common', realm }, 3)).filter(
        (e) => e.species.kind === 'monster',
      ).length;
    expect(count('barrows')).toBeGreaterThan(count() * 1.5);
  });
});

describe('battle', () => {
  it('ends with a winner and the weakness hits harder', () => {
    const cragmite = getSpecies('cragmite');
    const murkwing = getSpecies('murkwing');
    expect(effectiveness(cragmite.element, murkwing)).toBeGreaterThan(1);

    const battle = new Battle([makeFighter(cragmite, 5, 1)], makeFighter(murkwing, 3, 2), { rng: mulberry32(42) });
    for (let i = 0; i < 100 && !battle.winner; i++) battle.turn({ kind: 'attack', slot: battle.ready(1) ? 1 : 0 });
    expect(battle.winner).toBe('pet');
    expect(victoryRewards(battle.foe).xp).toBeGreaterThan(0);
  });
});

describe('walking', () => {
  it('earns companion experience', () => {
    const c = emptyCollection();
    const pet = addPet(c, { species: getSpecies('emberkit'), level: 1, seed: 7 });
    walkRewards(c, 230);
    expect(pet.xp + pet.level).toBeGreaterThan(1);
  });
});

describe('evolution', () => {
  it('has art and a home realm for every evolving form', async () => {
    const { EVOLVED_ART } = await import('../src/creatures/art/evolved');
    const { EVOLVED2_ART } = await import('../src/creatures/art/evolved2');
    const { WILDLING3_ART } = await import('../src/creatures/art/wildlings3');
    const { EVOLVED } = await import('../src/creatures/species');
    for (const pet of PETS) {
      expect(pet.evolution).toBeDefined();
      expect(EVOLVED.some((e) => e.id === pet.evolution!.into)).toBe(true);
    }
    for (const e of EVOLVED) expect(EVOLVED_ART[e.id] ?? EVOLVED2_ART[e.id] ?? WILDLING3_ART[e.id]).toBeTypeOf('function');
  });

  it('needs the level, the walk and a Ring in the home realm, then keeps level and seed', async () => {
    const { evolve, evolutionStatus, ringInRealm, walkInRealm } = await import('../src/creatures/evolution');
    const c = emptyCollection();
    const pet = addPet(c, { species: getSpecies('bramblet'), level: 9, seed: 5 });
    expect(walkInRealm(c, 5000, 'tidemere')).toBeNull();
    expect(evolutionStatus(pet)!.walked).toBe(0);
    expect(walkInRealm(c, 5000, 'wildwood')).toBeNull(); // walked enough, but only level 9
    expect(evolve(c, pet)).toBeNull();
    pet.level = 10;
    expect(evolutionStatus(pet)!.ready).toBe(false); // still needs a Ring at home
    expect(ringInRealm(c, 'tidemere')).toBeNull();
    expect(ringInRealm(c, 'wildwood')).toEqual({ pet, ready: true });
    expect(ringInRealm(c, 'wildwood')).toBeNull(); // only counts once
    expect(evolutionStatus(pet)!.ready).toBe(true);
    expect(evolve(c, pet)!.id).toBe('thornwarden');
    expect(pet).toMatchObject({ speciesId: 'thornwarden', level: 10, seed: 5 });
    expect(pet.homeRing).toBeUndefined();
    expect(c.seen).toContain('thornwarden');
    expect(evolutionStatus(pet)).toBeNull();
  });

  it('never spawns evolved forms in the wild', () => {
    for (let i = 0; i < 500; i++) {
      const e = creatureForSpawn({ seed: i * 31337, rarity: 'rare' }, 20);
      expect(e.species.kind === 'pet' ? e.species.stage : 1).toBe(1);
    }
  });
});

describe('moves and temperaments', () => {
  it('gives every Wildling three known moves: one usable every turn, one of its own element', async () => {
    const { EVOLVED } = await import('../src/creatures/species');
    const { getMove } = await import('../src/creatures/moves');
    for (const s of [...PETS, ...EVOLVED]) {
      const moves = s.moves.map(getMove);
      expect(new Set(s.moves).size).toBe(3);
      expect(moves.some((m) => m.wait === 0 && m.power > 0)).toBe(true);
      expect(moves.some((m) => m.element === s.element && m.power > 0)).toBe(true);
    }
  });

  it('shares moves between kinds, and not every Wildling knows Strike', async () => {
    const { EVOLVED } = await import('../src/creatures/species');
    const all = [...PETS, ...EVOLVED];
    const uses = new Map<string, number>();
    for (const s of all) for (const id of s.moves) uses.set(id, (uses.get(id) ?? 0) + 1);
    expect([...uses.values()].filter((n) => n > 1).length).toBeGreaterThan(8);
    const strikers = all.filter((s) => s.moves.includes('strike')).length;
    expect(strikers).toBeGreaterThan(0);
    expect(strikers).toBeLessThan(all.length / 2);
  });

  it('shows power as one to five pips', async () => {
    const { getMove, powerPips } = await import('../src/creatures/moves');
    expect(powerPips(getMove('strike'))).toBe(2);
    expect(powerPips(getMove('thistle-volley'))).toBe(4);
    expect(powerPips(getMove('rampart-slam'))).toBe(5);
    expect(powerPips(getMove('wellspring'))).toBe(0);
  });

  it('makes every temperament a trade-off, so none is simply best', async () => {
    const { TRAITS } = await import('../src/creatures/stats');
    for (const t of TRAITS) {
      const stats = [t.hp, t.atk, t.def, t.spd];
      if (t.xp > 1) expect(stats.every((k) => k === 1)).toBe(true);
      else {
        expect(stats.some((k) => k > 1)).toBe(true);
        expect(stats.some((k) => k < 1)).toBe(true);
      }
    }
  });
});
