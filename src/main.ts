import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { AttributionControl, Map, setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { createFantasyStyle } from './map/fantasyStyle';
import { PlayerMarker } from './map/player';
import { WalkTracker, type Fix } from './geo/distance';
import { watchLocation } from './geo/location';

// Shown until the first GPS fix arrives, or for good if location is unavailable.
const FALLBACK_CENTER: [number, number] = [-3.1883, 55.9533]; // Edinburgh
const PLAY_ZOOM = 16;
const DISTANCE_KEY = 'wanderwild.distanceMetres';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const distanceEl = $('distance');
const noticeEl = $('notice');
const recenterEl = $<HTMLButtonElement>('recenter');

function loadDistance(): number {
  try {
    return Number(localStorage.getItem(DISTANCE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveDistance(metres: number): void {
  try {
    localStorage.setItem(DISTANCE_KEY, String(Math.round(metres)));
  } catch {
    // Storage can be unavailable (private mode); the counter still works for this visit.
  }
}

function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10_000 ? 2 : 1)} km`;
}

function showNotice(text: string | null): void {
  noticeEl.hidden = !text;
  noticeEl.textContent = text ?? '';
}

// MapLibre looks for its worker next to its own module, which a bundler moves; point it at the emitted file.
setWorkerUrl(mapWorkerUrl);

const map = new Map({
  container: 'map',
  style: createFantasyStyle(),
  center: FALLBACK_CENTER,
  zoom: PLAY_ZOOM,
  pitch: 45,
  maxPitch: 60,
  minZoom: 3,
  attributionControl: false,
});
map.addControl(new AttributionControl({ compact: true }), 'bottom-left');

const player = new PlayerMarker(map);
const walk = new WalkTracker(loadDistance());
distanceEl.textContent = formatDistance(walk.totalMetres);

let following = true;
let lastFix: Fix | null = null;

function setFollowing(value: boolean): void {
  following = value;
  recenterEl.setAttribute('aria-pressed', String(value));
  if (value && lastFix) map.easeTo({ center: [lastFix.lng, lastFix.lat], zoom: Math.max(map.getZoom(), 15) });
}

// Panning by hand stops following; the compass button resumes it.
map.on('dragstart', () => setFollowing(false));
recenterEl.addEventListener('click', () => setFollowing(true));

watchLocation((event) => {
  if (event.kind === 'error') {
    if (lastFix) return; // Keep the last known position on a transient error.
    showNotice(
      event.reason === 'denied'
        ? 'Location is off. Allow it to see yourself on the map.'
        : 'Searching for your location…',
    );
    return;
  }

  const firstFix = !lastFix;
  lastFix = event.fix;
  showNotice(null);
  player.update(event.fix);

  if (walk.add(event.fix) > 0) {
    distanceEl.textContent = formatDistance(walk.totalMetres);
    saveDistance(walk.totalMetres);
  }

  if (firstFix) map.jumpTo({ center: [event.fix.lng, event.fix.lat], zoom: PLAY_ZOOM });
  else if (following) map.easeTo({ center: [event.fix.lng, event.fix.lat], duration: 800 });
});

registerSW({ immediate: true });
