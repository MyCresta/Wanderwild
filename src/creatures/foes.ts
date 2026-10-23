import { mulberry32, type Rng } from './rng';

/**
 * Blotspawn come in three ranks. Rare and Elite ones are bigger blots with quirks,
 * worth more when driven off. The spawn's map rarity and seed decide, so everyone
 * standing at the same spot meets the same foe.
 */
export type Rank = 'normal' | 'rare' | 'elite';
export type FoeTrait = 'thick' | 'savage' | 'warded' | 'leeching' | 'swift';

export const RANKS: Record<Rank, { name: string; hp: number; power: number; traits: number }> = {
  normal: { name: 'Blot', hp: 1, power: 1, traits: 0 },
  rare: { name: 'Rare', hp: 1.25, power: 1.05, traits: 1 },
  elite: { name: 'Elite', hp: 1.6, power: 1.1, traits: 2 },
};

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

export function foeRank(spawnRarity: SpawnRarity, rng: Rng): Rank {
  if (spawnRarity === 'epic' || spawnRarity === 'legendary') return 'elite';
  if (spawnRarity === 'rare') return 'rare';
  const roll = rng();
  return roll < SURPRISE_ELITE ? 'elite' : roll < SURPRISE_ELITE + SURPRISE_RARE ? 'rare' : 'normal';
}

/** Rank and quirks of the Blotspawn at a spawn. Uses its own stream so species and looks stay put. */
export function rollFoe(spawnRarity: SpawnRarity, seed: number): { rank: Rank; traits: FoeTrait[] } {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const rank = foeRank(spawnRarity, rng);
  const pool = [...TRAIT_IDS];
  const traits: FoeTrait[] = [];
  for (let i = 0; i < RANKS[rank].traits; i++) traits.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return { rank, traits };
}
