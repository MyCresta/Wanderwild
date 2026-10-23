/**
 * The Inkbound Bestiary. Long ago a cartographer drew wild things in the margins of the
 * realm's maps; now the maps are being walked again and the margins have come loose.
 * Wildlings are the kindly ones, each born of a kind of land. Blotspawn are spilled ink
 * gone sour: they cannot be bound, only driven back.
 */

import type { RealmId } from '../game/realms';

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

export interface Evolution {
  into: string;
  /** Level the pet must reach. */
  level: number;
  /** The realm it must walk in as your companion, and how far. */
  realm: RealmId;
  metres: number;
}

export interface PetSpecies extends SpeciesBase {
  kind: 'pet';
  /** 1 for wild forms, 2 for evolved forms (never found wild). */
  stage: 1 | 2;
  evolution?: Evolution;
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

export const EVOLVE_LEVEL = 10;
export const EVOLVE_METRES = 1500;

/** Wild Wildlings, the forms that spawn on the map. */
export const PETS: readonly PetSpecies[] = [
  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'thornwarden', level: EVOLVE_LEVEL, realm: 'wildwood', metres: EVOLVE_METRES },
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
    stage: 1,
    evolution: { into: 'veilwyrm', level: EVOLVE_LEVEL, realm: 'tidemere', metres: EVOLVE_METRES },
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
    stage: 1,
    evolution: { into: 'pyrevixen', level: EVOLVE_LEVEL, realm: 'hearthfields', metres: EVOLVE_METRES },
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
    stage: 1,
    evolution: { into: 'bastilith', level: EVOLVE_LEVEL, realm: 'stoneward', metres: EVOLVE_METRES },
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
    stage: 1,
    evolution: { into: 'stormplume', level: EVOLVE_LEVEL, realm: 'hearthfields', metres: EVOLVE_METRES },
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
    stage: 1,
    evolution: { into: 'gloamwing', level: EVOLVE_LEVEL, realm: 'barrows', metres: EVOLVE_METRES },
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

/** What a Wildling becomes after walking long enough in its home realm. */
export const EVOLVED: readonly PetSpecies[] = [
  {
    kind: 'pet',
    stage: 2,
    id: 'thornwarden',
    name: 'Thornwarden',
    epithet: 'Keeper of the Wild Hedge',
    lore: 'A Bramblet that has walked every path in its wood comes home crowned in briar roses. Old hedgerows grow back wherever it sleeps.',
    element: 'grove',
    rarity: 'common',
    base: { hp: 62, atk: 15, def: 18 },
    move: 'Briar Bastion',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'veilwyrm',
    name: 'Veilwyrm',
    epithet: 'the Tide-Crowned',
    lore: 'Its veils have grown long enough to hold back a fog bank. Sailors who see its crest at dawn know they will find the harbour.',
    element: 'tide',
    rarity: 'common',
    base: { hp: 56, atk: 17, def: 15 },
    move: 'Riptide Veil',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'pyrevixen',
    name: 'Pyrevixen',
    epithet: 'the Three-Flame Fox',
    lore: 'Each tail is a hearth it has warmed. A Pyrevixen curled on a doorstep means the house will never go cold.',
    element: 'ember',
    rarity: 'uncommon',
    base: { hp: 52, atk: 21, def: 12 },
    move: 'Pyre Pounce',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'bastilith',
    name: 'Bastilith',
    epithet: 'the Walking Keep',
    lore: 'A Cragmite that slept long enough in the old town woke with a tower on its back. Pigeons pay it rent.',
    element: 'stone',
    rarity: 'uncommon',
    base: { hp: 78, atk: 14, def: 22 },
    move: 'Rampart Slam',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'stormplume',
    name: 'Stormplume',
    epithet: 'the Thunder-Horned Owl',
    lore: 'It no longer hoots before the rain; it decides when the rain comes. Farmers leave it the first sheaf of every harvest.',
    element: 'gale',
    rarity: 'uncommon',
    base: { hp: 58, atk: 18, def: 15 },
    move: 'Thunderclap',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'gloamwing',
    name: 'Gloamwing',
    epithet: 'the Lantern of the Barrows',
    lore: 'It carries a lantern lit from every candle left on an old grave. The dead are said to read their names by its light.',
    element: 'lumen',
    rarity: 'rare',
    base: { hp: 54, atk: 22, def: 14 },
    move: 'Gloaming Lantern',
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

export const ALL_SPECIES: readonly Species[] = [...PETS, ...EVOLVED, ...MONSTERS];

const byId = new Map(ALL_SPECIES.map((s) => [s.id, s]));
export function getSpecies(id: string): Species {
  const species = byId.get(id);
  if (!species) throw new Error(`Unknown species ${id}`);
  return species;
}

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, uncommon: 3, rare: 1 };
