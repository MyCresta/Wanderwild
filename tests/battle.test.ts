import { describe, expect, it } from 'vitest';
import { Battle, makeFighter, shareXp, victoryRewards, type BattleEvent } from '../src/creatures/battle';
import { beatenBy, matchup, STRONG, WEAK, WHEEL } from '../src/creatures/elements';
import { rollFoe } from '../src/creatures/foes';
import { creatureForSpawn } from '../src/creatures/stats';
import { MONSTERS } from '../src/creatures/species';
import { addPet, emptyCollection, loadCollection, partyLevel, partyPets, setLeader, togglePartyMember } from '../src/creatures/collection';
import { mulberry32 } from '../src/creatures/rng';
import { getSpecies } from '../src/creatures/species';
import { newSave } from '../src/game/save';
import { GameState } from '../src/game/state';
import { heroPower, newHero, type HeroClass } from '../src/game/hero';

const pet = (id: string, level = 5, seed = 1) => makeFighter(getSpecies(id), level, seed);
/** A pet that cannot faint, for watching many turns go by. */
const tank = (id = 'cragmite') => Object.assign(pet(id, 1), { hp: 1e6, maxHp: 1e6 });
const hits = (events: BattleEvent[]) => events.filter((e) => e.kind === 'hit');
/** The party's blow in a turn's events, whoever went first. */
const petHit = (events: BattleEvent[]) => events.find((e) => e.kind === 'hit' && e.attacker === 'pet');
const foeHit = (events: BattleEvent[]) => events.find((e) => e.kind === 'hit' && e.attacker === 'foe');

describe('party battles', () => {
  it('lands critical element moves only from well-timed taps', () => {
    const battle = new Battle([tank('bramblet')], pet('thornmaw', 30), { rng: mulberry32(1) });
    const perfect = petHit(battle.turn({ kind: 'attack', slot: 1, quality: 1 }));
    battle.turn({ kind: 'attack', slot: 0 });
    battle.turn({ kind: 'attack', slot: 0 });
    const late = petHit(battle.turn({ kind: 'attack', slot: 1, quality: 0.3 }));
    expect(perfect).toMatchObject({ name: 'Thistle Volley', element: 'grove', crit: true });
    expect(late).toMatchObject({ name: 'Thistle Volley', crit: false });
  });

  it('swaps pets, and forces a swap when the active one faints', () => {
    const weak = pet('driftfin', 1);
    weak.hp = 1;
    const battle = new Battle([weak, pet('cragmite', 8)], pet('wickwraith', 12), { rng: mulberry32(3) });
    const events = battle.turn({ kind: 'attack', slot: 0, quality: 0.5 });
    expect(events.at(-1)).toEqual({ kind: 'faint', index: 0 });
    expect(battle.mustSwap).toBe(true);
    expect(battle.winner).toBeNull();
    expect(battle.turn({ kind: 'attack', slot: 0 })).toEqual([]);
    expect(battle.turn({ kind: 'swap', to: 1 })).toEqual([{ kind: 'swap', to: 1 }]);
    expect(battle.pet.species.id).toBe('cragmite');
    expect(battle.canSwapTo(0)).toBe(false);
  });

  it('loses only when the whole party is down', () => {
    const a = pet('driftfin', 1);
    a.hp = 1;
    const battle = new Battle([a], pet('wickwraith', 12), { rng: mulberry32(3) });
    battle.turn({ kind: 'attack', slot: 0 });
    expect(battle.winner).toBe('foe');
  });

  it('lets the hero cast one free spell a turn before the pet acts', () => {
    const hero = (cls: HeroClass, level = 12) => heroPower({ ...newHero(), cls }, level);
    const a = pet('bramblet');
    const b = pet('emberkit');
    a.hp = 5;
    b.hp = 5;
    const foe = pet('smudgeling', 30);
    foe.atk = 1;
    const warden = new Battle([a, b], foe, { rng: mulberry32(9), hero: hero('warden') });
    const [mend] = warden.castSpell('mending');
    expect(mend).toMatchObject({ kind: 'spell', spell: 'mending', targets: [0, 1] });
    expect(b.hp).toBeGreaterThan(5);
    // One spell per turn, and casting did not hand the foe a turn.
    expect(warden.canCast('secondWind')).toBe(false);
    warden.turn({ kind: 'attack', slot: 0 });
    expect(warden.castSpell('secondWind')).toHaveLength(1);
    expect(warden.pet.hp).toBe(warden.pet.maxHp);
    // Spells the hero's class does not teach are not offered.
    expect(warden.canCast('starfall')).toBe(false);

    const tough = pet('smudgeling', 30);
    const arcanist = new Battle([pet('bramblet')], tough, { rng: mulberry32(9), hero: hero('arcanist', 4) });
    const before = tough.hp;
    arcanist.castSpell('wheelbolt');
    expect(before - tough.hp).toBe(arcanist.spellDamage('wheelbolt'));
    // Wheelbolt always lands on the weakness, so it outhits a plain strike from the same pet.
    expect(arcanist.spellDamage('wheelbolt')).toBeGreaterThan(arcanist.spellDamage('starfall') / 2);
  });

  it('boosts the party with the hero\'s stats', () => {
    const plain = new Battle([pet('bramblet')], pet('smudgeling'));
    const led = new Battle([pet('bramblet')], pet('smudgeling'), { hero: heroPower({ ...newHero(), cls: 'beastcaller' }, 30) });
    expect(led.pet.atk).toBeGreaterThan(plain.pet.atk);
    expect(led.pet.maxHp).toBeGreaterThanOrEqual(plain.pet.maxHp);
  });

  it('shares experience: full for pets that fought, half for the bench', () => {
    const battle = new Battle([tank('bramblet'), pet('emberkit'), pet('driftfin')], pet('smudgeling'));
    battle.turn({ kind: 'attack', slot: 0 });
    battle.turn({ kind: 'swap', to: 2 });
    expect(shareXp(battle, 40)).toEqual([40, 20, 40]);
  });
});

describe('the Elemental Wheel', () => {
  it('gives every element one it beats and one it loses to', () => {
    for (const e of WHEEL) {
      const row = WHEEL.map((d) => matchup(e, d));
      expect(row.filter((m) => m === STRONG)).toHaveLength(1);
      expect(row.filter((m) => m === WEAK)).toHaveLength(1);
    }
    expect(matchup('ember', 'grove')).toBe(STRONG);
    expect(matchup('grove', 'ember')).toBe(WEAK);
    expect(matchup('ember', 'stone')).toBe(1);
  });

  it('agrees with every Blotspawn weakness', () => {
    for (const m of MONSTERS) expect(m.weakTo).toBe(beatenBy(m.element));
  });

  it('makes strong element moves hit harder than weak ones', () => {
    const roll = () => 0.5;
    const strong = new Battle([pet('emberkit', 10)], pet('thornmaw', 30), { rng: roll });
    const weak = new Battle([pet('bramblet', 10)], pet('thornmaw', 30), { rng: roll });
    const s = petHit(strong.turn({ kind: 'attack', slot: 1, quality: 0.5 }))!;
    const w = petHit(weak.turn({ kind: 'attack', slot: 1, quality: 0.5 }))!;
    expect(s).toMatchObject({ effectiveness: STRONG });
    expect(s.kind === 'hit' && w.kind === 'hit' && s.damage > w.damage).toBe(true);
  });
});

describe('attacks and foe intents', () => {
  it('rests a move after use, and Strike-like moves never rest', () => {
    const battle = new Battle([pet('driftfin', 10)], pet('murkwing', 30), { rng: mulberry32(2) });
    battle.turn({ kind: 'attack', slot: 1, quality: 0.5 });
    expect(battle.ready(1)).toBe(false);
    expect(battle.turn({ kind: 'attack', slot: 1 })).toEqual([]);
    battle.turn({ kind: 'attack', slot: 0 });
    expect(battle.ready(1)).toBe(false);
    battle.turn({ kind: 'attack', slot: 0 });
    expect(battle.ready(1)).toBe(true);
    expect(battle.ready(0)).toBe(true);
  });

  it('announces the big attack every third turn, every other when Swift', () => {
    const plain = new Battle([tank()], pet('smudgeling', 30), { rng: mulberry32(4) });
    const seen = [plain.intent.big];
    for (let i = 0; i < 5; i++) {
      plain.turn({ kind: 'attack', slot: 0 });
      seen.push(plain.intent.big);
    }
    expect(seen).toEqual([false, false, true, false, false, true]);
    const swift = new Battle([tank()], makeFighter(MONSTERS[0], 30, 1, undefined, { traits: ['swift'] }));
    expect(swift.intent.big).toBe(false);
    swift.turn({ kind: 'attack', slot: 0 });
    expect(swift.intent.big).toBe(true);
  });

  it('dodges with Updraft and soaks with Bulwark', () => {
    const gale = new Battle([pet('wisplume', 5)], pet('thornmaw', 30), { rng: mulberry32(5) });
    const first = gale.turn({ kind: 'attack', slot: 2, quality: 0.5 });
    const next = gale.turn({ kind: 'attack', slot: 0, quality: 0.5 });
    expect([...first, ...next].some((e) => e.kind === 'miss')).toBe(true);
    const roll = () => 0.5;
    const bare = new Battle([pet('cragmite', 5)], pet('thornmaw', 20), { rng: roll });
    const walled = new Battle([pet('cragmite', 5)], pet('thornmaw', 20), { rng: roll });
    bare.turn({ kind: 'attack', slot: 0 });
    walled.turn({ kind: 'attack', slot: 2 });
    const open = foeHit(bare.turn({ kind: 'attack', slot: 0 }))!;
    const shut = foeHit(walled.turn({ kind: 'attack', slot: 0 }))!;
    expect(shut.kind === 'hit' && open.kind === 'hit' && shut.damage < open.damage).toBe(true);
  });

  it('burns with Kindle and crits after Glimmer', () => {
    const ember = new Battle([pet('emberkit', 5)], pet('cragmite', 30), { rng: mulberry32(6) });
    expect(ember.turn({ kind: 'attack', slot: 2 }).some((e) => e.kind === 'burn')).toBe(true);
    const lumen = new Battle([pet('glimhare', 5)], pet('cragmite', 30), { rng: mulberry32(6) });
    lumen.turn({ kind: 'attack', slot: 2 });
    expect(petHit(lumen.turn({ kind: 'attack', slot: 0, quality: 0 }))).toMatchObject({ crit: true });
  });

  it('heals with draining moves', () => {
    const kit = pet('emberkit', 10);
    kit.hp = 5;
    const battle = new Battle([kit], pet('cragmite', 1), { rng: () => 0.5 });
    expect(battle.turn({ kind: 'attack', slot: 0 }).some((e) => e.kind === 'heal' && e.source === 'drain')).toBe(true);
  });

  it('halves damage while Warded, until struck with its weakness', () => {
    const foe = makeFighter(MONSTERS[2], 30, 1, undefined, { rank: 'rare', traits: ['warded'] }); // Thornmaw, weak to Ember.
    const battle = new Battle([pet('emberkit', 10)], foe, { rng: mulberry32(7) });
    expect(petHit(battle.turn({ kind: 'attack', slot: 0 }))).toMatchObject({ warded: true });
    const events = battle.turn({ kind: 'attack', slot: 1, quality: 0.5 });
    expect(events.some((e) => e.kind === 'status' && e.status === 'ward-break')).toBe(true);
    expect(battle.wardUp).toBe(false);
  });
});

describe('rare and elite Blotspawn', () => {
  it('are tougher and pay out more', () => {
    const plain = makeFighter(MONSTERS[0], 10, 3);
    const elite = makeFighter(MONSTERS[0], 10, 3, undefined, { rank: 'elite', traits: [] });
    expect(elite.maxHp).toBeGreaterThan(plain.maxHp * 1.5);
    expect(victoryRewards(elite).xp).toBeGreaterThan(victoryRewards(plain).xp * 2);
  });

  it('come from rarer spawns, with one quirk for Rare and two for Elite', () => {
    expect(rollFoe('legendary', 1)).toMatchObject({ rank: 'elite' });
    expect(rollFoe('epic', 2).traits).toHaveLength(2);
    expect(rollFoe('rare', 3)).toMatchObject({ rank: 'rare' });
    expect(rollFoe('rare', 3).traits).toHaveLength(1);
    const ranks = Array.from({ length: 2000 }, (_, i) => rollFoe('common', i * 7919).rank);
    const share = ranks.filter((r) => r !== 'normal').length / ranks.length;
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.2);
  });

  it('are decided by the spawn, and only for Blotspawn', () => {
    for (let i = 0; i < 200; i++) {
      const spawn = { seed: i * 104729, rarity: 'epic' as const };
      const a = creatureForSpawn(spawn, 5);
      expect(creatureForSpawn(spawn, 5)).toEqual(a);
      if (a.species.kind === 'monster') expect(a.rank).toBe('elite');
      else expect(a.rank).toBeUndefined();
    }
  });
});

describe('the party', () => {
  const enc = (id: string, seed: number, level = 1) => ({ species: getSpecies(id), level, seed });

  it('is any three Wildlings in the order chosen, companion or not', () => {
    const c = emptyCollection();
    const a = addPet(c, enc('bramblet', 1));
    const b = addPet(c, enc('emberkit', 2));
    const d = addPet(c, enc('driftfin', 3));
    const e = addPet(c, enc('cragmite', 4));
    // New friends join while there is room.
    expect(partyPets(c).map((p) => p.uid)).toEqual([a.uid, b.uid, d.uid]);
    expect(togglePartyMember(c, e.uid)).toBe(false); // Full.
    expect(togglePartyMember(c, a.uid)).toBe(false); // The companion can step out.
    expect(togglePartyMember(c, e.uid)).toBe(true);
    expect(partyPets(c).map((p) => p.uid)).toEqual([b.uid, d.uid, e.uid]);
    expect(c.companionUid).toBe(a.uid);
    setLeader(c, e.uid);
    expect(partyPets(c).map((p) => p.uid)).toEqual([e.uid, b.uid, d.uid]);
    // Leading with someone outside a full party bumps the last one.
    setLeader(c, a.uid);
    expect(partyPets(c).map((p) => p.uid)).toEqual([a.uid, e.uid, b.uid]);
  });

  it('never empties', () => {
    const c = emptyCollection();
    const a = addPet(c, enc('bramblet', 1));
    expect(togglePartyMember(c, a.uid)).toBe(true);
    expect(partyPets(c)).toHaveLength(1);
  });

  it('keeps the old companion-first party when loading an older save', () => {
    const c = emptyCollection();
    const a = addPet(c, enc('bramblet', 1));
    const b = addPet(c, enc('emberkit', 2));
    const d = addPet(c, enc('driftfin', 3));
    const { lineup: _lineup, ...old } = { ...c, party: [d.uid], companionUid: b.uid };
    const loaded = loadCollection({ getItem: () => JSON.stringify(old) });
    expect(partyPets(loaded).map((p) => p.uid)).toEqual([b.uid, d.uid]);
    expect(a.uid).toBeTruthy();
  });

  it('averages its level for the foes it meets', () => {
    const c = emptyCollection();
    addPet(c, enc('bramblet', 1, 4));
    addPet(c, enc('emberkit', 2, 10));
    expect(partyLevel(c)).toBe(7);
  });
});

describe('choosing who opens', () => {
  it('lets the first swap go free, then swaps cost a turn', () => {
    const party = [makeFighter(getSpecies('bramblet'), 10, 1), makeFighter(getSpecies('emberkit'), 10, 2)];
    const foe = makeFighter(MONSTERS[0], 10, 3);
    const battle = new Battle(party, foe, { rng: () => 0.5 });
    expect(battle.freeSwap).toBe(true);
    const opening = battle.turn({ kind: 'swap', to: 1 });
    expect(opening.map((e) => e.kind)).toEqual(['swap']);
    expect(battle.active).toBe(1);
    expect(battle.fought.has(0)).toBe(false);
    expect(battle.freeSwap).toBe(true);
    battle.turn({ kind: 'attack', slot: 0 });
    expect(battle.freeSwap).toBe(false);
    const hpBefore = battle.party[0].hp;
    const later = battle.turn({ kind: 'swap', to: 0 });
    expect(later.length).toBeGreaterThan(1);
    expect(battle.party[0].hp).toBeLessThan(hpBefore);
  });
});

describe('wayfarer support in battle', () => {
  it('fills mana by walking, up to a cap, and spends tonics', () => {
    const game = new GameState(newSave(0));
    game.chooseClass('arcanist');
    game.recordWalk(350, 0);
    expect(game.mana).toBe(14);
    expect(game.spendMana('wheelbolt')).toBe(true);
    expect(game.mana).toBe(8);
    expect(game.spendMana('starfall')).toBe(false);
    game.recordWalk(5000, 0);
    expect(game.mana).toBe(game.maxMana);
    expect(game.useTonic()).toBe(false);
    game.save.supplies.tonic = 1;
    expect(game.useTonic()).toBe(true);
  });
});

describe('speed', () => {
  it('lets the faster side attack first, with ties to the party', () => {
    const quick = new Battle([pet('kitewisp', 10)], pet('cragmite', 10), { rng: () => 0.5 });
    expect(quick.petFirst).toBe(true);
    expect(hits(quick.turn({ kind: 'attack', slot: 0 }))[0]).toMatchObject({ attacker: 'pet' });
    const slow = new Battle([pet('cragmite', 10)], pet('kitewisp', 10), { rng: () => 0.5 });
    expect(slow.petFirst).toBe(false);
    expect(hits(slow.turn({ kind: 'attack', slot: 0 }))[0]).toMatchObject({ attacker: 'foe' });
    const a = pet('bramblet', 10);
    const b = pet('bramblet', 10);
    expect(new Battle([a], b).petFirst).toBe(true);
  });

  it('still lets swaps and tonics go before a faster foe', () => {
    const battle = new Battle([pet('cragmite', 10), pet('shellop', 10)], pet('kitewisp', 10), { rng: () => 0.5 });
    battle.turn({ kind: 'attack', slot: 0 });
    expect(battle.turn({ kind: 'swap', to: 1 })[0]).toMatchObject({ kind: 'swap' });
  });

  it('loses the turn when felled before acting', () => {
    const weak = pet('cragmite', 1);
    weak.hp = 1;
    const battle = new Battle([weak, pet('cragmite', 10)], pet('kitewisp', 20), { rng: () => 0.5 });
    const events = battle.turn({ kind: 'attack', slot: 1, quality: 1 });
    expect(events.map((e) => e.kind)).toEqual(['hit', 'faint']);
    expect(battle.mustSwap).toBe(true);
  });

  it('grows with level, so a stronger Wildling outpaces its younger self', () => {
    expect(pet('cragmite', 20).spd).toBeGreaterThan(pet('cragmite', 5).spd);
  });
});
