import { describe, expect, it } from 'vitest';
import { addPet, emptyCollection } from '../src/creatures/collection';
import { STRONGER_BY, WILDLING_SHARE, wildlingWanted } from '../src/creatures/scarcity';
import { getSpecies } from '../src/creatures/species';

const empty = emptyCollection;
const bramblet = (level: number) => ({ species: getSpecies('bramblet'), level, seed: 1 });

describe('wild Wildlings are scarce', () => {
  it('only a share of spawns show', () => {
    const c = empty();
    let shown = 0;
    for (let i = 0; i < 2000; i++) if (wildlingWanted(`cell${i}`, bramblet(3), c)) shown++;
    expect(shown / 2000).toBeGreaterThan(WILDLING_SHARE - 0.04);
    expect(shown / 2000).toBeLessThan(WILDLING_SHARE + 0.04);
  });

  it('skips kinds you already keep unless clearly stronger, counting evolved forms', () => {
    const c = empty();
    const id = Array.from({ length: 200 }, (_, i) => `s${i}`).find((s) => wildlingWanted(s, bramblet(3), c))!;
    const pet = addPet(c, bramblet(5));
    expect(wildlingWanted(id, bramblet(5 + STRONGER_BY - 1), c)).toBe(false);
    expect(wildlingWanted(id, bramblet(5 + STRONGER_BY), c)).toBe(true);
    pet.speciesId = 'thornwarden';
    expect(wildlingWanted(id, bramblet(6), c)).toBe(false);
  });

  it('never hides Blotspawn', () => {
    expect(wildlingWanted('x', { species: getSpecies('smudgeling'), level: 3, seed: 1 }, empty())).toBe(true);
  });
});
