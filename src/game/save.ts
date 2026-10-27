import { BUILDING_IDS, newHearthstead, TONIC_CARRY, type HearthsteadState, type SupplyId } from './hearthstead';
import type { Expedition } from './expeditions';
import { MELT, RARITY_ORDER, RUNE_IDS, runeSockets, SLOT_DEFS, SLOTS, type GearItem, type GearRarity, type RuneId, type Slot } from './gear';
import { REALMS, type MaterialId, type RealmId } from './realms';
import type { Waymark } from './waymarks';
import type { GlyphKind } from './glyphs';
import { isHeroClass, LOOKS, METRES_PER_MANA, newHero, TALENTS, talentKey, type HeroState } from './hero';

/**
 * One versioned save holding all progress. It lives in IndexedDB (localStorage as a
 * fallback) and can be exported to a file and imported again, so progress survives
 * a phone change before there is any server.
 */

export const SAVE_VERSION = 5;

export interface SaveData {
  version: typeof SAVE_VERSION;
  createdAt: number;
  updatedAt: number;
  /** Total distance walked, in metres. */
  distanceMetres: number;
  /** Metres already turned into walking rewards; the rest is carried to the next 100 m. */
  rewardedMetres: number;
  wayfarer: { xp: number };
  /** The Wayfarer as a hero: class, looks, talents and mana. */
  hero: HeroState;
  currencies: { coin: number; wanderlight: number };
  materials: Partial<Record<MaterialId, number>>;
  /** Shrine id → time (ms) it can be used again. */
  shrineCooldowns: Record<string, number>;
  /** Shrines ever touched, for "visit a new shrine" goals later. */
  shrinesVisited: number;
  /** Time (ms) the current shrine blessing ends. */
  blessingUntil: number;
  /** Coarse ~50 m cells walked through, never a raw GPS trail. */
  visitedCells: string[];
  supplies: Record<SupplyId, number>;
  hearthstead: HearthsteadState;
  /** Owned by the creatures code; its shape is defined there. */
  pets: unknown[];
  /** The piece worn in each slot, with the slot's Forge upgrades and runes. */
  gear: Partial<Record<Slot, GearItem>>;
  /** Unsocketed runes. */
  runes: RuneId[];
  expeditions: Expedition[];
  /** Realms the Wayfarer has stood in, for expeditions. */
  realmsVisited: RealmId[];
  /** Corners tied by walking a Knot. */
  waymarks: Waymark[];
  glyphsCast: Record<GlyphKind, number>;
  /** Curio id → when it expires, for curios already picked up today. */
  curiosFound: Record<string, number>;
  /** Steps counted on `day` (a local date), for the daily step counter. */
  steps: { day: string; count: number };
}

export function newSave(now = Date.now(), distanceMetres = 0): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    distanceMetres,
    // Distance from before the save system existed is not paid out again.
    rewardedMetres: distanceMetres,
    wayfarer: { xp: 0 },
    hero: newHero(),
    currencies: { coin: 0, wanderlight: 0 },
    materials: {},
    shrineCooldowns: {},
    shrinesVisited: 0,
    blessingUntil: 0,
    visitedCells: [],
    supplies: { tonic: 0, petXp: 0 },
    hearthstead: newHearthstead(now),
    pets: [],
    gear: {},
    runes: [],
    expeditions: [],
    realmsVisited: [],
    waymarks: [],
    glyphsCast: { ring: 0, stroke: 0, knot: 0 },
    curiosFound: {},
    steps: { day: '', count: 0 },
  };
}

const isRune = (v: unknown): v is RuneId => RUNE_IDS.includes(v as RuneId);
const isRealm = (v: unknown): v is RealmId => typeof v === 'string' && v in REALMS;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Turns anything that was once saved (any older version, or a hand-edited file) into a
 * current save. Each migration step upgrades one version; unknown fields are dropped
 * and missing ones get defaults. Throws if the data is not a Wanderwild save at all.
 */
export function migrate(raw: unknown, now = Date.now()): SaveData {
  if (!isObject(raw) || typeof raw.version !== 'number') throw new Error('Not a Wanderwild save');
  if (raw.version > SAVE_VERSION) throw new Error('This save is from a newer version of Wanderwild');

  // Version 1 had no Hearthstead, supplies or eggs, and version 2 no gear, runes or
  // expeditions, and version 3 no Waymarks; the defaults below fill them in. Version 4
  // kept a list of crafted gear; parseGear folds it into one piece per slot.
  // Future migrations that rename or reshape fields go here, one version at a time.
  const fresh = newSave(now);
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  const numbers = (v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) : {};
  const currencies = isObject(raw.currencies) ? raw.currencies : {};
  const wayfarer = isObject(raw.wayfarer) ? raw.wayfarer : {};
  const supplies = isObject(raw.supplies) ? raw.supplies : {};
  const hearth = isObject(raw.hearthstead) ? raw.hearthstead : {};
  const buildings = isObject(hearth.buildings) ? hearth.buildings : {};
  const records = (v: unknown) => (Array.isArray(v) ? v.filter(isObject) : []);
  const gear = parseGear(raw, strings);
  return {
    ...fresh,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    distanceMetres: num(raw.distanceMetres),
    rewardedMetres: num(raw.rewardedMetres, num(raw.distanceMetres)),
    wayfarer: { xp: num(wayfarer.xp) },
    currencies: { coin: num(currencies.coin), wanderlight: num(currencies.wanderlight) },
    materials: addUp(numbers(raw.materials), gear.materials),
    shrineCooldowns: numbers(raw.shrineCooldowns) as Record<string, number>,
    shrinesVisited: num(raw.shrinesVisited),
    blessingUntil: num(raw.blessingUntil),
    visitedCells: strings(raw.visitedCells),
    // Tonics were once uncapped; old stockpiles shrink to what the satchel holds.
    supplies: { tonic: Math.min(TONIC_CARRY, num(supplies.tonic)), petXp: num(supplies.petXp) },
    hero: parseHero(raw.hero, num(raw.spellChargeM)),
    hearthstead: {
      buildings: Object.fromEntries(
        BUILDING_IDS.filter((id) => isObject(buildings[id])).map((id) => {
          const b = buildings[id] as Record<string, unknown>;
          return [id, { level: Math.max(1, num(b.level, 1)), progressMs: num(b.progressMs) }];
        }),
      ),
      lastTick: num(hearth.lastTick, now),
      strideDay: typeof hearth.strideDay === 'string' ? hearth.strideDay : '',
      strideUsedMs: num(hearth.strideUsedMs),
    },
    // Eggs and their hatchlings were retired (2026-10-26); old saves simply drop them.
    pets: Array.isArray(raw.pets) ? raw.pets : [],
    gear: gear.gear,
    runes: gear.runes,
    expeditions: records(raw.expeditions).map((e) => ({
      petUid: String(e.petUid),
      petLevel: num(e.petLevel, 1),
      realm: isRealm(e.realm) ? e.realm : 'hearthfields',
      startedAt: num(e.startedAt, now),
      durationMs: num(e.durationMs, 3_600_000),
      boostMs: num(e.boostMs),
    })),
    realmsVisited: strings(raw.realmsVisited).filter(isRealm),
    waymarks: records(raw.waymarks).map((w) => ({ id: String(w.id), lng: num(w.lng), lat: num(w.lat), setAt: num(w.setAt, now) })),
    glyphsCast: (() => {
      const g = isObject(raw.glyphsCast) ? raw.glyphsCast : {};
      return { ring: num(g.ring), stroke: num(g.stroke), knot: num(g.knot) };
    })(),
    curiosFound: numbers(raw.curiosFound) as Record<string, number>,
    steps: (() => {
      const st = isObject(raw.steps) ? raw.steps : {};
      return { day: typeof st.day === 'string' ? st.day : '', count: Math.max(0, num(st.count)) };
    })(),
  };
}

const addUp = (a: Partial<Record<MaterialId, number>>, b: Partial<Record<MaterialId, number>>) => {
  const sum = { ...a };
  for (const [id, n] of Object.entries(b) as [MaterialId, number][]) sum[id] = (sum[id] ?? 0) + n;
  return sum;
};

const isRarity = (v: unknown): v is GearRarity => RARITY_ORDER.includes(v as GearRarity);

/**
 * Reads gear back as one piece per slot. A version 4 list of crafted gear keeps the worn
 * piece in each slot with the highest upgrade any piece of that slot had, so nothing
 * spent at the Forge is lost; spare pieces melt into materials and their runes return.
 */
function parseGear(raw: Record<string, unknown>, strings: (v: unknown) => string[]) {
  const runes = strings(raw.runes).filter(isRune);
  const materials: Partial<Record<MaterialId, number>> = {};
  const gear: Partial<Record<Slot, GearItem>> = {};
  const clean = (g: Record<string, unknown>, slot: Slot): GearItem => ({
    slot,
    rarity: g.rarity as GearRarity,
    plus: Math.max(0, Math.min(10, Math.floor(num(g.plus)))),
    runes: strings(g.runes).filter(isRune),
  });
  if (Array.isArray(raw.gear)) {
    const equipped = isObject(raw.equipped) ? raw.equipped : {};
    const items = raw.gear.filter(isObject).filter((g) => SLOTS.includes(g.slot as Slot) && isRarity(g.rarity));
    for (const slot of SLOTS) {
      const mine = items.filter((g) => g.slot === slot);
      if (!mine.length) continue;
      const worn =
        mine.find((g) => g.id === equipped[slot]) ??
        mine.reduce((a, b) => (RARITY_ORDER.indexOf(b.rarity as GearRarity) > RARITY_ORDER.indexOf(a.rarity as GearRarity) ? b : a));
      const kept = clean(worn, slot);
      kept.plus = Math.max(...mine.map((g) => clean(g, slot).plus));
      const material = SLOT_DEFS[slot].material;
      for (const g of mine) {
        if (g === worn) continue;
        runes.push(...clean(g, slot).runes);
        materials[material] = (materials[material] ?? 0) + MELT[g.rarity as GearRarity];
      }
      gear[slot] = kept;
    }
  } else if (isObject(raw.gear)) {
    for (const slot of SLOTS) {
      const g = raw.gear[slot];
      if (isObject(g) && isRarity(g.rarity)) gear[slot] = clean(g, slot);
    }
  }
  // Runes beyond the open sockets go back to the bag.
  for (const item of Object.values(gear)) runes.push(...item.runes.splice(runeSockets(item)));
  return { gear, runes, materials };
}

/** Reads the hero back, or makes a new one; spell charge from before heroes becomes mana. */
function parseHero(raw: unknown, oldChargeM: number): HeroState {
  const hero = newHero();
  if (!isObject(raw)) return { ...hero, mana: Math.floor(oldChargeM / METRES_PER_MANA) };
  const cls = isHeroClass(raw.cls) ? raw.cls : null;
  const second = cls && isHeroClass(raw.second) && raw.second !== cls ? raw.second : null;
  const talents: HeroState['talents'] = {};
  const picks = isObject(raw.talents) ? raw.talents : {};
  for (const c of [cls, second]) {
    if (!c) continue;
    TALENTS[c].forEach((_, row) => {
      const pick = picks[talentKey(c, row)];
      if (pick === 0 || pick === 1) talents[talentKey(c, row)] = pick;
    });
  }
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 24) : hero.name,
    cls,
    second,
    look: Math.max(0, Math.min(LOOKS.warden.length - 1, Math.floor(num(raw.look)))),
    talents,
    mana: Math.max(0, num(raw.mana)),
  };
}

export function exportSave(save: SaveData): string {
  return JSON.stringify({ game: 'wanderwild', ...save }, null, 2);
}

export function importSave(text: string, now = Date.now()): SaveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Wanderwild save');
  }
  if (!isObject(parsed) || parsed.game !== 'wanderwild') throw new Error('That file is not a Wanderwild save');
  return migrate(parsed, now);
}

/** Drops cooldowns that have already passed so the save does not grow forever. */
export function pruneSave(save: SaveData, now = Date.now()): void {
  for (const [id, readyAt] of Object.entries(save.shrineCooldowns)) if (readyAt <= now) delete save.shrineCooldowns[id];
  for (const [id, until] of Object.entries(save.curiosFound)) if (until <= now) delete save.curiosFound[id];
}

// ---- Storage ----

const DB_NAME = 'wanderwild';
const STORE = 'saves';
const KEY = 'main';
const FALLBACK_KEY = 'wanderwild.save';
const LEGACY_DISTANCE_KEY = 'wanderwild.distanceMetres';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Loads the save, upgrading the old distance-only counter on first run. */
export async function loadSave(): Promise<SaveData> {
  let raw: unknown;
  try {
    raw = await idb<unknown>('readonly', (s) => s.get(KEY));
  } catch {
    // Fall through to localStorage.
  }
  if (raw === undefined) {
    const text = readLocal(FALLBACK_KEY);
    if (text) raw = JSON.parse(text);
  }
  if (raw !== undefined) {
    try {
      return migrate(raw);
    } catch (err) {
      console.warn('Ignoring unreadable save', err);
    }
  }
  return newSave(Date.now(), Number(readLocal(LEGACY_DISTANCE_KEY)) || 0);
}

export async function storeSave(save: SaveData): Promise<void> {
  save.updatedAt = Date.now();
  try {
    await idb('readwrite', (s) => s.put(structuredClone(save), KEY));
    return;
  } catch {
    // Private mode on some browsers blocks IndexedDB; keep a copy in localStorage instead.
  }
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(save));
  } catch {
    // Nowhere to save; progress still works for this visit.
  }
}
