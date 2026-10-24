import type { Map } from 'maplibre-gl';

/** Zoom where map icons are drawn at full size; matches the play zoom the map opens at. */
const FULL_SIZE_ZOOM = 16;

/**
 * How big map icons draw at a zoom: full size at play zoom, a touch larger zoomed right in,
 * and down to just over half size zoomed out. Stepped to 0.05 so a pinch does not re-lay out
 * every marker on every frame. Tap targets keep a 44 px floor in CSS whatever this says.
 */
export function markerScale(zoom: number): number {
  const raw = Math.min(1.1, Math.max(0.55, 1 + (zoom - FULL_SIZE_ZOOM) * 0.15));
  return Math.round(raw * 20) / 20;
}

/** Keeps `--marker-scale` on the map container in step with the zoom. */
export function installMarkerScale(map: Map): void {
  const container = map.getContainer();
  let shown = NaN;
  const update = () => {
    const scale = markerScale(map.getZoom());
    if (scale === shown) return;
    shown = scale;
    container.style.setProperty('--marker-scale', String(scale));
  };
  update();
  map.on('zoom', update);
}
