import { describe, expect, it } from 'vitest';
import { Battle, makeFighter, victoryRewards } from '../src/creatures/battle';
import { addPet, emptyCollection, METRES_PER_SEAL, walkRewards } from '../src/creatures/collection';
import { mulberry32 } from '../src/creatures/rng';
import { spawnsNear } from '../src/game/spawns';
import { ALL_SPECIES, getSpecies, MONSTERS, PETS } from '../src/creatures/species';
import { addXp, catchChance, creatureForSpawn, effectiveness, individualFromSeed, MAX_LEVEL, statsAt, xpToNext } from '../src/creatures/stats';
import { PET_ART } from '../src/creatures/art/pets';
import { MONSTER_ART } from '../src/creatures/art/monsters';

describe('roster', () => {
  it('has unique ids and names, and art for every species', () => {
    expect(new Set(ALL_SPECIES.map((s) => s.id)).size).toBe(ALL_SPECIES.length);
    expect(new Set(ALL_SPECIES.map((s) => s.name)).size).toBe(ALL_SPECIES.length);
    for (const pet of PETS) expect(PET_ART[pet.id]).toBeTypeOf('function');
    for (const monster of MONSTERS) expect(MONSTER_ART[monster.id]).toBeTypeOf('function');
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

describe('catching', () => {
  it('rewards a well-timed cast and stays within bounds', () => {
    expect(catchChance('common', 1, 1)).toBeGreaterThan(catchChance('common', 1, 0));
    expect(catchChance('rare', 30, 0)).toBeGreaterThanOrEqual(0.05);
    expect(catchChance('common', 1, 1)).toBeLessThanOrEqual(0.95);
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
    const lumoth = getSpecies('lumoth');
    const murkwing = getSpecies('murkwing');
    expect(effectiveness(lumoth.element, murkwing)).toBeGreaterThan(1);

    const battle = new Battle([makeFighter(lumoth, 5, 1)], makeFighter(murkwing, 3, 2), { rng: mulberry32(42) });
    for (let i = 0; i < 100 && !battle.winner; i++) battle.turn({ kind: battle.moveReady ? 'move' : 'strike' });
    expect(battle.winner).toBe('pet');
    expect(victoryRewards(battle.foe).xp).toBeGreaterThan(0);
  });
});

describe('walking', () => {
  it('earns seals and companion experience', () => {
    const c = emptyCollection();
    const pet = addPet(c, { species: getSpecies('emberkit'), level: 1, seed: 7 });
    const seals = c.seals;
    walkRewards(c, METRES_PER_SEAL * 2 + 30);
    expect(c.seals).toBe(seals + 2);
    expect(pet.xp + pet.level).toBeGreaterThan(1);
  });
});
