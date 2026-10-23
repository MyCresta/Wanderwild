import type { Map } from 'maplibre-gl';
import { distanceToLineM, pointInPolygon, realmFromFeatures, type FeatureTag, type RealmId } from '../game/realms';
import { shrineId, shrineKind, type Shrine } from '../game/shrines';
import { haversine } from '../geo/distance';

/**
 * Reads the vector tiles the map has already loaded to find out what is under a point
 * (for realms) and which points of interest are nearby (for shrines). Works on source
 * data, so it does not depend on which layers the map style happens to draw.
 */

const SOURCE = 'openmaptiles';
type SourceFeature = ReturnType<Map['querySourceFeatures']>[number];
const AREA_LAYERS = ['water', 'landuse', 'landcover', 'park'];
const NEAR_WATER_M = 30;

/**
 * MapLibre only keeps source layers that some style layer uses, so add invisible
 * layers for everything probed here. That way the map's look can change freely.
 */
export function installProbeLayers(map: Map): void {
  const add = () => {
    if (!map.getSource(SOURCE)) return;
    for (const layer of [...AREA_LAYERS, 'waterway', 'transportation']) {
      const id = `probe-${layer}`;
      if (map.getLayer(id)) continue;
      map.addLayer({ id, type: 'line', source: SOURCE, 'source-layer': layer, minzoom: 13, paint: { 'line-opacity': 0 } });
    }
    if (!map.getLayer('probe-poi'))
      map.addLayer({ id: 'probe-poi', type: 'circle', source: SOURCE, 'source-layer': 'poi', minzoom: 13, paint: { 'circle-opacity': 0, 'circle-radius': 1 } });
  };
  if (map.isStyleLoaded()) add();
  map.on('styledata', add);
}

const tag = (layer: string, f: SourceFeature): FeatureTag => ({
  layer,
  class: f.properties.class as string | undefined,
  subclass: f.properties.subclass as string | undefined,
});

function querySource(map: Map, sourceLayer: string): SourceFeature[] {
  if (!map.getSource(SOURCE)) return [];
  try {
    return map.querySourceFeatures(SOURCE, { sourceLayer });
  } catch {
    return [];
  }
}

/** The realm at a point, or undefined when no tiles are loaded there yet. */
export function realmAt(map: Map, lng: number, lat: number): RealmId | undefined {
  if (!map.getBounds().contains([lng, lat])) return undefined;
  const containing: FeatureTag[] = [];
  let sawAny = false;
  for (const layer of AREA_LAYERS) {
    for (const f of querySource(map, layer)) {
      sawAny = true;
      if (pointInPolygon(lng, lat, f.geometry)) containing.push(tag(layer, f));
    }
  }
  const nearWater = querySource(map, 'waterway').some((f) => {
    sawAny = true;
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    return lines.some((line) => distanceToLineM(lng, lat, line) < NEAR_WATER_M);
  });
  if (!sawAny && !querySource(map, 'transportation').length) return undefined;
  return realmFromFeatures(containing, nearWater);
}

/** Shrines within `radiusM` of a point, nearest first. */
export function shrinesNear(map: Map, lng: number, lat: number, radiusM: number, limit = 30): Shrine[] {
  const found = new globalThis.Map<string, Shrine & { d: number }>();
  for (const f of querySource(map, 'poi')) {
    if (f.geometry.type !== 'Point') continue;
    const kind = shrineKind(f.properties.class as string, f.properties.subclass as string);
    const name = (f.properties['name:latin'] ?? f.properties.name) as string | undefined;
    if (!kind || !name) continue;
    const [pLng, pLat] = f.geometry.coordinates;
    const d = haversine({ lat, lng }, { lat: pLat, lng: pLng });
    if (d > radiusM) continue;
    const id = shrineId(name, pLat, pLng);
    if (!found.has(id)) found.set(id, { id, name, kind, lat: pLat, lng: pLng, d });
  }
  return [...found.values()]
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ d: _d, ...shrine }) => shrine);
}
