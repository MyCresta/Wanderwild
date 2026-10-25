import { hashString, mulberry32, type Rng } from './rng';

/**
 * Blotspawn come in three ranks. Rare and Elite ones are bigger blots with quirks,
 * worth more when driven off. The spawn's map rarity and seed decide, so everyone
 * standing at the same spot meets the same foe.
 */
export type Rank = 'normal' | 'rare' | 'elite' | 'boss';
export type FoeTrait = 'thick' | 'savage' | 'warded' | 'leeching' | 'swift';

export const RANKS: Record<Rank, { name: string; hp: number; power: number; traits: number }> = {
  normal: { name: 'Blot', hp: 1, power: 1, traits: 0 },
  rare: { name: 'Rare', hp: 1.25, power: 1.05, traits: 1 },
  elite: { name: 'Elite', hp: 1.6, power: 1.1, traits: 2 },
  boss: { name: 'Boss', hp: 3.4, power: 1.3, traits: 3 },
};

/** Elites come in three tiers, each tougher, a little higher level, and worth more. */
export const ELITE_TIERS = [
  { hp: 1, power: 1, traits: 2, levels: 0 },
  { hp: 1.2, power: 1.05, traits: 2, levels: 2 },
  { hp: 1.4, power: 1.1, traits: 3, levels: 4 },
] as const;

/**
 * Bosses hold a lair for a week. Each tier has a lowest level, and a boss rises to meet a
 * stronger party (tier I a level under your best pet, tier V three over), so outlevelling
 * one is never enough: it takes pets strong against it, tonics and a full party.
 */
export const BOSS_LEVELS = [5, 10, 15, 20, 25] as const;
/** Pets top out at level 30; a tier V boss still stands three above them. */
const BOSS_MAX_LEVEL = 33;

export function bossLevel(tier: number, strongestPet = 1): number {
  const t = Math.min(BOSS_LEVELS.length, Math.max(1, tier));
  return Math.min(BOSS_MAX_LEVEL, Math.max(BOSS_LEVELS[t - 1], strongestPet + t - 2));
}
export const BOSS_TITLES = ['the Swollen', 'the Ravenous', 'the Unwritten', 'the Ink-Tyrant', 'the Last Blot'] as const;

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Health and power multipliers and quirk count for a foe of this rank and tier (1-based). */
export function foeScale(rank: Rank, tier = 1, level = 1): { hp: number; power: number; traits: number } {
  const r = RANKS[rank];
  // Bosses grow fiercer with level, keeping pace with evolved pets.
  if (rank === 'boss') return { hp: r.hp + 0.04 * level, power: r.power + 0.008 * level, traits: r.traits };
  if (rank !== 'elite') return r;
  const t = ELITE_TIERS[Math.min(ELITE_TIERS.length, Math.max(1, tier)) - 1];
  return { hp: r.hp * t.hp, power: r.power * t.power, traits: t.traits };
}

/** "Rare", "Elite II", "Boss V": a short badge for a foe. */
export function rankLabel(rank: Rank, tier = 1): string {
  if (rank === 'normal') return '';
  if (rank === 'rare') return '✦ Rare';
  return `${rank === 'boss' ? '☠ Boss' : '♛ Elite'} ${ROMAN[tier - 1] ?? ''}`.trim();
}

export const FOE_TRAITS: Record<FoeTrait, { name: string; glyph: string; blurb: string }> = {
  thick: { name: 'Thick-inked', glyph: '⬤', blurb: 'Much more health.' },
  savage: { name: 'Savage', glyph: '⚔', blurb: 'Hits a fifth harder.' },
  warded: { name: 'Warded', glyph: '⛨', blurb: 'Halves all damage until struck with its weakness.' },
  leeching: { name: 'Leeching', glyph: '♥', blurb: 'Heals from the damage it deals.' },
  swift: { name: 'Swift', glyph: '»', blurb: 'Unleashes its big attack every other turn.' },
};

const TRAIT_IDS = Object.keys(FOE_TRAITS) as FoeTrait[];

/** Map spawn rarities, as the spawn tables name them. */
type SpawnRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Chance that an ordinary spawn still turns out Rare or Elite. */
const SURPRISE_RARE = 0.08;
const SURPRISE_ELITE = 0.03;

export function foeRank(spawnRarity: SpawnRarity, rng: Rng): { rank: Rank; tier: number } {
  if (spawnRarity === 'legendary') return { rank: 'elite', tier: rng() < 0.5 ? 3 : 2 };
  if (spawnRarity === 'epic') return { rank: 'elite', tier: rng() < 0.3 ? 2 : 1 };
  if (spawnRarity === 'rare') return { rank: 'rare', tier: 1 };
  const roll = rng();
  return { rank: roll < SURPRISE_ELITE ? 'elite' : roll < SURPRISE_ELITE + SURPRISE_RARE ? 'rare' : 'normal', tier: 1 };
}

/** Picks distinct quirks from a seeded stream. */
export function pickTraits(rng: Rng, count: number): FoeTrait[] {
  const pool = [...TRAIT_IDS];
  const traits: FoeTrait[] = [];
  for (let i = 0; i < count && pool.length; i++) traits.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return traits;
}

/** Rank, tier and quirks of the Blotspawn at a spawn. Uses its own stream so species and looks stay put. */
export function rollFoe(spawnRarity: SpawnRarity, seed: number): { rank: Rank; tier: number; traits: FoeTrait[] } {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const { rank, tier } = foeRank(spawnRarity, rng);
  return { rank, tier, traits: pickTraits(rng, foeScale(rank, tier).traits) };
}

/**
 * How deep the ink runs in a patch of the map. Every few streets the Blotspawn change:
 * thin ink holds easy prey well under your party, deep ink holds foes above it.
 */
export type InkDepth = 'thin' | 'even' | 'deep';
/** Size of one patch of ink, in metres. */
export const INK_CELL_M = 400;
/** Levels above (or below) the party's average that a Blotspawn of each depth stands at. */
export const INK_LEVELS: Record<InkDepth, readonly [number, number]> = {
  thin: [-5, -1],
  even: [-2, 2],
  deep: [2, 5],
};

/** The depth of a patch, from its cell id. The Barrows run deeper. */
export function inkDepth(cellId: string, barrows = false): InkDepth {
  const roll = mulberry32(hashString(`ink:${cellId}`))();
  const [thin, even] = barrows ? [0.15, 0.55] : [0.3, 0.78];
  return roll < thin ? 'thin' : roll < even ? 'even' : 'deep';
}

/** How hard a foe looks next to the party, for the map chip and gates. */
export type Threat = 'easy' | 'even' | 'hard' | 'deadly';
export const THREATS: Record<Threat, { name: string }> = {
  easy: { name: 'Easy' },
  even: { name: 'Even' },
  hard: { name: 'Hard' },
  deadly: { name: 'Deadly' },
};

export function foeThreat(foeLevel: number, partyLevel: number, rank: Rank = 'normal', tier = 1): Threat {
  const toughness = rank === 'boss' ? 3 : rank === 'elite' ? 1 + 0.5 * (tier - 1) : rank === 'rare' ? 0.5 : 0;
  const gap = foeLevel - partyLevel + toughness;
  return gap <= -3 ? 'easy' : gap <= 1.5 ? 'even' : gap <= 4.5 ? 'hard' : 'deadly';
}
