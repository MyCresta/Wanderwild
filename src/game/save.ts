import type { Egg, Hatchling } from './eggs';
import { BUILDING_IDS, newHearthstead, type HearthsteadState, type SupplyId } from './hearthstead';
import type { Expedition } from './expeditions';
import { RUNE_IDS, SLOTS, type GearItem, type GearRarity, type RuneId, type Slot } from './gear';
import { REALMS, type MaterialId, type RealmId } from './realms';
import type { LeyLine, Parcel, Waymark } from './demesne';
import type { GlyphKind, LngLat } from './glyphs';

/**
 * One versioned save holding all progress. It lives in IndexedDB (localStorage as a
 * fallback) and can be exported to a file and imported again, so progress survives
 * a phone change before there is any server.
 */

export const SAVE_VERSION = 4;

export interface SaveData {
  version: typeof SAVE_VERSION;
  createdAt: number;
  updatedAt: number;
  /** Total distance walked, in metres. */
  distanceMetres: number;
  /** Metres already turned into walking rewards; the rest is carried to the next 100 m. */
  rewardedMetres: number;
  wayfarer: { xp: number };
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
  /** Metres walked since the last spell, capped at SPELL_CHARGE_MAX_M. */
  spellChargeM: number;
  hearthstead: HearthsteadState;
  eggs: Egg[];
  /** Hatched creatures waiting for the creatures code to add them to the roster. */
  hatchlings: Hatchling[];
  /** Owned by the creatures code; its shape is defined there. */
  pets: unknown[];
  gear: GearItem[];
  equipped: Partial<Record<Slot, string>>;
  /** Unsocketed runes. */
  runes: RuneId[];
  expeditions: Expedition[];
  /** Realms the Wayfarer has stood in, for expeditions. */
  realmsVisited: RealmId[];
  /** The Inked Demesne: parcels claimed by walking Rings. */
  parcels: Parcel[];
  leyLines: LeyLine[];
  waymarks: Waymark[];
  glyphsCast: Record<GlyphKind, number>;
  /** Curio id → when it expires, for curios already picked up today. */
  curiosFound: Record<string, number>;
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
    currencies: { coin: 0, wanderlight: 0 },
    materials: {},
    shrineCooldowns: {},
    shrinesVisited: 0,
    blessingUntil: 0,
    visitedCells: [],
    supplies: { tonic: 0, petXp: 0 },
    spellChargeM: 0,
    hearthstead: newHearthstead(now),
    eggs: [],
    hatchlings: [],
    pets: [],
    gear: [],
    equipped: {},
    runes: [],
    expeditions: [],
    realmsVisited: [],
    parcels: [],
    leyLines: [],
    waymarks: [],
    glyphsCast: { ring: 0, stroke: 0, knot: 0 },
    curiosFound: {},
  };
}

const isRune = (v: unknown): v is RuneId => RUNE_IDS.includes(v as RuneId);
const isRealm = (v: unknown): v is RealmId => typeof v === 'string' && v in REALMS;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const lngLats = (v: unknown): LngLat[] =>
  Array.isArray(v)
    ? v.filter((p): p is LngLat => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
    : [];

/**
 * Turns anything that was once saved (any older version, or a hand-edited file) into a
 * current save. Each migration step upgrades one version; unknown fields are dropped
 * and missing ones get defaults. Throws if the data is not a Wanderwild save at all.
 */
export function migrate(raw: unknown, now = Date.now()): SaveData {
  if (!isObject(raw) || typeof raw.version !== 'number') throw new Error('Not a Wanderwild save');
  if (raw.version > SAVE_VERSION) throw new Error('This save is from a newer version of Wanderwild');

  // Version 1 had no Hearthstead, supplies or eggs, and version 2 no gear, runes or
  // expeditions, and version 3 no Demesne; the defaults below fill them in.
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
  return {
    ...fresh,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    distanceMetres: num(raw.distanceMetres),
    rewardedMetres: num(raw.rewardedMetres, num(raw.distanceMetres)),
    wayfarer: { xp: num(wayfarer.xp) },
    currencies: { coin: num(currencies.coin), wanderlight: num(currencies.wanderlight) },
    materials: numbers(raw.materials),
    shrineCooldowns: numbers(raw.shrineCooldowns) as Record<string, number>,
    shrinesVisited: num(raw.shrinesVisited),
    blessingUntil: num(raw.blessingUntil),
    visitedCells: strings(raw.visitedCells),
    supplies: { tonic: num(supplies.tonic), petXp: num(supplies.petXp) },
    spellChargeM: num(raw.spellChargeM),
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
    eggs: records(raw.eggs).map((e) => ({
      id: String(e.id),
      km: ([2, 5, 10].includes(e.km as number) ? e.km : 2) as Egg['km'],
      seed: num(e.seed),
      walkedM: num(e.walkedM),
      foundAt: num(e.foundAt, now),
    })),
    hatchlings: records(raw.hatchlings) as unknown as Hatchling[],
    pets: Array.isArray(raw.pets) ? raw.pets : [],
    gear: records(raw.gear)
      .filter((g) => SLOTS.includes(g.slot as Slot) && ['worn', 'fine', 'rare', 'mythic', 'relic'].includes(g.rarity as string))
      .map((g) => ({
        id: String(g.id),
        slot: g.slot as Slot,
        rarity: g.rarity as GearRarity,
        plus: Math.max(0, Math.min(10, num(g.plus))),
        runes: strings(g.runes).filter(isRune),
      })),
    equipped: isObject(raw.equipped)
      ? Object.fromEntries(Object.entries(raw.equipped).filter(([k, v]) => SLOTS.includes(k as Slot) && typeof v === 'string'))
      : {},
    runes: strings(raw.runes).filter(isRune),
    expeditions: records(raw.expeditions).map((e) => ({
      petUid: String(e.petUid),
      petLevel: num(e.petLevel, 1),
      realm: isRealm(e.realm) ? e.realm : 'hearthfields',
      startedAt: num(e.startedAt, now),
      durationMs: num(e.durationMs, 3_600_000),
      boostMs: num(e.boostMs),
    })),
    realmsVisited: strings(raw.realmsVisited).filter(isRealm),
    parcels: records(raw.parcels)
      .map((p) => ({
        id: String(p.id),
        name: String(p.name ?? 'Nameless Holding'),
        polygon: lngLats(p.polygon),
        centroid: (lngLats([p.centroid])[0] ?? [0, 0]) as LngLat,
        areaM2: num(p.areaM2),
        perimeterM: num(p.perimeterM),
        realms: isObject(p.realms) ? Object.fromEntries(Object.entries(numbers(p.realms)).filter(([r]) => isRealm(r))) : {},
        claimedAt: num(p.claimedAt, now),
        inkedAt: num(p.inkedAt, now),
        lastTick: num(p.lastTick, now),
        stored: numbers(p.stored),
        residents: strings(p.residents),
      }))
      .filter((p) => p.polygon.length >= 3),
    leyLines: records(raw.leyLines)
      .map((l) => ({ id: String(l.id), from: lngLats([l.from])[0], to: lngLats([l.to])[0], until: num(l.until) }))
      .filter((l): l is LeyLine => !!l.from && !!l.to),
    waymarks: records(raw.waymarks).map((w) => ({ id: String(w.id), lng: num(w.lng), lat: num(w.lat), setAt: num(w.setAt, now) })),
    glyphsCast: (() => {
      const g = isObject(raw.glyphsCast) ? raw.glyphsCast : {};
      return { ring: num(g.ring), stroke: num(g.stroke), knot: num(g.knot) };
    })(),
    curiosFound: numbers(raw.curiosFound) as Record<string, number>,
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
  save.leyLines = save.leyLines.filter((l) => l.until > now);
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
