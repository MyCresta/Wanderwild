import { REACH_M } from '../geo/reach';
import { haversine } from '../geo/distance';
import { hashString, seededRandom } from '../game/rng';

/**
 * Treasure hunts: a riddle points at a real landmark nearby. Walking uncovers more
 * hints (or Wanderlight buys them), the search circle on the map shrinks, and reaching
 * the place opens a chest. Fewer hints used means a richer chest.
 */

export type LandmarkCategory =
  | 'chapel'
  | 'archive'
  | 'monument'
  | 'vista'
  | 'fountain'
  | 'hall'
  | 'stage'
  | 'garden'
  | 'school'
  | 'arena'
  | 'menagerie';

export interface Landmark {
  id: string;
  name: string;
  category: LandmarkCategory;
  lat: number;
  lng: number;
}

/** OpenMapTiles poi class/subclass → landmark category; anything else is not hunted. */
const CATEGORY_BY_TAG: Record<string, LandmarkCategory> = {
  place_of_worship: 'chapel',
  library: 'archive',
  museum: 'archive',
  art_gallery: 'archive',
  monument: 'monument',
  memorial: 'monument',
  statue: 'monument',
  artwork: 'monument',
  castle: 'monument',
  ruins: 'monument',
  viewpoint: 'vista',
  attraction: 'vista',
  fountain: 'fountain',
  town_hall: 'hall',
  theatre: 'stage',
  cinema: 'stage',
  arts_centre: 'stage',
  park: 'garden',
  garden: 'garden',
  college: 'school',
  university: 'school',
  school: 'school',
  stadium: 'arena',
  sports_centre: 'arena',
  zoo: 'menagerie',
  aquarium: 'menagerie',
};

export function landmarkCategory(poiClass?: string, poiSubclass?: string): LandmarkCategory | undefined {
  return CATEGORY_BY_TAG[poiSubclass ?? ''] ?? CATEGORY_BY_TAG[poiClass ?? ''];
}

export function landmarkId(name: string, lat: number, lng: number): string {
  return `landmark:${hashString(`${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`).toString(36)}`;
}

export const CATEGORY_TITLES: Record<LandmarkCategory, string> = {
  chapel: 'a house of prayer',
  archive: 'a hall of lore',
  monument: 'a monument',
  vista: 'a wonder',
  fountain: 'a fountain',
  hall: 'a seat of council',
  stage: 'a house of tales',
  garden: 'a green garden',
  school: 'a school of learning',
  arena: 'an arena',
  menagerie: 'a menagerie',
};

const RIDDLES: Record<LandmarkCategory, string[]> = {
  chapel: [
    'Where bells once called and candles burn, the faithful come and the hushed return.',
    'A roof raised up to touch the sky, where whispered words are lifted high.',
    'Stone and glass and an echoing nave: seek where the songs of the old ones are saved.',
  ],
  archive: [
    'A thousand voices, none of them loud. Their tales are kept, their spines are bowed.',
    'Behind its doors lie ages past, in ink and glass the memories last.',
    'Where scholars wander, quiet and slow, seek the keeper of all we know.',
  ],
  monument: [
    'It does not walk, it does not speak, yet it remembers week by week.',
    'Raised in honour, standing still, it guards a memory, and always will.',
    'Cast or carved for one long gone, it holds its post from dusk till dawn.',
  ],
  vista: [
    'Travellers stop and gasp and stare. Find the wonder waiting there.',
    'Where every wanderer lifts their eyes, the marvel of this land lies.',
    'Folk come from far to see this sight. Follow their footsteps to find it right.',
  ],
  fountain: [
    'It sings all day but has no throat, and throws its silver with every note.',
    'Water leaps where no spring runs. Seek the dancer in the sun.',
    'Coins sleep beneath its rippling skin. Find the wishing well within.',
  ],
  hall: [
    'Where elders gather and edicts are made, the town is governed, its taxes paid.',
    'The banners of the township fly where councils argue, low and high.',
    'Seek the seat where the reeve holds sway, and the town decides its way.',
  ],
  stage: [
    'Masks and lanterns, cheers and tears. Tales are told here to waiting ears.',
    'When the curtain lifts and the lights go low, the crowd sits still to watch the show.',
    'Players play and bards recite, in this house of borrowed night.',
  ],
  garden: [
    'Green and growing, fenced and fair, the town keeps a little Wildwood there.',
    'Leaf and lawn where children run. Find the green that drinks the sun.',
    'Petals, paths, and an old tree’s shade. Seek the place where the wild was tamed.',
  ],
  school: [
    'Young minds gather, quills in hand, to learn the lore of all the land.',
    'Bells ring out and lessons start. Find the hall of the learned art.',
    'Where apprentices are made into masters, seek the halls of the town’s wise pastors.',
  ],
  arena: [
    'Roars go up when champions meet. Seek the ring of the drumming feet.',
    'Banners, contests, a cheering throng. Here the strong prove they belong.',
    'Where games are won and glories lost, find the field where the crowds are tossed.',
  ],
  menagerie: [
    'Beasts from far lands, fin and paw, live where wanderers watch in awe.',
    'Creatures strange in pen and pool. Find the keepers of the wild and cool.',
    'A Bestiary that breathes and eats: seek the place where wild things meet.',
  ],
};

export const HUNT_MIN_M = 200;
export const HUNT_MAX_M = 800;
/** Never chosen closer than this, even when nothing better is near. */
export const HUNT_FLOOR_M = 160;
/** A landmark is found once it is inside the player's reach ring. */
export const ARRIVE_M = REACH_M;
/** Every this many metres walked during a hunt uncovers the next hint. */
export const HINT_WALK_M = 200;
/** Wanderlight to uncover a hint straight away. */
export const HINT_COST = 3;
/** Search circle radius at each hint level (the riddle alone, then one per hint). */
export const SEARCH_RADII_M = [400, 260, 160, 90];
export const MAX_HINTS = SEARCH_RADII_M.length - 1;

export interface ActiveHunt {
  landmark: Landmark;
  riddle: string;
  startedAt: number;
  /** Straight-line distance from the player when the hunt began. */
  startDistanceM: number;
  /** Metres walked since the hunt began. */
  walkedM: number;
  /** Hints uncovered beyond the riddle (0 to MAX_HINTS). */
  hints: number;
  /** Hints paid for with Wanderlight, so walking does not double count them. */
  boughtHints: number;
  /** Last measured distance, for warmer and colder. */
  lastDistanceM?: number;
  /** Start point rounded to ~100 m, kept only for the compass hint (never a GPS trail). */
  origin: { lat: number; lng: number };
}

export interface HuntLog {
  version: 1;
  active: ActiveHunt | null;
  /** Landmark ids already found; each one is hunted only once. */
  found: string[];
  /**
   * Every solved riddle, newest first. Kept whole (place, riddle, clues used) so the
   * atlas can later turn each one into a page of local lore.
   */
  solved: SolvedHunt[];
}

export interface SolvedHunt {
  landmark: Landmark;
  riddle: string;
  at: number;
  hints: number;
}

export function newHuntLog(): HuntLog {
  return { version: 1, active: null, found: [], solved: [] };
}

/**
 * Picks the next landmark to hunt from those nearby. Prefers a good walk away
 * (HUNT_MIN_M to HUNT_MAX_M) and never one already found.
 */
export function chooseLandmark(
  from: { lat: number; lng: number },
  candidates: Landmark[],
  found: Iterable<string>,
  rand: () => number = Math.random,
): Landmark | undefined {
  const seen = new Set(found);
  const fresh = candidates
    .filter((l) => !seen.has(l.id))
    .map((l) => ({ l, d: haversine(from, l) }))
    .filter(({ d }) => d >= HUNT_FLOOR_M && d <= HUNT_MAX_M);
  const ideal = fresh.filter(({ d }) => d >= HUNT_MIN_M);
  const pool = ideal.length ? ideal : fresh;
  if (!pool.length) return undefined;
  return pool[Math.floor(rand() * pool.length)].l;
}

export function startHunt(landmark: Landmark, from: { lat: number; lng: number }, now = Date.now()): ActiveHunt {
  const riddles = RIDDLES[landmark.category];
  const riddle = riddles[hashString(landmark.id) % riddles.length];
  const d = haversine(from, landmark);
  const origin = { lat: Number(from.lat.toFixed(3)), lng: Number(from.lng.toFixed(3)) };
  return { landmark, riddle, startedAt: now, startDistanceM: d, walkedM: 0, hints: 0, boughtHints: 0, lastDistanceM: d, origin };
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Compass bearing in degrees from one point to another. */
export function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  return ((Math.atan2(y, x) / rad) % 360 + 360) % 360;
}

export function compassPoint(degrees: number): string {
  return COMPASS[Math.round(degrees / 45) % 8];
}

/** "St Giles' Cathedral" → "S_ G_____' C_________". */
export function maskName(name: string): string {
  return name.replace(/\p{L}+/gu, (word) => word[0] + '_'.repeat(word.length - 1));
}

function letterCount(name: string): number {
  return (name.match(/\p{L}/gu) ?? []).length;
}

/** The clues uncovered so far: the riddle, then compass, then letters, then the masked name. */
export function huntClues(hunt: ActiveHunt): string[] {
  const { landmark, origin } = hunt;
  const clues = [hunt.riddle];
  if (hunt.hints >= 1) {
    const paces = Math.max(50, Math.round((haversine(origin, landmark) * 1.3) / 50) * 50);
    clues.push(`From where you set out, it lay to the ${compassPoint(bearing(origin, landmark))}, some ${paces} paces off. It is ${CATEGORY_TITLES[landmark.category]}.`);
  }
  if (hunt.hints >= 2) {
    const words = landmark.name.split(/\s+/).filter(Boolean).length;
    clues.push(
      `Its true name has ${letterCount(landmark.name)} letters${words > 1 ? ` across ${words} words` : ''}, and begins with “${landmark.name[0].toUpperCase()}”.`,
    );
  }
  if (hunt.hints >= 3) clues.push(`The old map reads: ${maskName(landmark.name)}`);
  return clues;
}

/** Hints the player is owed from walking, on top of any bought. */
export function hintsFromWalking(walkedM: number): number {
  return Math.floor(walkedM / HINT_WALK_M);
}

/**
 * Adds walked metres and unlocks hints earned by walking.
 * Returns how many new hints appeared.
 */
export function walkHunt(hunt: ActiveHunt, metres: number): number {
  hunt.walkedM += metres;
  const owed = Math.min(MAX_HINTS, hintsFromWalking(hunt.walkedM) + hunt.boughtHints);
  const fresh = Math.max(0, owed - hunt.hints);
  hunt.hints += fresh;
  return fresh;
}

export function buyHint(hunt: ActiveHunt): boolean {
  if (hunt.hints >= MAX_HINTS) return false;
  hunt.hints += 1;
  hunt.boughtHints += 1;
  return true;
}

/** Metres still to walk for the next free hint, or undefined when all are out. */
export function metresToNextHint(hunt: ActiveHunt): number | undefined {
  if (hunt.hints >= MAX_HINTS) return undefined;
  const walkingHints = hunt.hints - hunt.boughtHints;
  return Math.max(0, (walkingHints + 1) * HINT_WALK_M - hunt.walkedM);
}

/**
 * The search circle drawn on the map. Its centre is shifted from the landmark by a
 * seeded amount so the circle never gives the spot away, but it always contains it.
 */
export function searchArea(hunt: ActiveHunt): { lat: number; lng: number; radiusM: number } {
  const radiusM = SEARCH_RADII_M[Math.min(hunt.hints, MAX_HINTS)];
  const rand = seededRandom(hashString(`${hunt.landmark.id}:${hunt.hints}`));
  const shift = radiusM * 0.6 * Math.sqrt(rand());
  const angle = rand() * Math.PI * 2;
  const { lat, lng } = hunt.landmark;
  const dLat = (shift * Math.cos(angle)) / 111_320;
  const dLng = (shift * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng, radiusM };
}

export type Warmth = 'found' | 'burning' | 'hot' | 'warmer' | 'colder' | 'same';

export const WARMTH_TEXT: Record<Warmth, string> = {
  found: 'You are here!',
  burning: 'Burning hot!',
  hot: 'Very warm',
  warmer: 'Warmer',
  colder: 'Colder',
  same: 'Lukewarm',
};

/** How close the player is, and whether they moved closer since the last check. */
export function warmth(hunt: ActiveHunt, at: { lat: number; lng: number }, arriveM = ARRIVE_M): { warmth: Warmth; distanceM: number } {
  const d = haversine(at, hunt.landmark);
  const last = hunt.lastDistanceM ?? d;
  let w: Warmth;
  if (d <= arriveM) w = 'found';
  else if (d <= arriveM + 40) w = 'burning';
  else if (d <= arriveM + 110) w = 'hot';
  else if (d < last - 10) w = 'warmer';
  else if (d > last + 10) w = 'colder';
  else w = 'same';
  // Only move the reference point on a clear change, so GPS jitter does not flicker.
  if (Math.abs(d - last) > 10) hunt.lastDistanceM = d;
  return { warmth: w, distanceM: d };
}

export interface Treasure {
  coin: number;
  xp: number;
  wanderlight: number;
  /** Number of realm materials; the realm decides which. */
  materials: number;
  relic: boolean;
  /** Short title for the chest, by how few hints were used. */
  title: string;
}

const CHEST_TITLES = ['Gilded Chest', 'Iron-bound Chest', 'Oaken Chest', 'Battered Chest'];

/** The chest at the end of a hunt. Longer hunts and fewer hints pay more. */
export function rollTreasure(hunt: ActiveHunt): Treasure {
  const rand = seededRandom(hashString(`${hunt.landmark.id}:${hunt.startedAt}`));
  const skill = 1.6 - 0.2 * hunt.hints;
  const length = Math.max(hunt.startDistanceM, HUNT_FLOOR_M);
  return {
    coin: Math.round((30 + length / 12 + rand() * 20) * skill),
    xp: Math.round((150 + length / 3) * skill),
    wanderlight: hunt.hints <= 1 ? 3 : 1,
    materials: 2 + Math.floor(rand() * 3) + (hunt.hints === 0 ? 2 : 0),
    relic: hunt.hints <= 1 || rand() < 0.4,
    title: CHEST_TITLES[Math.min(hunt.hints, CHEST_TITLES.length - 1)],
  };
}

/** Marks the active hunt found and returns its treasure. */
export function finishHunt(log: HuntLog, now = Date.now()): Treasure | undefined {
  const hunt = log.active;
  if (!hunt) return undefined;
  const treasure = rollTreasure(hunt);
  log.active = null;
  if (!log.found.includes(hunt.landmark.id)) log.found.push(hunt.landmark.id);
  log.solved.unshift({ landmark: hunt.landmark, riddle: hunt.riddle, at: now, hints: hunt.hints });
  return treasure;
}

// ---- Storage ----

const KEY = 'wanderwild.hunts';
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseHuntLog(raw: unknown): HuntLog {
  const log = newHuntLog();
  if (!isObject(raw) || raw.version !== 1) return log;
  if (Array.isArray(raw.found)) log.found = raw.found.filter((s): s is string => typeof s === 'string');
  if (Array.isArray(raw.solved))
    log.solved = raw.solved.filter((e) => isObject(e) && isObject(e.landmark) && typeof e.riddle === 'string') as SolvedHunt[];
  const a = raw.active;
  if (isObject(a) && isObject(a.landmark) && isObject(a.origin) && typeof a.riddle === 'string') log.active = a as unknown as ActiveHunt;
  return log;
}

export function loadHuntLog(): HuntLog {
  try {
    const text = localStorage.getItem(KEY);
    return parseHuntLog(text ? JSON.parse(text) : null);
  } catch {
    return newHuntLog();
  }
}

export function saveHuntLog(log: HuntLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Nowhere to save; the hunt still works for this visit.
  }
}
