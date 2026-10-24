/**
 * The Inkbound Bestiary. Long ago a cartographer drew wild things in the margins of the
 * realm's maps; now the maps are being walked again and the margins have come loose.
 * Wildlings are the kindly ones, each born of a kind of land. Blotspawn are spilled ink
 * gone sour: they cannot be bound, only driven back.
 */

import type { RealmId } from '../game/realms';
import { beatenBy } from './elements';

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
  /** The element that overpowers it on the Elemental Wheel (see elements.ts). */
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

  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'mirecap', level: EVOLVE_LEVEL, realm: 'wildwood', metres: EVOLVE_METRES },
    id: 'capling',
    name: 'Capling',
    epithet: 'the Toadstool Toad',
    lore: 'Sits so still under its cap that foragers try to pick it. It does not mind; it simply hops away and grows a new spot.',
    element: 'grove',
    rarity: 'uncommon',
    base: { hp: 50, atk: 10, def: 14 },
    move: 'Spore Puff',
  },
  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'conchwarden', level: EVOLVE_LEVEL, realm: 'tidemere', metres: EVOLVE_METRES },
    id: 'shellop',
    name: 'Shellop',
    epithet: 'the Spiral-Shell',
    lore: 'Its shell turns once for every year it has wandered the tideline. Hold it to your ear and you hear the harbour of the day it was born.',
    element: 'tide',
    rarity: 'uncommon',
    base: { hp: 52, atk: 9, def: 17 },
    move: 'Tidal Coil',
  },
  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'forgewyrm', level: EVOLVE_LEVEL, realm: 'hearthfields', metres: EVOLVE_METRES },
    id: 'sparkwick',
    name: 'Sparkwick',
    epithet: 'the Candle-Newt',
    lore: 'Lives in forges and bread ovens and eats only the sparks that fly loose. A smith with a Sparkwick never loses a nail to the dark.',
    element: 'ember',
    rarity: 'rare',
    base: { hp: 36, atk: 17, def: 9 },
    move: 'Spark Lash',
  },
  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'cairnlord', level: EVOLVE_LEVEL, realm: 'stoneward', metres: EVOLVE_METRES },
    id: 'pebblit',
    name: 'Pebblit',
    epithet: 'the Little Cairn',
    lore: 'Every walker who added a stone to a waymark cairn gave a Pebblit a little more of itself. It marks the way for those who come after.',
    element: 'stone',
    rarity: 'common',
    base: { hp: 54, atk: 11, def: 15 },
    move: 'Cairn Toss',
  },
  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'tempestkite', level: EVOLVE_LEVEL, realm: 'hearthfields', metres: EVOLVE_METRES },
    id: 'kitewisp',
    name: 'Kitewisp',
    epithet: 'the String-Lost Kite',
    lore: 'Once a child\'s kite, it slipped its string on a gusty fair day and never came down. It still loves a running child more than anything.',
    element: 'gale',
    rarity: 'common',
    base: { hp: 38, atk: 13, def: 10 },
    move: 'Updraft',
  },
  {
    kind: 'pet',
    stage: 1,
    evolution: { into: 'moonhare', level: EVOLVE_LEVEL, realm: 'barrows', metres: EVOLVE_METRES },
    id: 'glimhare',
    name: 'Glimhare',
    epithet: 'the Lamp-Eared Hare',
    lore: 'Its ears glow brightest on the darkest paths. Lost travellers who follow a Glimhare always reach a gate by morning.',
    element: 'lumen',
    rarity: 'uncommon',
    base: { hp: 42, atk: 14, def: 12 },
    move: 'Lampflash',
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

  {
    kind: 'pet',
    stage: 2,
    id: 'mirecap',
    name: 'Mirecap',
    epithet: 'Lord of the Fairy Ring',
    lore: 'Where a Mirecap rests, a ring of glowing toadstools comes up by morning. Step inside it and the wood goes very quiet.',
    element: 'grove',
    rarity: 'uncommon',
    base: { hp: 68, atk: 14, def: 19 },
    move: 'Fairy Ring',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'conchwarden',
    name: 'Conchwarden',
    epithet: 'the Pearl-Keeper',
    lore: 'Its shell has grown a crown of spines and, at its heart, a pearl that holds a whole calm sea.',
    element: 'tide',
    rarity: 'uncommon',
    base: { hp: 70, atk: 13, def: 23 },
    move: 'Pearl Tide',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'forgewyrm',
    name: 'Forgewyrm',
    epithet: 'the Anvil-Backed',
    lore: 'Smiths say the best blades are quenched in the steam off a Forgewyrm\'s back. It asks only for the first spark of every fire.',
    element: 'ember',
    rarity: 'rare',
    base: { hp: 50, atk: 23, def: 13 },
    move: 'Forgefire',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'cairnlord',
    name: 'Cairnlord',
    epithet: 'the Waymark King',
    lore: 'Runestones circle it like moons. Any path a Cairnlord has walked can never quite be lost again.',
    element: 'stone',
    rarity: 'common',
    base: { hp: 74, atk: 15, def: 21 },
    move: 'Standing Stones',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'tempestkite',
    name: 'Tempestkite',
    epithet: 'Rider of the Squall',
    lore: 'It flies the front edge of every storm, ribbons cracking with lightning. It still swoops low for a running child.',
    element: 'gale',
    rarity: 'common',
    base: { hp: 54, atk: 18, def: 14 },
    move: 'Squall Line',
  },
  {
    kind: 'pet',
    stage: 2,
    id: 'moonhare',
    name: 'Moonhare',
    epithet: 'the Night-Walker',
    lore: 'It carries the moon on its back on nights the sky forgets to. Barrow-wights bow as it passes.',
    element: 'lumen',
    rarity: 'uncommon',
    base: { hp: 58, atk: 19, def: 16 },
    move: 'Moonbeam',
  },
];

export const MONSTERS: readonly MonsterSpecies[] = [
  {
    kind: 'monster',
    id: 'smudgeling',
    name: 'Smudgeling',
    epithet: 'Blotspawn of Spilled Ink',
    lore: 'A puddle of ink that learned to want things. It wants your map. Bright light dries it to a crust.',
    element: 'tide',
    rarity: 'common',
    weakTo: 'lumen',
    base: { hp: 40, atk: 10, def: 9 },
    move: 'Ink Splash',
  },
  {
    kind: 'monster',
    id: 'murkwing',
    name: 'Murkwing',
    epithet: 'Blotspawn of the Unlit Lane',
    lore: 'Flits between streetlamps that have gone out, blotting the ones that have not. It cannot fly through stone, and a wall stops it dead.',
    element: 'gale',
    rarity: 'common',
    weakTo: 'stone',
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

/**
 * The Taken: Wildlings the Blot has soaked through. They fight like Blotspawn, keep their
 * own element, and are overpowered by whatever overpowers that element on the Wheel.
 */
export const TAKEN: readonly MonsterSpecies[] = PETS.map((pet) => ({
  kind: 'monster' as const,
  id: `taken-${pet.id}`,
  name: `Taken ${pet.name}`,
  epithet: `${pet.name} lost to the Blot`,
  lore: `A ${pet.name} that wandered too far into spilled ink. The Blot looks out through its eyes now. Drive the ink out and somewhere a ${pet.name} wakes up very confused.`,
  element: pet.element,
  rarity: pet.rarity,
  weakTo: beatenBy(pet.element),
  base: { hp: Math.round(pet.base.hp * 1.1), atk: Math.round(pet.base.atk * 1.1), def: pet.base.def },
  move: `Blotted ${pet.move}`,
}));

/** Every foe, the old Blotspawn and the Taken. */
export const FOES: readonly MonsterSpecies[] = [...MONSTERS, ...TAKEN];

export const ALL_SPECIES: readonly Species[] = [...PETS, ...EVOLVED, ...FOES];

const byId = new Map(ALL_SPECIES.map((s) => [s.id, s]));
export function getSpecies(id: string): Species {
  const species = byId.get(id);
  if (!species) throw new Error(`Unknown species ${id}`);
  return species;
}

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, uncommon: 3, rare: 1 };
