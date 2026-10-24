import { Marker, type Map } from 'maplibre-gl';
import { KIND_TITLES, type Shrine } from '../game/shrines';

const GLYPHS: Record<Shrine['kind'], string> = {
  chapel: '<path d="M16 6l6 6v12H10V12z" fill="#e8d9b5"/><path d="M16 9v6M13.5 11.5h5" stroke="#3b2a1a" stroke-width="1.6"/>',
  archive: '<path d="M9 11h14v12H9z" fill="#e8d9b5"/><path d="M11 14h10M11 17h10M11 20h7" stroke="#3b2a1a" stroke-width="1.3"/>',
  monument: '<path d="M14 8h4l1 13h-6z" fill="#e8d9b5"/><path d="M11 21h10v3H11z" fill="#e8d9b5"/>',
  vista: '<circle cx="16" cy="15" r="5" fill="#e8d9b5"/><path d="M8 24l5-6 3 3 3-4 5 7z" fill="#e8d9b5"/>',
  hall: '<path d="M8 13l8-5 8 5zM10 14h2v8h-2zM15 14h2v8h-2zM20 14h2v8h-2zM8 22h16v2H8z" fill="#e8d9b5"/>',
};

function shrineElement(shrine: Shrine): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'shrine-marker';
  el.setAttribute('aria-label', `${KIND_TITLES[shrine.kind]}: ${shrine.name}`);
  el.innerHTML = `<svg viewBox="0 0 32 40" aria-hidden="true">
    <path d="M16 39C9 30 3 24 3 16a13 13 0 0126 0c0 8-6 14-13 23z" fill="#2f6b55" stroke="#2a1d10" stroke-width="1.6"/>
    ${GLYPHS[shrine.kind]}
  </svg>`;
  return el;
}

/** Shows nearby wayshrines as tappable map pins. */
export class ShrineLayer {
  private markers = new globalThis.Map<string, { marker: Marker; el: HTMLElement }>();
  private inReach: (shrine: Shrine) => boolean = () => true;
  private shown: Shrine[] = [];

  constructor(
    private readonly map: Map,
    private readonly onTap: (shrine: Shrine) => void,
  ) {}

  /** Replaces the shown shrines; `coolingIds` are drawn faded. */
  set(shrines: Shrine[], coolingIds: Set<string>): void {
    this.shown = shrines;
    const keep = new Set(shrines.map((s) => s.id));
    for (const [id, { marker }] of this.markers) {
      if (!keep.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }
    for (const shrine of shrines) {
      let entry = this.markers.get(shrine.id);
      if (!entry) {
        const el = shrineElement(shrine);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onTap(shrine);
        });
        const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([shrine.lng, shrine.lat]).addTo(this.map);
        entry = { marker, el };
        this.markers.set(shrine.id, entry);
      }
      entry.el.classList.toggle('cooling', coolingIds.has(shrine.id));
    }
    this.markReach(this.inReach);
  }

  /** Dims shrines outside the reach ring, so the ring shows what can be touched. */
  markReach(inReach: (shrine: Shrine) => boolean): void {
    this.inReach = inReach;
    for (const shrine of this.shown) this.markers.get(shrine.id)?.el.classList.toggle('out-of-reach', !inReach(shrine));
  }
}
