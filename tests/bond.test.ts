import { describe, expect, it, vi } from 'vitest';
import { Battle, makeFighter } from '../src/creatures/battle';
import { BOND_METRES, BOND_MOVES, bondMoveFor, bondStatus, learnedBond, walkBond } from '../src/creatures/bond';
import { addPet, emptyCollection } from '../src/creatures/collection';
import { getMove } from '../src/creatures/moves';
import { getSpecies, MONSTERS, PETS } from '../src/creatures/species';
import { newSave } from '../src/game/save';
import { GameState } from '../src/game/state';
import { MS_PER_MANA } from '../src/game/hero';

describe('bond moves', () => {
  it('gives every line its own bond move in its own element, kept after evolving', () => {
    const ids = new Set<string>();
    for (const pet of PETS) {
      const move = getMove(BOND_MOVES[pet.id]);
      expect(move.element).toBe(pet.element);
      expect(move.power).toBeGreaterThan(0);
      expect(pet.moves).not.toContain(move.id);
      ids.add(move.id);
      if (pet.evolution) expect(bondMoveFor(pet.evolution.into)).toBe(move);
    }
    expect(ids.size).toBe(PETS.length);
  });

  it('is learned after walking far enough together as companion', () => {
    const c = emptyCollection();
    const pet = addPet(c, { species: getSpecies('bramblet'), level: 5, seed: 1 });
    expect(learnedBond(pet)).toBeNull();
    expect(walkBond(c, BOND_METRES - 1)).toBeNull();
    expect(bondStatus(pet)!.learned).toBe(false);
    expect(walkBond(c, 5)).toBe(pet);
    expect(learnedBond(pet)?.id).toBe('briarheart');
    // Once learned, more walking teaches nothing new.
    expect(walkBond(c, 1000)).toBeNull();
    expect(pet.bondM).toBe(BOND_METRES);
  });

  it('fights as a fourth move once learned', () => {
    const pet = makeFighter(getSpecies('emberkit'), 10, 1, 'a');
    pet.bond = getMove('hearthblaze');
    const foe = makeFighter(MONSTERS[0], 10, 2);
    const battle = new Battle([pet], foe, { rng: () => 0.5 });
    battle.open();
    expect(battle.moves).toHaveLength(4);
    expect(battle.ready(3)).toBe(true);
    const events = battle.turn({ kind: 'attack', slot: 3, quality: 0.5 });
    expect(events.some((e) => e.kind === 'hit' && e.name === 'Hearthblaze')).toBe(true);
    expect(battle.burn).toBeGreaterThan(0);
    expect(battle.ready(3)).toBe(false);
  });

  it('leaves Wildlings without a bond at three moves', () => {
    const battle = new Battle([makeFighter(getSpecies('emberkit'), 10, 1, 'a')], makeFighter(MONSTERS[0], 10, 2));
    expect(battle.moves).toHaveLength(3);
    expect(battle.ready(3)).toBe(false);
  });
});

describe('mana', () => {
  it('fills slowly on its own, and faster by walking', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const game = new GameState(newSave(0));
      game.save.hero.mana = 0;
      expect(game.mana).toBe(0);
      vi.setSystemTime(1_000_000 + 3 * MS_PER_MANA);
      expect(game.mana).toBe(3);
      game.recordWalk(100);
      expect(game.mana).toBe(7);
      // Waiting never fills past the cap.
      vi.setSystemTime(1_000_000 + 1000 * MS_PER_MANA);
      expect(game.mana).toBe(game.maxMana);
    } finally {
      vi.useRealTimers();
    }
  });
});
