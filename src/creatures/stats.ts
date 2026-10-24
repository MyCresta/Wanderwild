import { mulberry32, pick, range } from './rng';
import {
  FOES,
  PETS,
  RARITY_WEIGHT,
  type BaseStats,
  type Element,
  type MonsterSpecies,
  type Rarity,
  type Species,
} from './species';
import { matchup } from './elements';
import { ELITE_TIERS, rollFoe, type FoeTrait, type Rank } from './foes';

export const MAX_LEVEL = 30;

export interface Trait {
  name: string;
  hp: number;
  atk: number;
  def: number;
  /** Multiplier on experience earned. */
  xp: number;
}

export const TRAITS: readonly Trait[] = [
  { name: 'Brave', hp: 1, atk: 1.1, def: 0.95, xp: 1 },
  { name: 'Sturdy', hp: 1, atk: 0.95, def: 1.12, xp: 1 },
  { name: 'Hearty', hp: 1.12, atk: 1, def: 0.97, xp: 1 },
  { name: 'Fierce', hp: 0.93, atk: 1.15, def: 1, xp: 1 },
  { name: 'Curious', hp: 1, atk: 1, def: 1, xp: 1.2 },
  { name: 'Steadfast', hp: 1.04, atk: 1.03, def: 1.04, xp: 1 },
];

/** What an individual's seed decides: colouring, temperament, and a rare golden coat. */
export interface Individual {
  hueShift: number;
  trait: Trait;
  gilded: boolean;
}

export const GILDED_CHANCE = 1 / 48;

export function individualFromSeed(seed: number, kind: Species['kind']): Individual {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  return {
    hueShift: range(rng, -14, 14),
    trait: pick(rng, TRAITS),
    gilded: kind === 'pet' && rng() < GILDED_CHANCE,
  };
}

export const xpToNext = (level: number) => Math.round(20 * Math.pow(level, 1.5));

export function statsAt(base: BaseStats, level: number, trait: Trait): BaseStats {
  const growth = 1 + 0.1 * (level - 1);
  return {
    hp: Math.round((base.hp * growth + level * 2) * trait.hp),
    atk: Math.round(base.atk * growth * trait.atk),
    def: Math.round(base.def * growth * trait.def),
  };
}

export interface Levelled {
  level: number;
  xp: number;
}

/** Adds experience in place and returns how many levels were gained. */
export function addXp(creature: Levelled, amount: number): number {
  let gained = 0;
  creature.xp += Math.max(0, Math.round(amount));
  while (creature.level < MAX_LEVEL && creature.xp >= xpToNext(creature.level)) {
    creature.xp -= xpToNext(creature.level);
    creature.level++;
    gained++;
  }
  if (creature.level >= MAX_LEVEL) creature.xp = 0;
  return gained;
}

/** How hard an element move lands, by the Elemental Wheel. */
export function effectiveness(move: Element, target: Species): number {
  return matchup(move, target.element);
}

export function damage(atk: number, def: number, power: number, eff: number, roll: number, crit: boolean): number {
  const variance = 0.85 + roll * 0.3;
  return Math.max(1, Math.round(power * atk * (20 / (20 + def)) * 1.1 * eff * variance * (crit ? 1.5 : 1)));
}

/** Spawn rarity tiers coming from the map, which may be finer than species rarity. */
export type SpawnRarity = Rarity | 'epic' | 'legendary';
export type RealmId = 'wildwood' | 'tidemere' | 'stoneward' | 'barrows' | 'hearthfields';

export interface SpawnSeed {
  seed: number;
  rarity: SpawnRarity;
  realm?: RealmId;
}

const REALM_ELEMENTS: Record<RealmId, Element[]> = {
  wildwood: ['grove', 'lumen'],
  tidemere: ['tide'],
  stoneward: ['stone', 'ember'],
  hearthfields: ['gale', 'ember'],
  barrows: ['lumen', 'stone'],
};

const MONSTER_CHANCE = 0.3;
const BARROWS_MONSTER_CHANCE = 0.6;

const toSpeciesRarity = (r: SpawnRarity): Rarity => (r === 'epic' || r === 'legendary' ? 'rare' : r);

function weightedPick<T extends Species>(rng: () => number, list: readonly T[], weight: (s: T) => number): T {
  const total = list.reduce((sum, s) => sum + weight(s), 0);
  let roll = rng() * total;
  for (const s of list) {
    roll -= weight(s);
    if (roll <= 0) return s;
  }
  return list[list.length - 1];
}

export interface Encounter {
  species: Species;
  level: number;
  /** Seed for this individual's look and trait. */
  seed: number;
  /** Blotspawn only: Rare and Elite foes are tougher and carry quirks. */
  rank?: Rank;
  /** Elite tier 1-3, boss tier 1-5. */
  tier?: number;
  traits?: FoeTrait[];
}

/** Decides which creature stands at a spawn point. The same spawn always gives the same creature. */
export function creatureForSpawn(spawn: SpawnSeed, companionLevel: number): Encounter {
  const rng = mulberry32(spawn.seed);
  const tier = toSpeciesRarity(spawn.rarity);
  const favoured = spawn.realm ? REALM_ELEMENTS[spawn.realm] : [];
  const monsterChance = spawn.realm === 'barrows' ? BARROWS_MONSTER_CHANCE : MONSTER_CHANCE;
  const weight = (s: Species) =>
    RARITY_WEIGHT[s.rarity] * (s.rarity === tier ? 3 : 1) * (favoured.includes(s.element) ? 3 : 1);

  const isMonster = rng() < monsterChance;
  // There are many Taken, so each is rarer than an old Blotspawn: together about two foes in five.
  const foeWeight = (s: MonsterSpecies) => weight(s) * (s.id.startsWith('taken-') ? 0.25 : 1);
  const species: Species = isMonster ? weightedPick<MonsterSpecies>(rng, FOES, foeWeight) : weightedPick(rng, PETS, weight);
  const bonus = spawn.rarity === 'legendary' ? 4 : spawn.rarity === 'epic' ? 2 : 0;
  const level = isMonster
    ? companionLevel + Math.round(rng() * 4 - 2) + bonus
    : 1 + Math.floor(rng() * (companionLevel + 2)) + bonus;
  const encounter: Encounter = { species, level: Math.min(MAX_LEVEL, Math.max(1, level)), seed: Math.floor(rng() * 2 ** 32) };
  if (!isMonster) return encounter;
  const foe = rollFoe(spawn.rarity, spawn.seed);
  const extra = foe.rank === 'elite' ? ELITE_TIERS[foe.tier - 1].levels : 0;
  return { ...encounter, ...foe, level: Math.min(MAX_LEVEL, encounter.level + extra) };
}
