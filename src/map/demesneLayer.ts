import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { inkAt, type LeyLine, type Parcel, type Waymark } from '../game/demesne';
import type { LngLat } from '../game/glyphs';

/**
 * Draws the Inked Demesne on the map: parcels as gold-inked land whose border fades with
 * its ink, live ley lines, Waymarks, and the trail being walked right now.
 */

const SOURCES = ['demesne-parcels', 'demesne-ley', 'demesne-waymarks', 'demesne-trace'] as const;
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export class DemesneLayer {
  private data: Record<(typeof SOURCES)[number], FeatureCollection> = {
    'demesne-parcels': empty(),
    'demesne-ley': empty(),
    'demesne-waymarks': empty(),
    'demesne-trace': empty(),
  };

  constructor(
    private readonly map: Map,
    onParcelTap?: (id: string) => void,
  ) {
    const install = () => this.install();
    if (map.isStyleLoaded()) install();
    map.on('styledata', install);
    if (onParcelTap)
      map.on('click', 'demesne-fill', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onParcelTap(id);
      });
  }

  private install(): void {
    const map = this.map;
    if (map.getSource('demesne-parcels')) return;
    for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: this.data[id] });
    map.addLayer({
      id: 'demesne-fill',
      type: 'fill',
      source: 'demesne-parcels',
      paint: { 'fill-color': '#d9a441', 'fill-opacity': ['+', 0.04, ['*', 0.22, ['get', 'ink']]] },
    });
    map.addLayer({
      id: 'demesne-border',
      type: 'line',
      source: 'demesne-parcels',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#7a4b12',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 18, 4],
        'line-opacity': ['+', 0.2, ['*', 0.8, ['get', 'ink']]],
        'line-dasharray': [3, 1.5],
      },
    });
    map.addLayer({
      id: 'demesne-name',
      type: 'symbol',
      source: 'demesne-parcels',
      minzoom: 14,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-font': ['IM Fell English Italic'],
        'text-size': 13,
        'symbol-spacing': 400,
      },
      paint: { 'text-color': '#5b3a10', 'text-halo-color': '#f3e6c4', 'text-halo-width': 1.4, 'text-opacity': ['+', 0.3, ['*', 0.7, ['get', 'ink']]] },
    });
    map.addLayer({
      id: 'demesne-ley-glow',
      type: 'line',
      source: 'demesne-ley',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#9be7ff', 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.45 },
    });
    map.addLayer({
      id: 'demesne-ley',
      type: 'line',
      source: 'demesne-ley',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#e9fbff', 'line-width': 2, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: 'demesne-trace',
      type: 'line',
      source: 'demesne-trace',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#3b2a1a', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [0.5, 1.8] },
    });
    map.addLayer({
      id: 'demesne-waymarks',
      type: 'circle',
      source: 'demesne-waymarks',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 18, 11],
        'circle-color': 'rgba(217,164,65,0.35)',
        'circle-stroke-color': '#7a4b12',
        'circle-stroke-width': 2.5,
      },
    });
  }

  private set(id: (typeof SOURCES)[number], data: FeatureCollection): void {
    this.data[id] = data;
    (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  show(parcels: Parcel[], leyLines: LeyLine[], waymarks: Waymark[], now = Date.now()): void {
    this.set('demesne-parcels', {
      type: 'FeatureCollection',
      features: parcels.map((p) => ({
        type: 'Feature',
        properties: { id: p.id, name: p.name, ink: Math.round(inkAt(p, now) * 100) / 100 },
        geometry: { type: 'Polygon', coordinates: [[...p.polygon, p.polygon[0]]] },
      })),
    });
    this.set('demesne-ley', {
      type: 'FeatureCollection',
      features: leyLines
        .filter((l) => l.until > now)
        .map((l) => ({ type: 'Feature', properties: { id: l.id }, geometry: { type: 'LineString', coordinates: [l.from, l.to] } })),
    });
    this.set('demesne-waymarks', {
      type: 'FeatureCollection',
      features: waymarks.map((w) => ({ type: 'Feature', properties: { id: w.id }, geometry: { type: 'Point', coordinates: [w.lng, w.lat] } })),
    });
  }

  showTrace(line: LngLat[]): void {
    this.set('demesne-trace', {
      type: 'FeatureCollection',
      features: line.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }] : [],
    });
  }
}
