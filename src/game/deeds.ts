import { ALL_SPECIES, PETS } from '../creatures/species';
import type { RealmId } from './realms';
import type { Rarity } from './spawns';

/**
 * Deeds are achievements: milestones for walking, exploring, binding and battling.
 * Many grant a title the Wayfarer can wear. Deeds only ever unlock, never relock,
 * so a deed earned stays earned even if, say, coin is later spent.
 */

export type DeedGroup = 'road' | 'explore' | 'bind' | 'battle' | 'wayfarer';

export const DEED_GROUPS: Record<DeedGroup, string> = {
  road: 'The Road',
  explore: 'Exploration',
  bind: 'Wildlings',
  battle: 'Blotspawn',
  wayfarer: 'The Wayfarer',
};

/** Everything a deed can be measured against, gathered from the save, the bestiary and the counters below. */
export interface DeedStats {
  distanceMetres: number;
  shrinesVisited: number;
  cellsWalked: number;
  wayfarerLevel: number;
  coin: number;
  wanderlight: number;
  /** Distinct Wildling species bound. */
  speciesBound: number;
  /** Distinct species (Wildlings and Blotspawn) met. */
  speciesSeen: number;
  /** Highest level of any bound Wildling. */
  bestPetLevel: number;
  /** Treasure-hunt riddles solved, and how many of them without a bought clue. */
  huntsSolved: number;
  huntsWithoutClues: number;
  counters: DeedCounters;
  deedsEarned: number;
}

/** Lifetime tallies only the deeds need. */
export interface DeedCounters {
  petsBound: number;
  blotspawnBanished: number;
  epicBound: number;
  legendaryBound: number;
  realms: RealmId[];
  /** Metres walked between 22:00 and 04:00, and between 05:00 and 08:00, local time. */
  nightMetres: number;
  dawnMetres: number;
  /** Local day (YYYY-MM-DD) the day tally belongs to. */
  day: string;
  dayMetres: number;
  bestDayMetres: number;
  /** Days in a row with at least STREAK_DAY_M walked, ending on `streakDay`. */
  streak: number;
  streakDay: string;
  bestStreak: number;
  /** Times of the latest shrine touches, for the Shrine Dash. */
  recentShrines: number[];
  shrinesSeen: number;
  /** One-off feats, e.g. "barrowsAtNight". */
  feats: string[];
}

export interface DeedsState {
  /** Deed id → time it was earned. */
  earned: Record<string, number>;
  /** Id of the deed whose title is worn, or null for none. */
  title: string | null;
  counters: DeedCounters;
}

export interface Deed {
  id: string;
  group: DeedGroup;
  name: string;
  /** What to do, shown before and after earning it. */
  text: string;
  /** Title it grants, worn as "Name, the Marathoner". */
  title?: string;
  /** Hidden until earned. */
  secret?: boolean;
  tier: 1 | 2 | 3 | 4;
  goal: number;
  progress: (s: DeedStats) => number;
  /** How to show progress, e.g. metres as km. */
  unit?: 'km';
}

export const STREAK_DAY_M = 1000;
export const SHRINE_DASH = { count: 3, withinMs: 15 * 60 * 1000 };
export const REALM_COUNT = 5;

export const TIER_REWARD: Record<Deed['tier'], { coin: number; xp: number }> = {
  1: { coin: 20, xp: 50 },
  2: { coin: 60, xp: 150 },
  3: { coin: 150, xp: 400 },
  4: { coin: 400, xp: 1000 },
};

const km = (n: number) => n * 1000;
const c = (s: DeedStats) => s.counters;

export const DEEDS: readonly Deed[] = [
  // The road
  { id: 'first-steps', group: 'road', name: 'First Steps', text: 'Walk 100 m.', tier: 1, goal: 100, progress: (s) => s.distanceMetres },
  { id: 'league', group: 'road', name: 'A League Behind You', text: 'Walk 5 km in all.', title: 'the Wanderer', tier: 1, goal: km(5), unit: 'km', progress: (s) => s.distanceMetres },
  { id: 'roadworn', group: 'road', name: 'Roadworn', text: 'Walk 10 km in all.', tier: 2, goal: km(10), unit: 'km', progress: (s) => s.distanceMetres },
  { id: 'marathon', group: 'road', name: 'Walked a Marathon', text: 'Walk 42.2 km in all.', title: 'the Marathoner', tier: 3, goal: 42195, unit: 'km', progress: (s) => s.distanceMetres },
  { id: 'centurion', group: 'road', name: 'Hundred-League Boots', text: 'Walk 100 km in all.', title: 'Centurion', tier: 3, goal: km(100), unit: 'km', progress: (s) => s.distanceMetres },
  { id: 'worldwalker', group: 'road', name: 'Worldwalker', text: 'Walk 500 km in all.', title: 'Worldwalker', tier: 4, goal: km(500), unit: 'km', progress: (s) => s.distanceMetres },
  { id: 'long-day', group: 'road', name: "A Long Day's Road", text: 'Walk 5 km in a single day.', tier: 2, goal: km(5), unit: 'km', progress: (s) => c(s).bestDayMetres },
  { id: 'tireless', group: 'road', name: 'Tireless', text: 'Walk 15 km in a single day.', title: 'the Tireless', tier: 3, goal: km(15), unit: 'km', progress: (s) => c(s).bestDayMetres },
  { id: 'streak-3', group: 'road', name: 'Three Dawns Running', text: 'Walk 1 km a day, 3 days in a row.', tier: 1, goal: 3, progress: (s) => c(s).bestStreak },
  { id: 'streak-7', group: 'road', name: 'A Week on the Road', text: 'Walk 1 km a day, 7 days in a row.', title: 'the Steadfast', tier: 2, goal: 7, progress: (s) => c(s).bestStreak },
  { id: 'streak-30', group: 'road', name: "Pilgrim's Month", text: 'Walk 1 km a day, 30 days in a row.', title: 'the Unwavering', tier: 4, goal: 30, progress: (s) => c(s).bestStreak },
  { id: 'night-owl', group: 'road', name: 'Night Owl', text: 'Walk 2 km between 10 pm and 4 am.', title: 'Night Owl', tier: 2, goal: km(2), unit: 'km', progress: (s) => c(s).nightMetres },
  { id: 'dawnstrider', group: 'road', name: 'Dawnstrider', text: 'Walk 2 km between 5 am and 8 am.', title: 'Dawnstrider', tier: 2, goal: km(2), unit: 'km', progress: (s) => c(s).dawnMetres },

  // Exploration
  { id: 'footloose', group: 'explore', name: 'Footloose', text: 'Walk through 50 map squares.', tier: 1, goal: 50, progress: (s) => s.cellsWalked },
  { id: 'cartographer', group: 'explore', name: 'Cartographer', text: 'Walk through 250 map squares.', title: 'the Cartographer', tier: 2, goal: 250, progress: (s) => s.cellsWalked },
  { id: 'mapmaker', group: 'explore', name: 'Mapmaker of Realms', text: 'Walk through 1,000 map squares.', title: 'the Mapmaker', tier: 3, goal: 1000, progress: (s) => s.cellsWalked },
  { id: 'realm-touched', group: 'explore', name: 'Realm-touched', text: 'Set foot in 3 different realms.', tier: 1, goal: 3, progress: (s) => c(s).realms.length },
  { id: 'realmwalker', group: 'explore', name: 'The Five Realms', text: 'Set foot in all 5 realms.', title: 'Realmwalker', tier: 3, goal: REALM_COUNT, progress: (s) => c(s).realms.length },
  { id: 'first-blessing', group: 'explore', name: 'First Blessing', text: 'Touch a wayshrine.', tier: 1, goal: 1, progress: (s) => s.shrinesVisited },
  { id: 'pilgrim', group: 'explore', name: 'Pilgrim', text: 'Touch wayshrines 10 times.', title: 'the Pilgrim', tier: 2, goal: 10, progress: (s) => s.shrinesVisited },
  { id: 'shrinekeeper', group: 'explore', name: 'Shrinekeeper', text: 'Touch wayshrines 50 times.', title: 'Shrinekeeper', tier: 3, goal: 50, progress: (s) => s.shrinesVisited },
  { id: 'riddle-solver', group: 'explore', name: 'Riddle Solver', text: 'Solve a treasure-hunt riddle.', tier: 1, goal: 1, progress: (s) => s.huntsSolved },
  { id: 'pathfinder', group: 'explore', name: 'Pathfinder', text: 'Solve 5 treasure-hunt riddles.', title: 'the Pathfinder', tier: 2, goal: 5, progress: (s) => s.huntsSolved },
  { id: 'riddle-keeper', group: 'explore', name: 'Keeper of Riddles', text: 'Solve 25 treasure-hunt riddles.', title: 'Keeper of Riddles', tier: 3, goal: 25, progress: (s) => s.huntsSolved },
  { id: 'sharp-eyed', group: 'explore', name: 'No Clues Needed', text: 'Solve a riddle without any extra clues.', title: 'the Sharp-eyed', secret: true, tier: 2, goal: 1, progress: (s) => s.huntsWithoutClues },
  { id: 'shrine-dash', group: 'explore', name: 'Shrine Dash', text: 'Touch 3 wayshrines within 15 minutes.', title: 'the Swift', secret: true, tier: 2, goal: 1, progress: (s) => +c(s).feats.includes('shrineDash') },
  { id: 'gravewalker', group: 'explore', name: 'Lantern in the Barrows', text: 'Enter the Barrows after dark.', title: 'Gravewalker', secret: true, tier: 2, goal: 1, progress: (s) => +c(s).feats.includes('barrowsAtNight') },

  // Wildlings
  { id: 'first-binding', group: 'bind', name: 'First Friend', text: 'Befriend a wild Wildling.', tier: 1, goal: 1, progress: (s) => c(s).petsBound },
  { id: 'beastbinder', group: 'bind', name: 'Beastfriend', text: 'Befriend 5 Wildlings.', title: 'Beastfriend', tier: 2, goal: 5, progress: (s) => c(s).petsBound },
  { id: 'menagerie', group: 'bind', name: 'A Full Band', text: 'Befriend 12 Wildlings.', title: 'Keeper of Beasts', tier: 3, goal: 12, progress: (s) => c(s).petsBound },
  { id: 'curious', group: 'bind', name: 'Curious Mind', text: 'Own 3 kinds of Wildling.', tier: 1, goal: 3, progress: (s) => s.speciesBound },
  { id: 'all-wildlings', group: 'bind', name: 'Every Wildling', text: `Own all ${PETS.length} kinds of Wildling.`, title: 'Loremaster', tier: 3, goal: PETS.length, progress: (s) => s.speciesBound },
  { id: 'inkbound-scholar', group: 'bind', name: 'Inkbound Scholar', text: `Meet all ${ALL_SPECIES.length} creatures of the bestiary.`, title: 'the Scholar', tier: 3, goal: ALL_SPECIES.length, progress: (s) => s.speciesSeen },
  { id: 'lucky-find', group: 'bind', name: 'Lucky Find', text: 'Befriend a rare Wildling.', tier: 2, goal: 1, progress: (s) => c(s).epicBound + c(s).legendaryBound },
  { id: 'legend-binder', group: 'bind', name: 'Gilded Bond', text: 'Befriend a Gilded Wildling.', title: 'the Gilded', tier: 4, goal: 1, progress: (s) => c(s).legendaryBound },
  { id: 'bonded', group: 'bind', name: 'Bonded', text: 'Raise a Wildling to level 10.', tier: 2, goal: 10, progress: (s) => s.bestPetLevel },
  { id: 'soulbound', group: 'bind', name: 'Soulbound', text: 'Raise a Wildling to level 25.', title: 'Soulbound', tier: 3, goal: 25, progress: (s) => s.bestPetLevel },

  // Blotspawn
  { id: 'blot-breaker', group: 'battle', name: 'Blot Breaker', text: 'Drive off a Blotspawn.', tier: 1, goal: 1, progress: (s) => c(s).blotspawnBanished },
  { id: 'blotbane', group: 'battle', name: 'Blotbane', text: 'Drive off 10 Blotspawn.', title: 'Blotbane', tier: 2, goal: 10, progress: (s) => c(s).blotspawnBanished },
  { id: 'ink-warden', group: 'battle', name: 'Warden of the Ink', text: 'Drive off 50 Blotspawn.', title: 'the Ink-Warden', tier: 3, goal: 50, progress: (s) => c(s).blotspawnBanished },
  { id: 'scourge', group: 'battle', name: 'Scourge of Blots', text: 'Drive off 200 Blotspawn.', title: 'Scourge of Blots', tier: 4, goal: 200, progress: (s) => c(s).blotspawnBanished },

  // The Wayfarer
  { id: 'level-5', group: 'wayfarer', name: 'Finding Your Feet', text: 'Reach Wayfarer level 5.', tier: 1, goal: 5, progress: (s) => s.wayfarerLevel },
  { id: 'level-10', group: 'wayfarer', name: 'Seasoned', text: 'Reach Wayfarer level 10.', title: 'the Seasoned', tier: 2, goal: 10, progress: (s) => s.wayfarerLevel },
  { id: 'level-20', group: 'wayfarer', name: 'Veteran of the Road', text: 'Reach Wayfarer level 20.', title: 'the Veteran', tier: 3, goal: 20, progress: (s) => s.wayfarerLevel },
  { id: 'level-50', group: 'wayfarer', name: 'Legend of the Road', text: 'Reach Wayfarer level 50.', title: 'the Legendary', tier: 4, goal: 50, progress: (s) => s.wayfarerLevel },
  { id: 'full-purse', group: 'wayfarer', name: 'A Full Purse', text: 'Hold 1,000 coin at once.', title: 'the Prosperous', tier: 2, goal: 1000, progress: (s) => s.coin },
  { id: 'lightbearer', group: 'wayfarer', name: 'Lightbearer', text: 'Hold 100 Wanderlight at once.', title: 'Lightbearer', tier: 2, goal: 100, progress: (s) => s.wanderlight },
  { id: 'renowned', group: 'wayfarer', name: 'Renowned', text: 'Earn 25 other deeds.', title: 'the Renowned', tier: 4, goal: 25, progress: (s) => s.deedsEarned },
];

const BY_ID = new Map(DEEDS.map((d) => [d.id, d]));
export const getDeed = (id: string) => BY_ID.get(id);

export function newCounters(): DeedCounters {
  return {
    petsBound: 0,
    blotspawnBanished: 0,
    epicBound: 0,
    legendaryBound: 0,
    realms: [],
    nightMetres: 0,
    dawnMetres: 0,
    day: '',
    dayMetres: 0,
    bestDayMetres: 0,
    streak: 0,
    streakDay: '',
    bestStreak: 0,
    recentShrines: [],
    shrinesSeen: -1,
    feats: [],
  };
}

export const newDeeds = (): DeedsState => ({ earned: {}, title: null, counters: newCounters() });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads deeds from a save of any age; anything missing or malformed gets a default. */
export function parseDeeds(raw: unknown): DeedsState {
  const fresh = newDeeds();
  if (!isObject(raw)) return fresh;
  const earned = isObject(raw.earned)
    ? Object.fromEntries(Object.entries(raw.earned).filter(([id, t]) => BY_ID.has(id) && typeof t === 'number'))
    : {};
  const rc = isObject(raw.counters) ? raw.counters : {};
  const counters = { ...fresh.counters };
  for (const key of Object.keys(counters) as (keyof DeedCounters)[]) {
    const v = rc[key];
    const def = counters[key];
    if (Array.isArray(def)) {
      const want = key === 'recentShrines' ? 'number' : 'string';
      if (Array.isArray(v)) (counters as Record<string, unknown>)[key] = v.filter((x) => typeof x === want);
    } else if (typeof v === typeof def && (typeof v !== 'number' || Number.isFinite(v))) {
      (counters as Record<string, unknown>)[key] = v;
    }
  }
  const title = typeof raw.title === 'string' && raw.title in earned && getDeed(raw.title)?.title ? raw.title : null;
  return { earned: earned as Record<string, number>, title, counters };
}

// ---- Counters ----

export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
}

const isNight = (hour: number) => hour >= 22 || hour < 4;
const isDawn = (hour: number) => hour >= 5 && hour < 8;

/** Adds a stretch of walking ending at `time` to the daily, streak and time-of-day tallies. */
export function recordWalk(c: DeedCounters, metres: number, time: number): void {
  if (!(metres > 0)) return;
  const hour = new Date(time).getHours();
  if (isNight(hour)) c.nightMetres += metres;
  if (isDawn(hour)) c.dawnMetres += metres;

  const today = dayKey(time);
  if (c.day !== today) {
    c.day = today;
    c.dayMetres = 0;
  }
  const before = c.dayMetres;
  c.dayMetres += metres;
  c.bestDayMetres = Math.max(c.bestDayMetres, c.dayMetres);
  if (before < STREAK_DAY_M && c.dayMetres >= STREAK_DAY_M && c.streakDay !== today) {
    c.streak = c.streakDay === previousDay(today) ? c.streak + 1 : 1;
    c.streakDay = today;
    c.bestStreak = Math.max(c.bestStreak, c.streak);
  }
}

/** Notes the realm under the player. Returns true if it is a new one. */
export function recordRealm(c: DeedCounters, realm: RealmId, time: number): boolean {
  if (realm === 'barrows' && isNight(new Date(time).getHours()) && !c.feats.includes('barrowsAtNight')) c.feats.push('barrowsAtNight');
  if (c.realms.includes(realm)) return false;
  c.realms.push(realm);
  return true;
}

/** A Wildling bound (`pet`) or a Blotspawn driven off (`monster`). */
export function recordWin(c: DeedCounters, kind: 'pet' | 'monster', rarity: Rarity): void {
  if (kind === 'monster') {
    c.blotspawnBanished++;
    return;
  }
  c.petsBound++;
  if (rarity === 'epic') c.epicBound++;
  if (rarity === 'legendary') c.legendaryBound++;
}

/** Watches the shrine visit count; each rise is a touch at `time`. */
export function recordShrines(c: DeedCounters, shrinesVisited: number, time: number): void {
  // The first look only takes the count, so shrines touched before deeds existed are not a dash.
  if (c.shrinesSeen < 0 || shrinesVisited < c.shrinesSeen) {
    c.shrinesSeen = shrinesVisited;
    return;
  }
  for (; c.shrinesSeen < shrinesVisited; c.shrinesSeen++) c.recentShrines.push(time);
  c.recentShrines = c.recentShrines.slice(-SHRINE_DASH.count);
  const [first] = c.recentShrines;
  if (c.recentShrines.length === SHRINE_DASH.count && time - first <= SHRINE_DASH.withinMs && !c.feats.includes('shrineDash'))
    c.feats.push('shrineDash');
}

// ---- Earning ----

export function deedProgress(deed: Deed, stats: DeedStats): number {
  return Math.min(1, Math.max(0, deed.progress(stats) / deed.goal));
}

/** Marks every deed whose goal is met as earned and returns the new ones, in list order. */
export function earnDeeds(state: DeedsState, stats: Omit<DeedStats, 'deedsEarned' | 'counters'>, now = Date.now()): Deed[] {
  const fresh: Deed[] = [];
  // Earning one deed can complete "Renowned", so look again until nothing changes.
  for (let changed = true; changed; ) {
    changed = false;
    const full: DeedStats = { ...stats, counters: state.counters, deedsEarned: Object.keys(state.earned).filter((id) => id !== 'renowned').length };
    for (const deed of DEEDS) {
      if (deed.id in state.earned || deed.progress(full) < deed.goal) continue;
      state.earned[deed.id] = now;
      fresh.push(deed);
      changed = true;
    }
  }
  return fresh;
}

/** The title worn, e.g. "the Marathoner", if any. */
export function wornTitle(state: DeedsState): string | undefined {
  return state.title ? getDeed(state.title)?.title : undefined;
}

export function wearTitle(state: DeedsState, deedId: string | null): boolean {
  if (deedId === null) {
    state.title = null;
    return true;
  }
  if (!(deedId in state.earned) || !getDeed(deedId)?.title) return false;
  state.title = deedId;
  return true;
}
