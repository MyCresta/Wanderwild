import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { AttributionControl, Map, setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { createFantasyStyle } from './map/fantasyStyle';
import { PlayerMarker } from './map/player';
import { haversine, WalkTracker, type Fix } from './geo/distance';
import { watchLocation } from './geo/location';
import { setupInstallButton } from './install';
import { loadSave } from './game/save';
import { GameState } from './game/state';
import { SHRINE_REACH_M, type Shrine } from './game/shrines';
import type { RealmId } from './game/realms';
import { installProbeLayers, realmAt, shrinesNear } from './map/realmProbe';
import { ShrineLayer } from './map/shrineLayer';
import { Hud } from './hud/hud';
import { formatWait } from './hud/format';

// Shown until the first GPS fix arrives, or for good if location is unavailable.
const FALLBACK_CENTER: [number, number] = [-3.1883, 55.9533]; // Edinburgh
const PLAY_ZOOM = 16;
const SHRINE_SHOW_M = 600;
// Add ?walk to the address to move by tapping the map instead of GPS (for testing at a desk).
const SIMULATE = new URLSearchParams(location.search).has('walk');
const SIM_SPEED_MPS = 1.4;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const noticeEl = $('notice');
const recenterEl = $<HTMLButtonElement>('recenter');

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

installProbeLayers(map);

const game = new GameState(await loadSave());
const hud = new Hud(game);
const player = new PlayerMarker(map);
const walk = new WalkTracker();

let following = true;
let lastFix: Fix | null = null;
let currentRealm: RealmId | undefined;

function setFollowing(value: boolean): void {
  following = value;
  recenterEl.setAttribute('aria-pressed', String(value));
  if (value && lastFix) map.easeTo({ center: [lastFix.lng, lastFix.lat], zoom: Math.max(map.getZoom(), 15) });
}

// Panning by hand stops following; the compass button resumes it.
map.on('dragstart', () => setFollowing(false));
recenterEl.addEventListener('click', () => setFollowing(true));

function useShrine(shrine: Shrine): void {
  if (!lastFix) return hud.toast('Find your location first to reach a shrine.');
  const away = haversine(lastFix, shrine);
  if (away > SHRINE_REACH_M) return hud.toast(`${shrine.name} is ${Math.round(away)} m away. Walk within ${SHRINE_REACH_M} m to touch it.`);
  const wait = game.shrineReadyAt(shrine) - Date.now();
  if (wait > 0) return hud.toast(`${shrine.name} is gathering its power. Ready in ${formatWait(wait)}.`);
  game.useShrine(shrine, realmAt(map, shrine.lng, shrine.lat) ?? currentRealm ?? 'hearthfields');
  refreshWorld();
}

const shrines = new ShrineLayer(map, useShrine);

/** Re-reads realm and shrines from the loaded tiles around the player. */
function refreshWorld(): void {
  if (!lastFix || !map.isStyleLoaded()) return;
  const realm = realmAt(map, lastFix.lng, lastFix.lat);
  if (realm) {
    currentRealm = realm;
    hud.setRealm(realm);
  }
  const now = Date.now();
  const near = shrinesNear(map, lastFix.lng, lastFix.lat, SHRINE_SHOW_M);
  shrines.set(near, new Set(near.filter((s) => game.shrineReadyAt(s) > now).map((s) => s.id)));
}

let refreshQueued = false;
map.on('idle', () => {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    refreshWorld();
  });
});
// Cooled-down shrines and an ending blessing need a redraw even when nothing moves.
setInterval(() => {
  refreshWorld();
  hud.render();
}, 15_000);

function onFix(fix: Fix): void {
  const firstFix = !lastFix;
  lastFix = fix;
  showNotice(null);
  player.update(fix);

  const metres = walk.add(fix);
  if (metres > 0) game.recordWalk(metres);
  if (fix.accuracy <= 40) game.visit(fix.lat, fix.lng);

  if (firstFix) map.jumpTo({ center: [fix.lng, fix.lat], zoom: PLAY_ZOOM });
  else if (following) map.easeTo({ center: [fix.lng, fix.lat], duration: 800 });
  refreshWorld();
}

if (SIMULATE) {
  let time = Date.now();
  onFix({ lat: FALLBACK_CENTER[1], lng: FALLBACK_CENTER[0], accuracy: 5, time });
  hud.toast('Practice walk: tap the map to walk there.', 5000);
  map.on('click', (e) => {
    const target = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    time += (lastFix ? haversine(lastFix, target) / SIM_SPEED_MPS : 0) * 1000 + 1000;
    onFix({ ...target, accuracy: 5, time });
  });
} else {
  watchLocation((event) => {
    if (event.kind === 'fix') return onFix(event.fix);
    if (lastFix) return; // Keep the last known position on a transient error.
    showNotice(
      event.reason === 'denied'
        ? 'Location is off. Allow it to see yourself on the map.'
        : 'Searching for your location…',
    );
  });
}

// Write progress straight away when the app is put in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void game.flush();
});

registerSW({ immediate: true });
setupInstallButton($<HTMLButtonElement>('install'), showNotice);
