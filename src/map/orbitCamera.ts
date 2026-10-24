import type { Map } from 'maplibre-gl';

/** Degrees of bearing per pixel dragged sideways, and of tilt per pixel dragged up or down. */
const BEARING_PER_PX = 0.35;
const PITCH_PER_PX = 0.25;
/** How far a finger moves before a drag starts orbiting; smaller moves stay taps. */
const START_PX = 8;
const MIN_PITCH = 0;

/**
 * Pokémon Go style camera: the view stays centred (on the Wayfarer while following).
 * A one-finger or mouse drag orbits instead of panning: sideways turns the bearing around
 * the centre and up and down tilts, both at once, so a diagonal drag swings the view freely. Pinch, two-finger twist and the wheel zoom and turn
 * around the centre too. While an orbit is under way, callers should re-centre with jumpTo
 * rather than easeTo, which would fight the finger for the bearing. Taps are left alone, so markers, layers and `?walk` still get clicks.
 */
export interface OrbitCamera {
  orbiting(): boolean;
  /** Free mode (Farsight) hands the map back its usual drag-to-pan; orbit mode takes it away again. */
  setFree(free: boolean): void;
}

export function installOrbitCamera(map: Map): OrbitCamera {
  let free = false;
  const lock = () => {
    map.dragPan.disable();
    map.dragRotate.disable();
    map.doubleClickZoom.disable();
    map.keyboard.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.enable({ around: 'center' });
    map.scrollZoom.enable({ around: 'center' });
  };
  const unlock = () => {
    map.dragPan.enable();
    map.dragRotate.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();
    map.touchPitch.enable();
    // Re-enabling without `around` drops the centre anchor, so pinches zoom under the fingers.
    map.touchZoomRotate.disable();
    map.touchZoomRotate.enable();
    map.scrollZoom.disable();
    map.scrollZoom.enable();
  };
  lock();

  const el = map.getCanvasContainer();
  // With drag-pan off MapLibre hands one-finger drags back to the browser, which would cancel the orbit to scroll.
  el.style.touchAction = 'none';
  map.getCanvas().style.touchAction = 'none';
  const pointers = new Set<number>();
  // A finished orbit swallows the click the browser may still send, so it is not read as a tap.
  let swallowClick = false;
  let drag: { id: number; x: number; y: number; lastX: number; lastY: number; moving: boolean; below: boolean } | null = null;

  el.addEventListener('pointerdown', (e) => {
    if (free) return;
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
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moving: false, below: e.clientY >= centreY };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moving) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) < START_PX) return;
      drag.moving = true;
      swallowClick = true;
      map.stop();
    }
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    // Drag the ground beneath the finger: below the centre it turns one way, above it the other.
    const bearing = map.getBearing() + (drag.below ? 1 : -1) * dx * BEARING_PER_PX;
    const pitch = Math.min(map.getMaxPitch(), Math.max(MIN_PITCH, map.getPitch() - dy * PITCH_PER_PX));
    map.jumpTo({ bearing, pitch });
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
  return {
    orbiting: () => !!drag?.moving,
    setFree(value) {
      if (value === free) return;
      free = value;
      drag = null;
      pointers.clear();
      if (free) unlock();
      else lock();
    },
  };
}
