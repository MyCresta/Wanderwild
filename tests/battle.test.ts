import { describe, expect, it } from 'vitest';
import { Battle, makeFighter, MOVE_COOLDOWN, shareXp, victoryRewards, type BattleEvent } from '../src/creatures/battle';
import { beatenBy, matchup, STRONG, WEAK, WHEEL } from '../src/creatures/elements';
import { rollFoe } from '../src/creatures/foes';
import { creatureForSpawn } from '../src/creatures/stats';
import { MONSTERS } from '../src/creatures/species';
import { addPet, emptyCollection, partyPets, togglePartyMember } from '../src/creatures/collection';
import { mulberry32 } from '../src/creatures/rng';
import { getSpecies } from '../src/creatures/species';
import { newSave } from '../src/game/save';
import { GameState } from '../src/game/state';
import { heroPower, newHero, type HeroClass } from '../src/game/hero';

const pet = (id: string, level = 5, seed = 1) => makeFighter(getSpecies(id), level, seed);
/** A pet that cannot faint, for watching many turns go by. */
const tank = (id = 'cragmite') => Object.assign(pet(id, 1), { hp: 1e6, maxHp: 1e6 });
const hits = (events: BattleEvent[]) => events.filter((e) => e.kind === 'hit');

describe('party battles', () => {
  it('lands critical element moves only from well-timed taps', () => {
    const battle = new Battle([tank('bramblet')], pet('thornmaw', 30), { rng: mulberry32(1) });
    const [perfect] = hits(battle.turn({ kind: 'move', quality: 1 }));
    battle.turn({ kind: 'strike' });
    battle.turn({ kind: 'strike' });
    const [late] = hits(battle.turn({ kind: 'move', quality: 0.3 }));
    expect(perfect).toMatchObject({ attacker: 'pet', action: 'move', crit: true });
    expect(late).toMatchObject({ attacker: 'pet', action: 'move', crit: false });
  });

  it('swaps pets, and forces a swap when the active one faints', () => {
    const weak = pet('driftfin', 1);
    weak.hp = 1;
    const battle = new Battle([weak, pet('cragmite', 8)], pet('wickwraith', 12), { rng: mulberry32(3) });
    const events = battle.turn({ kind: 'strike', quality: 0.5 });
    expect(events.at(-1)).toEqual({ kind: 'faint', index: 0 });
    expect(battle.mustSwap).toBe(true);
    expect(battle.winner).toBeNull();
    expect(battle.turn({ kind: 'strike' })).toEqual([]);
    expect(battle.turn({ kind: 'swap', to: 1 })).toEqual([{ kind: 'swap', to: 1 }]);
    expect(battle.pet.species.id).toBe('cragmite');
    expect(battle.canSwapTo(0)).toBe(false);
  });

  it('loses only when the whole party is down', () => {
    const a = pet('driftfin', 1);
    a.hp = 1;
    const battle = new Battle([a], pet('wickwraith', 12), { rng: mulberry32(3) });
    battle.turn({ kind: 'strike' });
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
    warden.turn({ kind: 'strike' });
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
    const battle = new Battle([pet('bramblet'), pet('emberkit'), pet('driftfin')], pet('smudgeling'));
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
    const s = hits(strong.turn({ kind: 'move', quality: 0.5 }))[0];
    const w = hits(weak.turn({ kind: 'move', quality: 0.5 }))[0];
    expect(s).toMatchObject({ effectiveness: STRONG });
    expect(s.kind === 'hit' && w.kind === 'hit' && s.damage > w.damage).toBe(true);
  });
});

describe('attacks and foe intents', () => {
  it('puts the element move on cooldown and falls back to Strike', () => {
    const battle = new Battle([pet('driftfin', 10)], pet('murkwing', 30), { rng: mulberry32(2) });
    battle.turn({ kind: 'move', quality: 0.5 });
    expect(battle.ready('move')).toBe(false);
    expect(hits(battle.turn({ kind: 'move' }))[0]).toMatchObject({ action: 'strike' });
    for (let i = 1; i < MOVE_COOLDOWN; i++) battle.turn({ kind: 'strike' });
    expect(battle.ready('move')).toBe(true);
  });

  it('announces the big attack every third turn, every other when Swift', () => {
    const plain = new Battle([tank()], pet('smudgeling', 30), { rng: mulberry32(4) });
    const seen = [plain.intent.big];
    for (let i = 0; i < 5; i++) {
      plain.turn({ kind: 'strike' });
      seen.push(plain.intent.big);
    }
    expect(seen).toEqual([false, false, true, false, false, true]);
    const swift = new Battle([tank()], makeFighter(MONSTERS[0], 30, 1, undefined, { traits: ['swift'] }));
    expect(swift.intent.big).toBe(false);
    swift.turn({ kind: 'strike' });
    expect(swift.intent.big).toBe(true);
  });

  it('dodges with Updraft and soaks with Bulwark', () => {
    const gale = new Battle([pet('wisplume', 5)], pet('thornmaw', 30), { rng: mulberry32(5) });
    expect(gale.turn({ kind: 'art' }).some((e) => e.kind === 'miss')).toBe(true);
    const roll = () => 0.5;
    const bare = new Battle([pet('cragmite', 5)], pet('thornmaw', 20), { rng: roll });
    const walled = new Battle([pet('cragmite', 5)], pet('thornmaw', 20), { rng: roll });
    const open = hits(bare.turn({ kind: 'strike' })).find((e) => e.kind === 'hit' && e.attacker === 'foe')!;
    const shut = hits(walled.turn({ kind: 'art' })).find((e) => e.kind === 'hit' && e.attacker === 'foe')!;
    expect(shut.kind === 'hit' && open.kind === 'hit' && shut.damage < open.damage).toBe(true);
  });

  it('burns with Kindle and crits after Glimmer', () => {
    const ember = new Battle([pet('emberkit', 5)], pet('cragmite', 30), { rng: mulberry32(6) });
    ember.turn({ kind: 'art' });
    expect(ember.turn({ kind: 'strike' }).some((e) => e.kind === 'burn')).toBe(true);
    const lumen = new Battle([pet('lumoth', 5)], pet('cragmite', 30), { rng: mulberry32(6) });
    lumen.turn({ kind: 'art' });
    expect(hits(lumen.turn({ kind: 'strike' }))[0]).toMatchObject({ crit: true });
  });

  it('halves damage while Warded, until struck with its weakness', () => {
    const foe = makeFighter(MONSTERS[2], 30, 1, undefined, { rank: 'rare', traits: ['warded'] }); // Thornmaw, weak to Ember.
    const battle = new Battle([pet('emberkit', 10)], foe, { rng: mulberry32(7) });
    expect(hits(battle.turn({ kind: 'strike' }))[0]).toMatchObject({ warded: true });
    const events = battle.turn({ kind: 'move', quality: 0.5 });
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
  it('is the companion plus up to two chosen pets', () => {
    const c = emptyCollection();
    const enc = (id: string, seed: number) => ({ species: getSpecies(id), level: 1, seed });
    const lead = addPet(c, enc('bramblet', 1));
    const b = addPet(c, enc('emberkit', 2));
    const d = addPet(c, enc('driftfin', 3));
    const e = addPet(c, enc('cragmite', 4));
    expect(partyPets(c).map((p) => p.uid)).toEqual([lead.uid]);
    togglePartyMember(c, b.uid);
    togglePartyMember(c, d.uid);
    togglePartyMember(c, e.uid); // Full: replaces the oldest pick.
    expect(partyPets(c).map((p) => p.uid)).toEqual([lead.uid, d.uid, e.uid]);
    expect(togglePartyMember(c, d.uid)).toBe(false);
    expect(partyPets(c)).toHaveLength(2);
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
