import { hashString, seededRandom } from './rng';
import { LAIR_WEEK_MS, lairWeek } from './lairs';
import type { Spawn } from './spawns';
import { pickTraits, RANKS, type Rank } from '../creatures/foes';
import { MONSTERS, type MonsterSpecies } from '../creatures/species';
import { MAX_LEVEL, type Encounter } from '../creatures/stats';

/**
 * The Wanted board: each week the Hearth posts three named Blotspawn, pinned to the map at
 * growing distances from where the Wayfarer was when the week began. Each is tougher than
 * the last and carries a bounty on top of the usual spoils. The board is anchored once a
 * week, so walking off does not move the posters.
 */

export const WANTED_COUNT = 3;
/** How far each poster sits from the anchor: one on a short walk, one further, one a real trek. */
const DISTANCES_M = [350, 600, 900] as const;
const GRADES: { rank: Rank; tier: number; level: number; coin: number; xp: number }[] = [
  { rank: 'rare', tier: 1, level: 1, coin: 60, xp: 200 },
  { rank: 'rare', tier: 1, level: 2, coin: 100, xp: 320 },
  { rank: 'elite', tier: 1, level: 3, coin: 160, xp: 500 },
];
const NAMES = ['Gristlejaw', 'Old Sootcap', 'Mother Murk', 'Blackwick', 'Inkfang', 'Grimquill', 'Hollowgut', 'Rattlesmudge', 'Gloomtongue', 'Sallowmaw', 'Widow Blot', 'Smearbones'] as const;

export interface Bounty {
  /** The name on the poster, which the foe goes by in the fight. */
  name: string;
  /** 0, 1 or 2: which poster on the board. */
  index: number;
  coin: number;
  xp: number;
  /** The toughest poster always drops gear. */
  gear: boolean;
}

export interface WantedPost {
  spawn: Spawn;
  encounter: Encounter & { bounty: Bounty; species: MonsterSpecies };
}

export interface WantedAnchor {
  week: number;
  lat: number;
  lng: number;
}

const ANCHOR_KEY = 'wanderwild.wanted';

/** Where this week's board is pinned: the first place the Wayfarer was seen this week. */
export function wantedAnchor(lat: number, lng: number, now = Date.now(), storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage): WantedAnchor {
  const week = lairWeek(now);
  try {
    const saved = JSON.parse(storage?.getItem(ANCHOR_KEY) ?? 'null') as WantedAnchor | null;
    if (saved && saved.week === week && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) return saved;
  } catch {
    // A broken anchor is replaced below.
  }
  const anchor = { week, lat, lng };
  try {
    storage?.setItem(ANCHOR_KEY, JSON.stringify(anchor));
  } catch {
    // Without storage the board re-pins each session; claimed posters stay claimed.
  }
  return anchor;
}

/** A point `metres` away from `from` on compass bearing `bearing` (radians, 0 = north). */
function offset(from: { lat: number; lng: number }, metres: number, bearing: number): { lat: number; lng: number } {
  const dLat = (metres * Math.cos(bearing)) / 111_320;
  const dLng = (metres * Math.sin(bearing)) / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** This week's three posters, their foes levelled against the party that will hunt them. */
export function wantedPosts(anchor: WantedAnchor, partyLevel = 1): WantedPost[] {
  const rand = seededRandom(hashString(`wanted:${anchor.week}`));
  const kinds = shuffle(MONSTERS, rand);
  const names = shuffle(NAMES, rand);
  const start = rand() * Math.PI * 2;
  return GRADES.map((g, i) => {
    // Spread around the compass so each hunt is a different walk.
    const at = offset(anchor, DISTANCES_M[i], start + (i * 2 * Math.PI) / WANTED_COUNT + (rand() - 0.5) * 0.8);
    const seed = Math.floor(rand() * 2 ** 32) >>> 0;
    const base = kinds[i % kinds.length];
    const bounty: Bounty = { name: names[i], index: i, coin: g.coin, xp: g.xp, gear: i === WANTED_COUNT - 1 };
    const id = `wanted:${anchor.week}:${i}`;
    return {
      spawn: { id, ...at, seed, rarity: g.rank === 'elite' ? 'epic' : 'rare', expiresAt: (anchor.week + 1) * LAIR_WEEK_MS },
      encounter: {
        // The poster's name stands in for the kind's, so the fight calls it by name.
        species: { ...base, name: names[i] },
        level: Math.min(MAX_LEVEL, Math.max(2, partyLevel + g.level)),
        seed,
        rank: g.rank,
        tier: g.tier,
        traits: pickTraits(rand, RANKS[g.rank].traits),
        bounty,
      },
    };
  });
}
