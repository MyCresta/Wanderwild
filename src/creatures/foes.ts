import { mulberry32, type Rng } from './rng';

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
  boss: { name: 'Boss', hp: 2.6, power: 1.15, traits: 3 },
};

/** Elites come in three tiers, each tougher, a little higher level, and worth more. */
export const ELITE_TIERS = [
  { hp: 1, power: 1, traits: 2, levels: 0 },
  { hp: 1.2, power: 1.05, traits: 2, levels: 2 },
  { hp: 1.4, power: 1.1, traits: 3, levels: 4 },
] as const;

/** Bosses hold a lair for a week at a fixed level, so you can grow and prepare for them. */
export const BOSS_LEVELS = [5, 10, 15, 20, 25] as const;
export const BOSS_TITLES = ['the Swollen', 'the Ravenous', 'the Unwritten', 'the Ink-Tyrant', 'the Last Blot'] as const;

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Health and power multipliers and quirk count for a foe of this rank and tier (1-based). */
export function foeScale(rank: Rank, tier = 1): { hp: number; power: number; traits: number } {
  const r = RANKS[rank];
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
