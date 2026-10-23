import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';
import { haversine } from '../geo/distance';
import { landmarkCategory, landmarkId, type Landmark } from '../hunts/hunt';

/**
 * The treasure hunt on the map: a dashed, inked search circle around where the
 * landmark might be, and a red X once it is found. Also reads nearby landmarks
 * from the loaded vector tiles (the poi layer is kept alive by realmProbe).
 */

const SOURCE = 'hunt-area';
const OMT = 'openmaptiles';

function circle(lat: number, lng: number, radiusM: number, steps = 64): Feature<Polygon> {
  const ring: [number, number][] = [];
  const mPerLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + (radiusM * Math.sin(a)) / mPerLng, lat + (radiusM * Math.cos(a)) / 111_320]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export class HuntLayer {
  private area: Feature<Polygon> | null = null;
  private xMarker: Marker | null = null;

  constructor(private readonly map: Map) {
    const install = () => this.install();
    if (map.isStyleLoaded()) install();
    map.on('styledata', install);
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: this.data() });
    if (!map.getLayer('hunt-area-fill'))
      map.addLayer({
        id: 'hunt-area-fill',
        type: 'fill',
        source: SOURCE,
        paint: { 'fill-color': '#8a2d1c', 'fill-opacity': 0.1 },
      });
    if (!map.getLayer('hunt-area-line'))
      map.addLayer({
        id: 'hunt-area-line',
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': '#8a2d1c', 'line-width': 2.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
      });
  }

  private data(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: this.area ? [this.area] : [] };
  }

  /** Draws the search circle, or clears it with null. */
  setArea(area: { lat: number; lng: number; radiusM: number } | null): void {
    this.area = area ? circle(area.lat, area.lng, area.radiusM) : null;
    (this.map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(this.data());
  }

  /** Marks a found landmark with an inked X for a while. */
  markFound(landmark: Landmark, forMs = 120_000): void {
    this.xMarker?.remove();
    const el = document.createElement('div');
    el.className = 'hunt-x';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 40 40"><path d="M8 8l24 24M32 8L8 32" stroke="#8a2d1c" stroke-width="6" stroke-linecap="round"/></svg>`;
    const marker = new Marker({ element: el }).setLngLat([landmark.lng, landmark.lat]).addTo(this.map);
    this.xMarker = marker;
    setTimeout(() => {
      marker.remove();
      if (this.xMarker === marker) this.xMarker = null;
    }, forMs);
  }
}

/** Named landmarks within `radiusM` of a point, from the tiles already loaded. */
export function landmarksNear(map: Map, lat: number, lng: number, radiusM: number): Landmark[] {
  if (!map.getSource(OMT)) return [];
  let features: ReturnType<Map['querySourceFeatures']>;
  try {
    features = map.querySourceFeatures(OMT, { sourceLayer: 'poi' });
  } catch {
    return [];
  }
  const found = new globalThis.Map<string, Landmark>();
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue;
    const category = landmarkCategory(f.properties.class as string, f.properties.subclass as string);
    const name = (f.properties['name:latin'] ?? f.properties.name) as string | undefined;
    if (!category || !name || name.length < 3) continue;
    const [pLng, pLat] = f.geometry.coordinates;
    if (haversine({ lat, lng }, { lat: pLat, lng: pLng }) > radiusM) continue;
    const id = landmarkId(name, pLat, pLng);
    if (!found.has(id)) found.set(id, { id, name, category, lat: pLat, lng: pLng });
  }
  return [...found.values()];
}
