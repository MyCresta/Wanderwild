import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl';
import type { Fix } from '../geo/distance';
import { FONT_REGULAR } from './fantasyStyle';

const REACH_SOURCE = 'player-reach';
const COMPASS_SOURCE = 'player-compass';
const FARSIGHT_SOURCE = 'player-farsight';
const RING = '#6b3fa0';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** The point `radiusM` metres from a centre, `deg` degrees clockwise from north. */
function offset(lng: number, lat: number, radiusM: number, deg: number): [number, number] {
  const dLat = radiusM / 111_320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const t = (deg * Math.PI) / 180;
  return [lng + dLng * Math.sin(t), lat + dLat * Math.cos(t)];
}

/** Polygon approximating a circle of `radiusM` metres around a point. */
function circle(lng: number, lat: number, radiusM: number, steps = 72): Feature<Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) coords.push(offset(lng, lat, radiusM, (i / steps) * 360));
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

/** Small ticks across the ring at north, east, south and west, with a letter just outside each. */
function compass(lng: number, lat: number, radiusM: number): FeatureCollection<LineString | Point> {
  const tick = radiusM * 0.08;
  const features: Feature<LineString | Point>[] = [];
  ['N', 'E', 'S', 'W'].forEach((letter, i) => {
    const deg = i * 90;
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [offset(lng, lat, radiusM - tick, deg), offset(lng, lat, radiusM + tick, deg)] },
    });
    features.push({ type: 'Feature', properties: { letter }, geometry: { type: 'Point', coordinates: offset(lng, lat, radiusM + tick * 2.6, deg) } });
  });
  return { type: 'FeatureCollection', features };
}

function createTokenElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'player-token';
  el.setAttribute('aria-label', 'You are here');
  el.innerHTML = '<span class="player-rune"></span><span class="player-figure"></span>';
  return el;
}

/**
 * The player's token on the map, the one purple reach ring (with N, E, S and W marked on it,
 * so they turn with the camera) and, in Farsight, the dashed edge of how far the eye can roam.
 */
export class PlayerMarker {
  private readonly marker: Marker;
  private placed = false;
  private last: Fix | null = null;
  private reachM = 0;
  private farsightM = 0;

  constructor(private readonly map: Map) {
    this.marker = new Marker({ element: createTokenElement(), anchor: 'bottom' });
    const addLayers = () => {
      if (map.getSource(REACH_SOURCE)) return;
      map.addSource(FARSIGHT_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'player-farsight-edge',
        type: 'line',
        source: FARSIGHT_SOURCE,
        paint: { 'line-color': RING, 'line-width': 2, 'line-dasharray': [3, 3], 'line-opacity': 0.7 },
      });
      // How far the player can reach creatures, shrines, curios and hunts, so "near" on screen matches the game.
      map.addSource(REACH_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'player-reach-fill',
        type: 'fill',
        source: REACH_SOURCE,
        paint: { 'fill-color': RING, 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'player-reach-edge',
        type: 'line',
        source: REACH_SOURCE,
        paint: { 'line-color': RING, 'line-width': 3, 'line-opacity': 0.85 },
      });
      map.addSource(COMPASS_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'player-compass-ticks',
        type: 'line',
        source: COMPASS_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': RING, 'line-width': 3, 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'player-compass-letters',
        type: 'symbol',
        source: COMPASS_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', 'letter'],
          'text-font': FONT_REGULAR,
          'text-size': 13,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': RING, 'text-halo-color': '#f4e8c8', 'text-halo-width': 1.6 },
      });
      if (this.last) this.update(this.last);
    };
    if (map.isStyleLoaded()) addLayers();
    else map.once('load', addLayers);
  }

  /** Draws the hero on the token; `svg` is trusted markup. */
  setFigure(svg: string): void {
    const figure = this.marker.getElement().querySelector('.player-figure')!;
    if (figure.innerHTML !== svg) figure.innerHTML = svg;
  }

  /** Radius of the reach ring in metres; 0 hides it. */
  setReach(metres: number): void {
    if (metres === this.reachM) return;
    this.reachM = metres;
    if (this.last) this.update(this.last);
  }

  /** Radius Farsight may roam from the Wayfarer; 0 hides its edge. */
  setFarsight(metres: number): void {
    if (metres === this.farsightM) return;
    this.farsightM = metres;
    if (this.last) this.update(this.last);
  }

  update(fix: Fix): void {
    this.last = fix;
    this.marker.setLngLat([fix.lng, fix.lat]);
    if (!this.placed) {
      this.marker.addTo(this.map);
      this.placed = true;
    }
    const set = (id: string, data: Feature | FeatureCollection) => this.map.getSource<GeoJSONSource>(id)?.setData(data);
    set(REACH_SOURCE, this.reachM > 0 ? circle(fix.lng, fix.lat, this.reachM) : EMPTY);
    set(COMPASS_SOURCE, this.reachM > 0 ? compass(fix.lng, fix.lat, this.reachM) : EMPTY);
    set(FARSIGHT_SOURCE, this.farsightM > 0 ? circle(fix.lng, fix.lat, this.farsightM, 120) : EMPTY);
  }
}
