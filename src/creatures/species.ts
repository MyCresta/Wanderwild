/**
 * The Inkbound Bestiary. Long ago a cartographer drew wild things in the margins of the
 * realm's maps; now the maps are being walked again and the margins have come loose.
 * Wildlings are the kindly ones, each born of a kind of land. Blotspawn are spilled ink
 * gone sour: they cannot be bound, only driven back.
 */

export type Element = 'grove' | 'tide' | 'ember' | 'stone' | 'gale' | 'lumen';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
}

interface SpeciesBase {
  id: string;
  name: string;
  epithet: string;
  lore: string;
  element: Element;
  rarity: Rarity;
  base: BaseStats;
  /** The element move this creature uses in battle. */
  move: string;
}

export interface PetSpecies extends SpeciesBase {
  kind: 'pet';
}

export interface MonsterSpecies extends SpeciesBase {
  kind: 'monster';
  /** Element moves of this kind hit for extra damage. */
  weakTo: Element;
}

export type Species = PetSpecies | MonsterSpecies;

export const ELEMENTS: Record<Element, { name: string; color: string; glyph: string }> = {
  grove: { name: 'Grove', color: '#5f7d3a', glyph: '❦' },
  tide: { name: 'Tide', color: '#3f7a86', glyph: '≈' },
  ember: { name: 'Ember', color: '#b8552a', glyph: '✹' },
  stone: { name: 'Stone', color: '#7a6a58', glyph: '◆' },
  gale: { name: 'Gale', color: '#6f8fa8', glyph: '❂' },
  lumen: { name: 'Lumen', color: '#b8902a', glyph: '✦' },
};

export const PETS: readonly PetSpecies[] = [
  {
    kind: 'pet',
    id: 'bramblet',
    name: 'Bramblet',
    epithet: 'the Hedge-Wanderer',
    lore: 'Curls up under hedgerows and wakes with a new leaf for every path walked past it. Its spines are soft unless you are a slug.',
    element: 'grove',
    rarity: 'common',
    base: { hp: 46, atk: 11, def: 13 },
    move: 'Thistle Volley',
  },
  {
    kind: 'pet',
    id: 'driftfin',
    name: 'Driftfin',
    epithet: 'the Mist-Swimmer',
    lore: 'Swims through morning fog as easily as through rivers. Fishermen say a Driftfin following your boat means the tide will turn kindly.',
    element: 'tide',
    rarity: 'common',
    base: { hp: 40, atk: 12, def: 11 },
    move: 'Undertow',
  },
  {
    kind: 'pet',
    id: 'emberkit',
    name: 'Emberkit',
    epithet: 'the Hearth-Fox',
    lore: 'Sleeps in warm chimney stones and keeps its tail lit by dreaming of suppers. The flame never burns a friend.',
    element: 'ember',
    rarity: 'uncommon',
    base: { hp: 38, atk: 15, def: 9 },
    move: 'Cinder Pounce',
  },
  {
    kind: 'pet',
    id: 'cragmite',
    name: 'Cragmite',
    epithet: 'the Patient Boulder',
    lore: 'Mistaken for a rock for a hundred years at a time. The crystals on its back grow one ring for every storm it has slept through.',
    element: 'stone',
    rarity: 'uncommon',
    base: { hp: 58, atk: 10, def: 16 },
    move: 'Rockfall',
  },
  {
    kind: 'pet',
    id: 'wisplume',
    name: 'Wisplume',
    epithet: 'the Hollow-Wind Owl',
    lore: 'Rides the gusts that run ahead of weather. It hoots once before every rain, and is never wrong, which is very annoying.',
    element: 'gale',
    rarity: 'uncommon',
    base: { hp: 42, atk: 13, def: 11 },
    move: 'Gust Spiral',
  },
  {
    kind: 'pet',
    id: 'lumoth',
    name: 'Lumoth',
    epithet: 'the Lantern-Wing',
    lore: 'Drawn to lamplight and old maps. Where a Lumoth lands, faded ink glows bright again for one night.',
    element: 'lumen',
    rarity: 'rare',
    base: { hp: 40, atk: 16, def: 10 },
    move: 'Gloam Flare',
  },
];

export const MONSTERS: readonly MonsterSpecies[] = [
  {
    kind: 'monster',
    id: 'smudgeling',
    name: 'Smudgeling',
    epithet: 'Blotspawn of Spilled Ink',
    lore: 'A puddle of ink that learned to want things. It wants your map. Water thins it out.',
    element: 'tide',
    rarity: 'common',
    weakTo: 'tide',
    base: { hp: 40, atk: 10, def: 9 },
    move: 'Ink Splash',
  },
  {
    kind: 'monster',
    id: 'murkwing',
    name: 'Murkwing',
    epithet: 'Blotspawn of the Unlit Lane',
    lore: 'Flits between streetlamps that have gone out, blotting the ones that have not. Bright light makes it lose its shape.',
    element: 'gale',
    rarity: 'common',
    weakTo: 'lumen',
    base: { hp: 34, atk: 13, def: 8 },
    move: 'Shade Screech',
  },
  {
    kind: 'monster',
    id: 'thornmaw',
    name: 'Thornmaw',
    epithet: 'Blotspawn of the Overgrown Margin',
    lore: 'An ink-vine that crept off the edge of a herbal and grew teeth. Dry and brittle; it hates a spark.',
    element: 'grove',
    rarity: 'uncommon',
    weakTo: 'ember',
    base: { hp: 50, atk: 12, def: 12 },
    move: 'Bramble Bite',
  },
  {
    kind: 'monster',
    id: 'wickwraith',
    name: 'Wickwraith',
    epithet: 'Blotspawn of the Snuffed Candle',
    lore: 'What drifts up when a scribe blows out the last candle in anger. A strong wind scatters its smoke.',
    element: 'lumen',
    rarity: 'rare',
    weakTo: 'gale',
    base: { hp: 46, atk: 15, def: 10 },
    move: 'Smoke Wail',
  },
];

export const ALL_SPECIES: readonly Species[] = [...PETS, ...MONSTERS];

const byId = new Map(ALL_SPECIES.map((s) => [s.id, s]));
export function getSpecies(id: string): Species {
  const species = byId.get(id);
  if (!species) throw new Error(`Unknown species ${id}`);
  return species;
}

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, uncommon: 3, rare: 1 };
