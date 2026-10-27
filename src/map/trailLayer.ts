import { Marker, type GeoJSONSource, type Map } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { marksReached, type Trail } from '../game/trail';

/** Draws today's wander trail: three ink marks, the last one a chest, joined by a faint dotted loop. */

const MARK =
  '<path d="M16 4c-5 0-8 3.6-8 8 0 6 8 15 8 15s8-9 8-15c0-4.4-3-8-8-8z" fill="#8e2b22" stroke="#2a1d10" stroke-width="1.4"/><circle cx="16" cy="12" r="3" fill="#efe2c0"/>';
const DONE =
  '<path d="M16 4c-5 0-8 3.6-8 8 0 6 8 15 8 15s8-9 8-15c0-4.4-3-8-8-8z" fill="#8b8273" stroke="#2a1d10" stroke-width="1.4"/><path d="M12.5 12l2.5 2.5 4.5-5" fill="none" stroke="#efe2c0" stroke-width="1.8" stroke-linecap="round"/>';
const CHEST =
  '<rect x="7" y="14" width="18" height="11" rx="1.5" fill="#8a5a2b" stroke="#2a1d10" stroke-width="1.4"/><path d="M7 15q0-7 9-7t9 7z" fill="#a8743a" stroke="#2a1d10" stroke-width="1.4"/><path d="M7 15h18" stroke="#c9a24a" stroke-width="1.6"/><rect x="14.2" y="13.5" width="3.6" height="4.6" rx=".8" fill="#c9a24a" stroke="#2a1d10" stroke-width="1"/>';

const SOURCE = 'trail-line';
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export class TrailLayer {
  private markers: Marker[] = [];
  private shownKey = '';
  private line: FeatureCollection = empty();

  constructor(
    private readonly map: Map,
    private readonly onTap: (index: number) => void,
  ) {
    const install = () => this.install();
    if (map.isStyleLoaded()) install();
    map.on('styledata', install);
  }

  private install(): void {
    if (this.map.getSource(SOURCE)) return;
    this.map.addSource(SOURCE, { type: 'geojson', data: this.line });
    this.map.addLayer({
      id: SOURCE,
      type: 'line',
      source: SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#8e2b22', 'line-width': 2.5, 'line-opacity': 0.4, 'line-dasharray': [0.2, 2.4] },
    });
  }

  show(trail: Trail | null): void {
    const key = trail ? `${trail.day}:${trail.origin.lat}:${trail.marks.map((m) => m.reached ?? '-').join()}` : '';
    if (key === this.shownKey) return;
    this.shownKey = key;
    for (const m of this.markers) m.remove();
    this.markers = [];
    const open = trail && !trail.opened ? trail.marks.filter((m) => !m.reached).map((m) => [m.lng, m.lat]) : [];
    // The loop runs from where the trail was drawn through the marks still to reach.
    this.line =
      trail && open.length
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[trail.origin.lng, trail.origin.lat], ...open, [trail.origin.lng, trail.origin.lat]] } }] }
        : empty();
    (this.map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(this.line);
    if (!trail) return;
    const lastOne = marksReached(trail) === trail.marks.length - 1;
    trail.marks.forEach((mark, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `trail-marker${mark.reached ? ' trail-done' : ''}`;
      el.setAttribute('aria-label', mark.reached ? 'Trail mark, reached' : lastOne ? 'Trail chest' : 'Trail mark');
      el.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${mark.reached ? DONE : lastOne ? CHEST : MARK}</svg>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTap(i);
      });
      this.markers.push(new Marker({ element: el, anchor: 'bottom' }).setLngLat([mark.lng, mark.lat]).addTo(this.map));
    });
  }
}
