import { Marker, type Map } from 'maplibre-gl';
import type { Peddler } from '../game/peddler';

/** Draws today's wandering peddler: a striped tent with a lantern, gone once traded with. */

const TENT =
  '<path d="M4 27 16 6l12 21z" fill="#b8862f" stroke="#2a1d10" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M10 27 16 6l6 21" fill="#8e2b22" stroke="#2a1d10" stroke-width="1" stroke-linejoin="round"/>' +
  '<path d="M13.4 27 16 17l2.6 10z" fill="#2a1d10"/>' +
  '<path d="M16 6V3l4 1.4-4 1.4" fill="#efe2c0" stroke="#2a1d10" stroke-width=".9" stroke-linejoin="round"/>' +
  '<circle cx="25.5" cy="18" r="2.2" fill="#f6d27a" stroke="#2a1d10" stroke-width=".9"/>';

export class PeddlerLayer {
  private marker: Marker | null = null;
  private readonly el: HTMLButtonElement;
  private shownKey = '';

  constructor(
    private readonly map: Map,
    onTap: () => void,
  ) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'peddler-marker';
    this.el.setAttribute('aria-label', 'Wandering peddler');
    this.el.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${TENT}</svg>`;
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      onTap();
    });
  }

  show(peddler: Peddler | null): void {
    const key = peddler && !peddler.sold ? `${peddler.day}:${peddler.lat}:${peddler.lng}` : '';
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.marker?.remove();
    this.marker = null;
    if (peddler && key) this.marker = new Marker({ element: this.el, anchor: 'bottom' }).setLngLat([peddler.lng, peddler.lat]).addTo(this.map);
  }

  /** Dims the tent while it is beyond the reach ring. */
  markReach(inReach: boolean): void {
    this.el.classList.toggle('out-of-reach', !inReach);
  }
}
