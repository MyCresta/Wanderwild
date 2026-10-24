import type { GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { LngLat } from '../game/glyphs';
import type { Waymark } from '../game/waymarks';

/** Draws Glyphwalking on the map: Waymarks, and the trail being walked right now. */

const SOURCES = ['glyph-waymarks', 'glyph-trace'] as const;
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export class GlyphLayer {
  private data: Record<(typeof SOURCES)[number], FeatureCollection> = {
    'glyph-waymarks': empty(),
    'glyph-trace': empty(),
  };

  constructor(private readonly map: Map) {
    const install = () => this.install();
    if (map.isStyleLoaded()) install();
    map.on('styledata', install);
  }

  private install(): void {
    const map = this.map;
    if (map.getSource('glyph-trace')) return;
    for (const id of SOURCES) map.addSource(id, { type: 'geojson', data: this.data[id] });
    map.addLayer({
      id: 'glyph-trace',
      type: 'line',
      source: 'glyph-trace',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#3b2a1a', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [0.5, 1.8] },
    });
    map.addLayer({
      id: 'glyph-waymarks',
      type: 'circle',
      source: 'glyph-waymarks',
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

  showWaymarks(waymarks: Waymark[]): void {
    this.set('glyph-waymarks', {
      type: 'FeatureCollection',
      features: waymarks.map((w) => ({ type: 'Feature', properties: { id: w.id }, geometry: { type: 'Point', coordinates: [w.lng, w.lat] } })),
    });
  }

  showTrace(line: LngLat[]): void {
    this.set('glyph-trace', {
      type: 'FeatureCollection',
      features: line.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }] : [],
    });
  }
}
