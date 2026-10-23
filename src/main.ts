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
import { CompanionMarker, CreatureMarkers } from './map/creatures';
import { companion, loadCollection, saveCollection, walkRewards } from './creatures/collection';
import { spawnsNear, type Spawn } from './creatures/spawning';
import { getSpecies } from './creatures/species';
import { creatureForSpawn, type Encounter } from './creatures/stats';
import type { GameContext } from './ui/context';
import { openBattle } from './ui/battle';
import { openBestiary, openStarterChoice } from './ui/bestiary';
import { toast } from './ui/dom';
import { openEncounter } from './ui/encounter';

// Shown until the first GPS fix arrives, or for good if location is unavailable.
const FALLBACK_CENTER: [number, number] = [-3.1883, 55.9533]; // Edinburgh
const PLAY_ZOOM = 16;
const DISTANCE_KEY = 'wanderwild.distanceMetres';
/** How close the player must be to a creature to meet it. Generous, since GPS wanders. */
const REACH_M = 120;
/** Re-check spawns after moving this far or this long. */
const SPAWN_REFRESH_M = 25;
const SPAWN_REFRESH_MS = 30_000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const distanceEl = $('distance');
const noticeEl = $('notice');
const recenterEl = $<HTMLButtonElement>('recenter');
const sealsEl = $('seals');

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

// Creatures: the collection, wild spawns around the player, and the companion at their side.
const collection = loadCollection();
const companionMarker = new CompanionMarker(map);
const game: GameContext = {
  collection,
  changed() {
    saveCollection(collection);
    sealsEl.textContent = String(collection.seals);
    companionMarker.setPet(companion(collection));
  },
};
game.changed();

function clearSpawn(spawn: Spawn): void {
  collection.cleared[spawn.id] = spawn.expiresAt;
  creatures.remove(spawn.id);
  game.changed();
}

function meet(spawn: Spawn, encounter: Encounter): void {
  if (!lastFix) return;
  const metres = haversine(lastFix, spawn);
  if (metres > REACH_M) {
    toast(`That ${encounter.species.name} is ${Math.round(metres)} m away. Walk closer to reach it.`);
    return;
  }
  if (encounter.species.kind === 'pet') {
    openEncounter(game, encounter, (caught, fled) => (caught || fled) && clearSpawn(spawn));
  } else if (!companion(collection)) {
    toast('You need a companion to face Blotspawn.');
  } else {
    openBattle(game, encounter, (won) => won && clearSpawn(spawn));
  }
}

const creatures = new CreatureMarkers(map, meet);
let spawnCheck: { lat: number; lng: number; at: number } | null = null;

function refreshSpawns(force = false): void {
  if (!lastFix) return;
  const now = Date.now();
  if (!force && spawnCheck && haversine(spawnCheck, lastFix) < SPAWN_REFRESH_M && now - spawnCheck.at < SPAWN_REFRESH_MS) return;
  spawnCheck = { lat: lastFix.lat, lng: lastFix.lng, at: now };
  const level = companion(collection)?.level ?? 1;
  creatures.show(
    spawnsNear(lastFix.lat, lastFix.lng, now)
      .filter((spawn) => spawn.expiresAt > now && !(spawn.id in collection.cleared))
      .map((spawn) => ({ spawn, encounter: creatureForSpawn(spawn, level) })),
  );
}
setInterval(() => refreshSpawns(), SPAWN_REFRESH_MS);

$('bestiary').addEventListener('click', () => openBestiary(game));
if (!collection.pets.length) openStarterChoice(game);

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

  companionMarker.update(event.fix.lng, event.fix.lat);

  const walked = walk.add(event.fix);
  if (walked > 0) {
    distanceEl.textContent = formatDistance(walk.totalMetres);
    saveDistance(walk.totalMetres);
    const before = companion(collection)?.level;
    const reward = walkRewards(collection, walked);
    const pet = companion(collection);
    if (pet && reward.levels > 0 && before !== pet.level) toast(`${getSpecies(pet.speciesId).name} grew to level ${pet.level} on the road!`);
    if (reward.seals > 0) toast(`Found ${reward.seals > 1 ? `${reward.seals} binding seals` : 'a binding seal'} along the way.`);
    game.changed();
  }
  refreshSpawns(firstFix);

  if (firstFix) map.jumpTo({ center: [event.fix.lng, event.fix.lat], zoom: PLAY_ZOOM });
  else if (following) map.easeTo({ center: [event.fix.lng, event.fix.lat], duration: 800 });
});

registerSW({ immediate: true });
setupInstallButton($<HTMLButtonElement>('install'), showNotice);
