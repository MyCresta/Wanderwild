import { describe, expect, it } from 'vitest';
import { Battle, fireballDamage, makeFighter, shareXp, type BattleEvent } from '../src/creatures/battle';
import { addPet, emptyCollection, partyPets, togglePartyMember } from '../src/creatures/collection';
import { mulberry32 } from '../src/creatures/rng';
import { getSpecies } from '../src/creatures/species';
import { newSave } from '../src/game/save';
import { GameState, SPELL_CHARGE_MAX_M } from '../src/game/state';

const pet = (id: string, level = 5, seed = 1) => makeFighter(getSpecies(id), level, seed);
const hits = (events: BattleEvent[]) => events.filter((e) => e.kind === 'hit');

describe('party battles', () => {
  it('lands critical hits only from well-timed taps', () => {
    const battle = new Battle([pet('bramblet', 10)], pet('thornmaw', 10), { rng: mulberry32(1) });
    const [perfect] = hits(battle.turn({ kind: 'strike', quality: 1 }));
    const [late] = hits(battle.turn({ kind: 'strike', quality: 0.3 }));
    expect(perfect).toMatchObject({ attacker: 'pet', crit: true });
    expect(late).toMatchObject({ attacker: 'pet', crit: false });
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

  it('casts Fireball for fixed damage and Mending heals everyone standing', () => {
    const a = pet('bramblet');
    const b = pet('emberkit');
    a.hp = 5;
    b.hp = 5;
    const foe = pet('smudgeling', 30);
    foe.atk = 1;
    const battle = new Battle([a, b], foe, { rng: mulberry32(9), wayfarerLevel: 4 });
    const before = foe.hp;
    battle.turn({ kind: 'spell', spell: 'fireball' });
    expect(before - foe.hp).toBe(fireballDamage(4));
    const heal = battle.turn({ kind: 'spell', spell: 'mending' })[0];
    expect(heal).toMatchObject({ kind: 'heal', targets: [0, 1], source: 'mending' });
    expect(b.hp).toBeGreaterThan(5);
  });

  it('shares experience: full for pets that fought, half for the bench', () => {
    const battle = new Battle([pet('bramblet'), pet('emberkit'), pet('driftfin')], pet('smudgeling'));
    battle.turn({ kind: 'swap', to: 2 });
    expect(shareXp(battle, 40)).toEqual([40, 20, 40]);
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
  it('charges spells by walking and spends tonics', () => {
    const game = new GameState(newSave(0));
    game.recordWalk(350, 0);
    expect(game.save.spellChargeM).toBe(350);
    expect(game.spendSpell(300)).toBe(true);
    expect(game.spendSpell(300)).toBe(false);
    game.recordWalk(5000, 0);
    expect(game.save.spellChargeM).toBe(SPELL_CHARGE_MAX_M);
    expect(game.useTonic()).toBe(false);
    game.save.supplies.tonic = 1;
    expect(game.useTonic()).toBe(true);
  });
});
