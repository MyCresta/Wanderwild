import { describe, expect, it } from 'vitest';
import { Battle, makeFighter, victoryRewards } from '../src/creatures/battle';
import { mulberry32 } from '../src/creatures/rng';
import { getSpecies } from '../src/creatures/species';
import { addPet, emptyCollection } from '../src/creatures/collection';
import { lineWanted } from '../src/creatures/scarcity';
import { GRADES, RIVAL_DAY_MS, RIVAL_LINE, rivalsNear, unbound } from '../src/game/rivals';

const pet = (id: string, level = 5, seed = 1) => makeFighter(getSpecies(id), level, seed);
const tank = (id = 'cragmite') => Object.assign(pet(id, 30), { hp: 1e6, maxHp: 1e6, atk: 1e4 });

describe('Inkbinder camps', () => {
  const t = 1_800_000_000_000;

  it('are the same for everyone all day, and new the next', () => {
    const a = rivalsNear(51.5, -0.12, t, 8, 3);
    const b = rivalsNear(51.5, -0.12, t + 60_000, 8, 3);
    expect(a.length).toBeGreaterThan(0);
    expect(b.map((c) => c.spawn.id)).toEqual(a.map((c) => c.spawn.id));
    const tomorrow = rivalsNear(51.5, -0.12, t + RIVAL_DAY_MS, 8, 3);
    expect(tomorrow.map((c) => c.spawn.id)).not.toEqual(a.map((c) => c.spawn.id));
  });

  it('field three Taken of three elements, levelled to the party by grade', () => {
    const camps = rivalsNear(48.85, 2.35, t, 10, 4);
    expect(camps.some((c) => c.encounter.rival?.grade === 'arch')).toBe(true);
    expect(camps.some((c) => c.encounter.rival?.grade === 'binder')).toBe(true);
    for (const { encounter } of camps) {
      const rival = encounter.rival!;
      expect(rival.line).toHaveLength(RIVAL_LINE);
      expect(new Set(rival.line.map((e) => e.species.element)).size).toBe(RIVAL_LINE);
      expect(rival.line.every((e) => e.species.id.startsWith('taken-'))).toBe(true);
      expect(rival.line.map((e) => e.level)).toEqual(GRADES[rival.grade].levels.map((d) => 10 + d));
      expect(rival.line.every((e) => e.rank === GRADES[rival.grade].rank)).toBe(true);
      expect(encounter.species.id).toBe(rival.line[0].species.id);
    }
  });

  it('free Taken back into the Wildlings they were', () => {
    expect(unbound('taken-bramblet')?.id).toBe('bramblet');
    expect(unbound('thornmaw')).toBeNull();
  });

  it('only offer a freed Wildling you do not have, or a much stronger one', () => {
    const c = emptyCollection();
    const bramblet = getSpecies('bramblet');
    expect(lineWanted({ species: bramblet, level: 5, seed: 1 }, c)).toBe(true);
    addPet(c, { species: bramblet, level: 5, seed: 2 });
    expect(lineWanted({ species: bramblet, level: 6, seed: 1 }, c)).toBe(false);
    expect(lineWanted({ species: bramblet, level: 8, seed: 1 }, c)).toBe(true);
  });
});

describe('fighting a line of foes', () => {
  it('sends the next foe in when one falls, and wins only after the last', () => {
    const line = ['taken-bramblet', 'taken-emberkit', 'taken-driftfin'].map((id, i) => pet(id, 3, i + 1));
    const battle = new Battle([tank()], line, { rng: mulberry32(2) });
    const seen: number[] = [];
    for (let i = 0; i < 40 && !battle.winner; i++) {
      for (const e of battle.turn({ kind: 'attack', slot: 0, quality: 0.5 })) if (e.kind === 'foe-in') seen.push(e.index);
    }
    expect(seen).toEqual([1, 2]);
    expect(battle.winner).toBe('pet');
    expect(battle.foesLeft).toBe(0);
    expect(line.every((f) => f.hp === 0)).toBe(true);
  });

  it('gives the new foe its own ward and clears the old foe’s burn', () => {
    const first = pet('taken-bramblet', 1, 1);
    const second = makeFighter(getSpecies('taken-cragmite'), 1, 2, undefined, { rank: 'rare', traits: ['warded'] });
    const battle = new Battle([tank('emberkit')], [first, second], { rng: mulberry32(4) });
    battle.burn = 2;
    first.hp = 1;
    const events = battle.turn({ kind: 'attack', slot: 0, quality: 0.5 });
    expect(events.at(-1)).toMatchObject({ kind: 'foe-in', index: 1, hp: { foe: second.maxHp } });
    expect(battle.foe).toBe(second);
    expect(battle.burn).toBe(0);
    expect(battle.wardUp).toBe(true);
    expect(battle.winner).toBeNull();
  });

  it('pays experience for the whole line', () => {
    const line = [pet('taken-bramblet', 4), pet('taken-emberkit', 5), pet('taken-driftfin', 6)];
    expect(victoryRewards(line).xp).toBe(line.reduce((sum, f) => sum + victoryRewards(f).xp, 0));
  });
});
