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
  el.innerHTML = `
    <span class="player-rune"></span>
    <svg class="player-figure" viewBox="0 0 40 48" aria-hidden="true">
      <path d="M20 3c-7 0-11 6-11 12 0 4 1 6 2 8l-5 20c4 2 9 3 14 3s10-1 14-3l-5-20c1-2 2-4 2-8 0-6-4-12-11-12z"
            fill="var(--cloak, #4b6a3c)" stroke="#2a1d10" stroke-width="2" stroke-linejoin="round"/>
      <path d="M13 16c2-5 12-5 14 0-1 5-3 8-7 8s-6-3-7-8z" fill="#2a1d10"/>
      <circle cx="17" cy="17" r="1.3" fill="#f3d27a"/><circle cx="23" cy="17" r="1.3" fill="#f3d27a"/>
      <path d="M31 10l3 34" stroke="#6b4a2a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="31" cy="9" r="2.6" fill="var(--staff, #f3d27a)" stroke="#2a1d10" stroke-width="1"/>
      <g class="player-lantern"><path d="M8 26v4" stroke="#2a1d10" stroke-width="1.4"/><rect x="5" y="30" width="6" height="8" rx="1.5" fill="#f3d27a" stroke="#2a1d10" stroke-width="1.2"/></g>
    </svg>`;
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

  /** Shows equipped gear on the token: cloak and staff colours, and a lantern when carried. */
  setLook(look: { cloak?: string; staff?: string; lantern?: boolean }): void {
    const el = this.marker.getElement();
    el.style.setProperty('--cloak', look.cloak ?? '#4b6a3c');
    el.style.setProperty('--staff', look.staff ?? '#f3d27a');
    el.classList.toggle('has-lantern', !!look.lantern);
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
