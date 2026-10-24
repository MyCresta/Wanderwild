import type { Feature, Polygon } from 'geojson';
import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl';
import type { Fix } from '../geo/distance';

const ACCURACY_SOURCE = 'player-accuracy';
const REACH_SOURCE = 'player-reach';

/** Polygon approximating a circle of `radiusM` metres around a point. */
function circle(lng: number, lat: number, radiusM: number, steps = 48): Feature<Polygon> {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

function createTokenElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'player-token';
  el.setAttribute('aria-label', 'You are here');
  el.innerHTML = '<span class="player-rune"></span><span class="player-figure"></span>';
  return el;
}

/** The player's token on the map plus a soft circle showing GPS accuracy. */
export class PlayerMarker {
  private readonly marker: Marker;
  private placed = false;
  private last: Fix | null = null;
  private reachM = 0;

  constructor(private readonly map: Map) {
    this.marker = new Marker({ element: createTokenElement(), anchor: 'bottom' });
    const addLayers = () => {
      if (map.getSource(ACCURACY_SOURCE)) return;
      map.addSource(ACCURACY_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'player-accuracy-fill',
        type: 'fill',
        source: ACCURACY_SOURCE,
        paint: { 'fill-color': '#f3d27a', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'player-accuracy-edge',
        type: 'line',
        source: ACCURACY_SOURCE,
        paint: { 'line-color': '#a8772e', 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.6 },
      });
      // How far the player can reach creatures, shrines and curios, so "near" on screen matches the game.
      map.addSource(REACH_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'player-reach-fill',
        type: 'fill',
        source: REACH_SOURCE,
        paint: { 'fill-color': '#6b3fa0', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'player-reach-edge',
        type: 'line',
        source: REACH_SOURCE,
        paint: { 'line-color': '#6b3fa0', 'line-width': 3, 'line-opacity': 0.85 },
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

  update(fix: Fix): void {
    this.last = fix;
    this.marker.setLngLat([fix.lng, fix.lat]);
    if (!this.placed) {
      this.marker.addTo(this.map);
      this.placed = true;
    }
    const source = this.map.getSource<GeoJSONSource>(ACCURACY_SOURCE);
    source?.setData(circle(fix.lng, fix.lat, fix.accuracy));
    this.map
      .getSource<GeoJSONSource>(REACH_SOURCE)
      ?.setData(this.reachM > 0 ? circle(fix.lng, fix.lat, this.reachM, 72) : { type: 'FeatureCollection', features: [] });
  }
}
