import type { Geometry } from 'geojson';

/**
 * Real places become realms. The map features under the player (OpenMapTiles
 * layers and classes) decide which realm they are standing in, and the realm
 * decides what spawns there and which material it yields.
 */

export type RealmId = 'wildwood' | 'tidemere' | 'stoneward' | 'barrows' | 'hearthfields';

export interface Realm {
  id: RealmId;
  name: string;
  /** Short line shown on the realm banner. */
  flavour: string;
  material: MaterialId;
  /** Banner and marker tint. */
  color: string;
}

export type MaterialId = 'ironbark' | 'mistwool' | 'cobbleOre' | 'gravemoss' | 'hearthgrain' | 'shrineRelic';

export const MATERIALS: Record<MaterialId, { name: string; from: string }> = {
  ironbark: { name: 'Ironbark', from: 'parks and forests' },
  mistwool: { name: 'Mistwool', from: 'rivers and shores' },
  cobbleOre: { name: 'Cobble ore', from: 'streets and old town' },
  gravemoss: { name: 'Gravemoss', from: 'cemeteries' },
  hearthgrain: { name: 'Hearthgrain', from: 'homes and fields' },
  shrineRelic: { name: 'Shrine relic', from: 'any wayshrine' },
};

export const REALMS: Record<RealmId, Realm> = {
  wildwood: {
    id: 'wildwood',
    name: 'the Wildwood',
    flavour: 'Old trees whisper. Bramble kin roam here.',
    material: 'ironbark',
    color: '#4f6b3a',
  },
  tidemere: {
    id: 'tidemere',
    name: 'Tidemere',
    flavour: 'Mist rolls off the water. Tide kin gather.',
    material: 'mistwool',
    color: '#3f6f7a',
  },
  stoneward: {
    id: 'stoneward',
    name: 'the Stoneward',
    flavour: 'Cobbles and crooked towers. Ember kin lurk in the forges.',
    material: 'cobbleOre',
    color: '#7a5a3a',
  },
  barrows: {
    id: 'barrows',
    name: 'the Barrows',
    flavour: 'Quiet stones and older things. Tread softly.',
    material: 'gravemoss',
    color: '#5a4a66',
  },
  hearthfields: {
    id: 'hearthfields',
    name: 'the Hearthfields',
    flavour: 'Chimney smoke and garden walls. Gale kin ride the breeze.',
    material: 'hearthgrain',
    color: '#9a6a12',
  },
};

/** A map feature reduced to what realm detection needs. */
export interface FeatureTag {
  /** OpenMapTiles source layer, e.g. "landuse", "landcover", "park", "water". */
  layer: string;
  class?: string;
  subclass?: string;
}

const WILD_LANDCOVER = new Set(['wood', 'forest', 'grass', 'wetland', 'scrub', 'heath']);
const WILD_LANDUSE = new Set(['park', 'garden', 'nature_reserve', 'recreation_ground', 'playground', 'allotments']);
const STONE_LANDUSE = new Set(['commercial', 'retail', 'industrial', 'railway', 'quarry', 'university', 'college']);
const GRAVE_CLASSES = new Set(['cemetery', 'grave_yard']);

/**
 * Picks the realm for a spot from the features that contain it. More specific
 * places win over general ones: water, then graves, then green spaces, then
 * busy streets, falling back to the Hearthfields.
 */
export function realmFromFeatures(features: FeatureTag[], nearWater = false): RealmId {
  const has = (test: (f: FeatureTag) => boolean) => features.some(test);
  if (nearWater || has((f) => f.layer === 'water')) return 'tidemere';
  if (has((f) => GRAVE_CLASSES.has(f.class ?? '') || GRAVE_CLASSES.has(f.subclass ?? ''))) return 'barrows';
  if (
    has(
      (f) =>
        f.layer === 'park' ||
        (f.layer === 'landcover' && WILD_LANDCOVER.has(f.class ?? '')) ||
        (f.layer === 'landuse' && WILD_LANDUSE.has(f.class ?? '')),
    )
  )
    return 'wildwood';
  if (has((f) => f.layer === 'landuse' && STONE_LANDUSE.has(f.class ?? ''))) return 'stoneward';
  return 'hearthfields';
}

type Ring = number[][];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd point-in-polygon test for GeoJSON Polygon and MultiPolygon coordinates. */
export function pointInPolygon(lng: number, lat: number, geometry: Geometry): boolean {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as Ring[]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as Ring[][])
        : [];
  return polygons.some((rings) => {
    if (!rings.length || !pointInRing(lng, lat, rings[0])) return false;
    return !rings.slice(1).some((hole) => pointInRing(lng, lat, hole));
  });
}

/** Distance in metres from a point to the nearest vertex-to-vertex segment of a line. */
export function distanceToLineM(lng: number, lat: number, line: number[][]): number {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_574;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - lng) * kx;
    const ay = (line[i - 1][1] - lat) * ky;
    const bx = (line[i][0] - lng) * kx;
    const by = (line[i][1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
