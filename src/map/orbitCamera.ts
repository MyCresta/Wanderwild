import type { Map } from 'maplibre-gl';

/** Degrees of bearing per pixel dragged sideways, and of tilt per pixel dragged up or down. */
const BEARING_PER_PX = 0.35;
const PITCH_PER_PX = 0.25;
/** How far a finger moves before the drag picks an axis; smaller moves stay taps. */
const LOCK_PX = 8;
const MIN_PITCH = 0;

/**
 * Pokémon Go style camera: the view stays centred (on the Wayfarer while following).
 * A one-finger or mouse drag orbits instead of panning: sideways turns the bearing around
 * the centre, up and down tilts. Pinch, two-finger twist and the wheel zoom and turn
 * around the centre too. While an orbit is under way, callers should re-centre with jumpTo
 * rather than easeTo, which would fight the finger for the bearing. Taps are left alone, so markers, layers and `?walk` still get clicks.
 */
export function installOrbitCamera(map: Map): { orbiting: () => boolean } {
  map.dragPan.disable();
  map.dragRotate.disable();
  map.doubleClickZoom.disable();
  map.keyboard.disable();
  map.touchPitch.disable();
  map.touchZoomRotate.enable({ around: 'center' });
  map.scrollZoom.enable({ around: 'center' });

  const el = map.getCanvasContainer();
  // With drag-pan off MapLibre hands one-finger drags back to the browser, which would cancel the orbit to scroll.
  el.style.touchAction = 'none';
  map.getCanvas().style.touchAction = 'none';
  const pointers = new Set<number>();
  // A finished orbit swallows the click the browser may still send, so it is not read as a tap.
  let swallowClick = false;
  let drag: { id: number; x: number; y: number; lastX: number; lastY: number; axis?: 'x' | 'y'; below: boolean } | null = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.add(e.pointerId);
    swallowClick = false;
    // A second finger hands the gesture to pinch and twist.
    if (pointers.size > 1) {
      drag = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    const centreY = rect.top + map.project(map.getCenter()).y;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, below: e.clientY >= centreY };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.axis) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) < LOCK_PX) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      swallowClick = true;
      map.stop();
    }
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (drag.axis === 'x') {
      // Drag the ground beneath the finger: below the centre it turns one way, above it the other.
      map.setBearing(map.getBearing() + (drag.below ? 1 : -1) * dx * BEARING_PER_PX);
    } else {
      const pitch = Math.min(map.getMaxPitch(), Math.max(MIN_PITCH, map.getPitch() - dy * PITCH_PER_PX));
      map.setPitch(pitch);
    }
  });

  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (drag?.id === e.pointerId) drag = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  el.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  return { orbiting: () => !!drag?.axis };
}
