import { mulberry32, range } from './rng';
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
import { ELITE_TIERS, INK_CELL_M, INK_LEVELS, inkDepth, rollFoe, type FoeTrait, type InkDepth, type Rank } from './foes';
import { cellAt } from '../game/cells';
import type { Rival } from '../game/rivals';

export const MAX_LEVEL = 30;

/** What an individual's seed decides: its colouring and a rare golden coat. Every one of a kind fights the same. */
export interface Individual {
  hueShift: number;
  gilded: boolean;
}

export const GILDED_CHANCE = 1 / 48;

export function individualFromSeed(seed: number, kind: Species['kind']): Individual {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const hueShift = range(rng, -14, 14);
  // This draw once picked a temperament (retired 2026-10-26); it stays so saved Wildlings keep their golden coats.
  rng();
  return { hueShift, gilded: kind === 'pet' && rng() < GILDED_CHANCE };
}

export type StatKey = 'hp' | 'atk' | 'def' | 'spd';
export const STAT_KEYS: readonly StatKey[] = ['hp', 'atk', 'def', 'spd'];
export const STAT_NAMES: Record<StatKey, string> = { hp: 'Vigour', atk: 'Might', def: 'Guard', spd: 'Speed' };
/** Flat points added to each stat. Every Wildling is born with a few, and each of its kind that joins it adds one more. */
export type Bonus = Record<StatKey, number>;
/** How much one point is worth on each stat: health counts in threes so it keeps pace with the rest. */
export const BONUS_STEP: Bonus = { hp: 3, atk: 1, def: 1, spd: 1 };
/** A newly met Wildling is born with 0 to this many points on each stat. */
export const BONUS_ROLL = 3;
/** The most points any one stat can hold. */
export const BONUS_MAX = 10;

/** The stat bonuses a Wildling is born with, from its seed. */
export function rollBonus(seed: number): Bonus {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const roll = (k: StatKey) => Math.floor(rng() * (BONUS_ROLL + 1)) * BONUS_STEP[k];
  return { hp: roll('hp'), atk: roll('atk'), def: roll('def'), spd: roll('spd') };
}

/**
 * Adds a joining kin's point to a kept Wildling's bonuses: one stat, picked by the newcomer's seed,
 * or the next one not yet full. Returns which stat rose and by how much, or null when all are full.
 */
export function addKinPoint(bonus: Bonus, seed: number): { stat: StatKey; amount: number } | null {
  const first = Math.floor(mulberry32(seed ^ 0x27d4eb2f)() * STAT_KEYS.length);
  for (let i = 0; i < STAT_KEYS.length; i++) {
    const stat = STAT_KEYS[(first + i) % STAT_KEYS.length];
    if (bonus[stat] < BONUS_MAX * BONUS_STEP[stat]) {
      bonus[stat] += BONUS_STEP[stat];
      return { stat, amount: BONUS_STEP[stat] };
    }
  }
  return null;
}

/** Percent bonuses from before bonuses were flat points (2026-10-26), turned into points on load. */
export function bonusFromPercent(seed: number, percent: Bonus): Bonus {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const oldRoll = STAT_KEYS.map(() => Math.floor(rng() * 11));
  // Each kin that joined used to add 2% to every stat on top of the better roll.
  const kin = Math.max(0, Math.round(Math.max(...STAT_KEYS.map((k, i) => percent[k] - oldRoll[i])) / 2));
  const bonus = rollBonus(seed);
  for (let i = 0; i < kin; i++) addKinPoint(bonus, seed + i);
  return bonus;
}

export const xpToNext = (level: number) => Math.round(20 * Math.pow(level, 1.5));

export function statsAt(base: BaseStats, level: number, bonus?: Bonus): BaseStats {
  const growth = 1 + 0.1 * (level - 1);
  const b = (k: StatKey) => bonus?.[k] ?? 0;
  return {
    hp: Math.round(base.hp * growth + level * 2) + b('hp'),
    atk: Math.round(base.atk * growth) + b('atk'),
    def: Math.round(base.def * growth) + b('def'),
    spd: Math.round(base.spd * growth) + b('spd'),
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
  /** Where it stands, which sets how deep the ink runs there. */
  lat?: number;
  lng?: number;
}

const REALM_ELEMENTS: Record<RealmId, Element[]> = {
  wildwood: ['grove', 'lumen'],
  tidemere: ['tide'],
  stoneward: ['stone', 'ember'],
  hearthfields: ['gale', 'ember'],
  barrows: ['lumen', 'stone'],
};

/** How deep the ink runs where a spawn stands; spawns with no place sit at even depth. */
export function spawnInkDepth(spawn: SpawnSeed): InkDepth {
  if (spawn.lat === undefined || spawn.lng === undefined) return 'even';
  return inkDepth(cellAt(spawn.lat, spawn.lng, INK_CELL_M).id, spawn.realm === 'barrows');
}

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
  /** An Inkbinder's camp: this is the lead of their line of three Taken. */
  rival?: Rival;
}

/**
 * Decides which creature stands at a spawn point. The same spawn always gives the same creature.
 * Blotspawn are measured against the party's level, shifted by the ink depth of their patch of map.
 */
export function creatureForSpawn(spawn: SpawnSeed, partyLevel: number): Encounter {
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
  const [low, high] = INK_LEVELS[spawnInkDepth(spawn)];
  const level = isMonster
    ? partyLevel + low + Math.round(rng() * (high - low)) + bonus
    : 1 + Math.floor(rng() * (partyLevel + 2)) + bonus;
  const encounter: Encounter = { species, level: Math.min(MAX_LEVEL, Math.max(1, level)), seed: Math.floor(rng() * 2 ** 32) };
  if (!isMonster) return encounter;
  const foe = rollFoe(spawn.rarity, spawn.seed);
  const extra = foe.rank === 'elite' ? ELITE_TIERS[foe.tier - 1].levels : 0;
  return { ...encounter, ...foe, level: Math.min(MAX_LEVEL, encounter.level + extra) };
}
