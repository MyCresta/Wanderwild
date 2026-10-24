import { describe, expect, it } from 'vitest';
import { Battle, makeFighter, TONIC_HEAL, victoryRewards } from '../src/creatures/battle';
import { addPet, emptyCollection, fitToFight, healPet, petMaxHp, REST_FULL_MS, setVigor, vigorNow } from '../src/creatures/collection';
import { BOSS_LEVELS, bossLevel, foeScale, rankLabel, rollFoe } from '../src/creatures/foes';
import { mulberry32 } from '../src/creatures/rng';
import { getSpecies, MONSTERS } from '../src/creatures/species';
import { creatureForSpawn } from '../src/creatures/stats';
import { lairsNear, LAIR_WEEK_MS } from '../src/game/lairs';

const pet = (id: string, level = 5, seed = 1) => makeFighter(getSpecies(id), level, seed);

describe('lasting wounds', () => {
  const owned = () => addPet(emptyCollection(), { species: getSpecies('bramblet'), level: 5, seed: 1 });

  it('keeps damage after a fight and rests back to full in an hour', () => {
    const p = owned();
    expect(vigorNow(p)).toBe(1);
    setVigor(p, 0.2, 0);
    expect(vigorNow(p, 0)).toBeCloseTo(0.2);
    expect(vigorNow(p, REST_FULL_MS / 2)).toBeCloseTo(0.7);
    expect(vigorNow(p, REST_FULL_MS)).toBe(1);
    setVigor(p, 1);
    expect(p.vigor).toBeUndefined();
  });

  it('keeps a worn-out pet out of fights until it has rested a little', () => {
    const p = owned();
    setVigor(p, 0, 0);
    expect(fitToFight(p, 0)).toBe(false);
    expect(fitToFight(p, REST_FULL_MS * 0.1)).toBe(true);
  });

  it('heals a set amount with a tonic', () => {
    const p = owned();
    setVigor(p, 0, 0);
    healPet(p, TONIC_HEAL, 0);
    expect(vigorNow(p, 0)).toBeCloseTo(TONIC_HEAL / petMaxHp(p));
  });

  it('starts a battle at stored health and leads with a standing pet', () => {
    const battle = new Battle([pet('bramblet'), pet('emberkit')], pet('smudgeling'), { vigor: [0, 0.5] });
    expect(battle.party[0].hp).toBe(0);
    expect(battle.active).toBe(1);
    expect(battle.pet.hp).toBe(Math.round(battle.pet.maxHp * 0.5));
    expect(battle.vigorLeft()[1]).toBeCloseTo(0.5, 1);
  });

  it('tonics heal a flat amount in battle, scaled by upgrades', () => {
    const a = pet('cragmite', 20);
    const foe = pet('smudgeling', 1);
    foe.atk = 1;
    const battle = new Battle([a], foe, { vigor: [0.1], tonicPower: 2, rng: mulberry32(1) });
    const before = a.hp;
    const heal = battle.turn({ kind: 'tonic' })[0];
    expect(heal).toMatchObject({ kind: 'heal', amount: TONIC_HEAL * 2 });
    expect(a.hp).toBeGreaterThan(before);
  });
});

describe('elite tiers and bosses', () => {
  it('makes each elite tier tougher', () => {
    expect(foeScale('elite', 2).hp).toBeGreaterThan(foeScale('elite', 1).hp);
    expect(foeScale('elite', 3).traits).toBe(3);
    expect(rankLabel('elite', 2)).toBe('♛ Elite II');
    const t1 = makeFighter(MONSTERS[0], 10, 3, undefined, { rank: 'elite', tier: 1 });
    const t3 = makeFighter(MONSTERS[0], 10, 3, undefined, { rank: 'elite', tier: 3 });
    expect(t3.maxHp).toBeGreaterThan(t1.maxHp);
    expect(victoryRewards(t3).xp).toBeGreaterThan(victoryRewards(t1).xp);
  });

  it('gives legendary spawns higher elite tiers and a level bump', () => {
    for (let i = 0; i < 50; i++) expect(rollFoe('legendary', i).tier).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 300; i++) {
      const e = creatureForSpawn({ seed: i * 104729, rarity: 'legendary' }, 5);
      if (e.species.kind === 'monster') expect(e.level).toBeGreaterThanOrEqual(5 - 2 + 4 + 2);
    }
  });

  it('raises bosses to meet a stronger party, never below their tier', () => {
    expect(bossLevel(1, 1)).toBe(5);
    expect(bossLevel(1, 15)).toBe(14);
    expect(bossLevel(5, 15)).toBe(25);
    expect(bossLevel(5, 30)).toBe(33);
    const t = 3 * LAIR_WEEK_MS + 1000;
    for (const { encounter } of lairsNear(52.37, 4.89, t, 15)) expect(encounter.level).toBeGreaterThanOrEqual(14);
    // A boss of the same level grows sturdier as levels climb.
    expect(foeScale('boss', 1, 20).hp).toBeGreaterThan(foeScale('boss', 1, 5).hp);
  });

  it('places the same boss lairs for everyone all week, at their tier level', () => {
    const t = 3 * LAIR_WEEK_MS + 1000;
    const a = lairsNear(52.37, 4.89, t);
    expect(lairsNear(52.37, 4.89, t + 86_400_000)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    for (const { encounter, spawn } of a) {
      expect(encounter.rank).toBe('boss');
      expect(BOSS_LEVELS).toContain(encounter.level);
      expect(encounter.traits).toHaveLength(3);
      expect(spawn.expiresAt).toBe(4 * LAIR_WEEK_MS);
    }
  });

  it('enrages a boss below half health, bringing its big attack sooner', () => {
    const boss = makeFighter(MONSTERS[0], 10, 1, undefined, { rank: 'boss', tier: 2, traits: [] });
    const tank = Object.assign(pet('cragmite', 1), { hp: 1e6, maxHp: 1e6 });
    const battle = new Battle([tank], boss, { rng: mulberry32(2) });
    expect(battle.enraged).toBe(false);
    boss.hp = Math.floor(boss.maxHp / 2) - 1;
    expect(battle.enraged).toBe(true);
    battle.turn({ kind: 'art' });
    expect(battle.intent.big).toBe(true);
  });

  it('pays far more for a boss than an elite of the same level', () => {
    const elite = makeFighter(MONSTERS[1], 10, 1, undefined, { rank: 'elite', tier: 1 });
    const boss = makeFighter(MONSTERS[1], 10, 1, undefined, { rank: 'boss', tier: 1 });
    expect(victoryRewards(boss).xp).toBeGreaterThan(victoryRewards(elite).xp * 2);
    expect(boss.maxHp).toBeGreaterThan(elite.maxHp * 1.5);
  });
});
