import { Marker, type Map } from 'maplibre-gl';
import { CURIO_KINDS, type Curio, type CurioKind } from '../game/farsight';

const ICONS: Record<CurioKind, string> = {
  cache: '<path d="M10 14q6-6 12 0l2 10H8z" fill="#c9a24a" stroke="#2a1d10" stroke-width="1.4"/><path d="M12 13q4-3 8 0" fill="none" stroke="#2a1d10" stroke-width="1.4"/><circle cx="16" cy="19" r="2" fill="#2a1d10"/>',
  bundle: '<path d="M9 12h14l-2 12H11z" fill="#7a8f4a" stroke="#2a1d10" stroke-width="1.4"/><path d="M9 16h14" stroke="#e8d9b5" stroke-width="1.6"/><path d="M14 8q2 3 4 0" fill="none" stroke="#2a1d10" stroke-width="1.4"/>',
  page: '<path d="M10 8h10l3 3v14H10z" fill="#efe2c0" stroke="#2a1d10" stroke-width="1.4"/><path d="M12 14l4 3 4-5M12 20h8" fill="none" stroke="#8e2b22" stroke-width="1.4"/>',
  cairn: '<ellipse cx="16" cy="23" rx="8" ry="3" fill="#8b8273" stroke="#2a1d10" stroke-width="1.2"/><ellipse cx="16" cy="18" rx="6" ry="2.6" fill="#a39a88" stroke="#2a1d10" stroke-width="1.2"/><circle cx="16" cy="12" r="3.4" fill="#6b4fa0" stroke="#2a1d10" stroke-width="1.2"/>',
};

/** Today's curios as small tappable finds on the map. */
export class CurioLayer {
  private markers = new globalThis.Map<string, { marker: Marker; curio: Curio }>();
  private inReach: (curio: Curio) => boolean = () => true;

  constructor(
    private readonly map: Map,
    private readonly onTap: (curio: Curio) => void,
  ) {}

  show(curios: Curio[]): void {
    const keep = new Set(curios.map((c) => c.id));
    for (const [id, { marker }] of this.markers)
      if (!keep.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    for (const curio of curios) {
      if (this.markers.has(curio.id)) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `curio-marker curio-${curio.kind}`;
      el.setAttribute('aria-label', CURIO_KINDS[curio.kind].name);
      el.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[curio.kind]}</svg>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTap(curio);
      });
      this.markers.set(curio.id, { marker: new Marker({ element: el, anchor: 'bottom' }).setLngLat([curio.lng, curio.lat]).addTo(this.map), curio });
    }
    this.markReach(this.inReach);
  }

  /** Dims curios outside the reach ring, so the ring shows what can be picked up. */
  markReach(inReach: (curio: Curio) => boolean): void {
    this.inReach = inReach;
    for (const { marker, curio } of this.markers.values()) marker.getElement().classList.toggle('out-of-reach', !inReach(curio));
  }

  remove(id: string): void {
    this.markers.get(id)?.marker.remove();
    this.markers.delete(id);
  }
}
