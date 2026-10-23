import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { AttributionControl, Map, setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { createFantasyStyle } from './map/fantasyStyle';
import { installFantasyImages } from './map/fantasyImages';
import { transformGlyphRequest } from './map/glyphs';
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
import { HearthsteadPanel } from './hud/hearthsteadPanel';
import { renderParty } from './hud/partyPanel';
import { formatWait } from './hud/format';
import { CompanionMarker, CreatureMarkers } from './map/creatures';
import { addPet, companion, loadCollection, saveCollection, walkRewards } from './creatures/collection';
import { spawnsNear, type Spawn } from './game/spawns';
import { getSpecies } from './creatures/species';
import { creatureForSpawn, type Encounter } from './creatures/stats';
import type { GameContext } from './ui/context';
import { openBattle } from './ui/battle';
import { openBestiary, openStarterChoice } from './ui/bestiary';
import { toast } from './ui/dom';
import { openEncounter } from './ui/encounter';
import { sound } from './audio/sound';
import { setupSoundButton } from './ui/soundButton';
import { HuntController } from './ui/hunt';
import { walkInRealm } from './creatures/evolution';

// Shown until the first GPS fix arrives, or for good if location is unavailable.
const FALLBACK_CENTER: [number, number] = [-3.1883, 55.9533]; // Edinburgh
const PLAY_ZOOM = 16;
const SHRINE_SHOW_M = 600;
// Add ?walk to the address to move by tapping the map instead of GPS (for testing at a desk).
const SIMULATE = new URLSearchParams(location.search).has('walk');
const SIM_SPEED_MPS = 1.4;
/** How close the player must be to a creature to meet it. Generous, since GPS wanders. */
const REACH_M = 120;
/** Re-check spawns after moving this far or this long. */
const SPAWN_REFRESH_M = 25;
const SPAWN_REFRESH_MS = 30_000;
/** Wayfarer XP for binding a Wildling or driving off Blotspawn, by spawn rarity. */
const CREATURE_XP: Record<Spawn['rarity'], number> = { common: 60, uncommon: 90, rare: 150, epic: 250, legendary: 400 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const noticeEl = $('notice');
const recenterEl = $<HTMLButtonElement>('recenter');
const sealsEl = $('seals');

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
  transformRequest: transformGlyphRequest,
});
installFantasyImages(map);
map.addControl(new AttributionControl({ compact: true }), 'bottom-left');

installProbeLayers(map);

const game = new GameState(await loadSave());
const hud = new Hud(game);
new HearthsteadPanel(game, (text) => hud.toast(text));
// Bank the time the app was closed, so offline production shows straight away.
game.tickHearthstead();
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
  if (game.useShrine(shrine, realmAt(map, shrine.lng, shrine.lat) ?? currentRealm ?? 'hearthfields')) sound.play('shrine');
  refreshWorld();
}

const shrines = new ShrineLayer(map, useShrine);

// Creatures: the collection, wild spawns around the player, and the companion at their side.
const collection = loadCollection();
const companionMarker = new CompanionMarker(map);
const creatureGame: GameContext = {
  collection,
  changed() {
    saveCollection(collection);
    sealsEl.textContent = String(collection.seals);
    companionMarker.setPet(companion(collection));
  },
};
creatureGame.wayfarer = {
  level: () => game.level.level,
  tonics: () => game.save.supplies.tonic,
  useTonic: () => game.useTonic(),
  spellMetres: () => game.save.spellChargeM,
  spendSpell: (m) => game.spendSpell(m),
};
creatureGame.changed();
$('satchel-open').addEventListener('click', () => renderParty($('satchel-party'), creatureGame));

/** Hatched eggs join the collection as Wildlings (re-rolling past any Blotspawn the seed picks). */
function claimHatchlings(): void {
  const level = companion(collection)?.level ?? 1;
  for (const h of game.save.hatchlings.splice(0)) {
    for (let i = 0; i < 20; i++) {
      const encounter = creatureForSpawn({ seed: (h.seed + i * 7919) >>> 0, rarity: h.rarity }, level);
      if (encounter.species.kind !== 'pet') continue;
      addPet(collection, { ...encounter, level: Math.max(1, Math.min(level, encounter.level)) });
      toast(`A ${encounter.species.name} hatched and joined your bestiary!`);
      break;
    }
  }
  game.changed();
  creatureGame.changed();
}
game.on((event) => event.kind === 'hatch' && claimHatchlings());
if (game.save.hatchlings.length) claimHatchlings();

/** Removes a spawn that was caught, beaten or fled; only the first two earn Wayfarer XP. */
function clearSpawn(spawn: Spawn, won: boolean): void {
  collection.cleared[spawn.id] = spawn.expiresAt;
  creatures.remove(spawn.id);
  if (won) {
    game.grantXp(CREATURE_XP[spawn.rarity]);
    game.changed();
  }
  creatureGame.changed();
}

function meet(spawn: Spawn, encounter: Encounter): void {
  if (!lastFix) return;
  const metres = haversine(lastFix, spawn);
  if (metres > REACH_M) {
    sound.play('error');
    toast(`That ${encounter.species.name} is ${Math.round(metres)} m away. Walk closer to reach it.`);
    return;
  }
  if (encounter.species.kind === 'pet') {
    openEncounter(creatureGame, encounter, (caught, fled) => (caught || fled) && clearSpawn(spawn, caught));
  } else if (!companion(collection)) {
    toast('You need a companion to face Blotspawn.');
  } else {
    openBattle(creatureGame, encounter, (won) => won && clearSpawn(spawn, true));
  }
}

const creatures = new CreatureMarkers(map, meet);
let spawnCheck: { lat: number; lng: number; at: number } | null = null;
// Realm lookups read tiles, so each spawn's realm is worked out once.
const spawnRealms = new globalThis.Map<string, RealmId>();

function refreshSpawns(force = false): void {
  if (!lastFix) return;
  const now = Date.now();
  if (!force && spawnCheck && haversine(spawnCheck, lastFix) < SPAWN_REFRESH_M && now - spawnCheck.at < SPAWN_REFRESH_MS) return;
  spawnCheck = { lat: lastFix.lat, lng: lastFix.lng, at: now };
  const level = companion(collection)?.level ?? 1;
  const live = spawnsNear(lastFix.lat, lastFix.lng, now, 1).filter(
    (spawn) => spawn.expiresAt > now && !(spawn.id in collection.cleared),
  );
  for (const spawn of live) {
    if (!spawnRealms.has(spawn.id)) {
      const realm = realmAt(map, spawn.lng, spawn.lat);
      if (realm) spawnRealms.set(spawn.id, realm);
    }
    spawn.realm = spawnRealms.get(spawn.id);
  }
  creatures.show(live.map((spawn) => ({ spawn, encounter: creatureForSpawn(spawn, level) })));
}
setInterval(() => refreshSpawns(), SPAWN_REFRESH_MS);
// The first fix can arrive before tiles; look again once they have loaded.
map.once('idle', () => refreshSpawns(true));

$('bestiary').addEventListener('click', () => openBestiary(creatureGame));
if (!collection.pets.length) openStarterChoice(creatureGame);

// Treasure hunts: riddles that lead to real landmarks.
const hunts = new HuntController({
  map,
  game,
  position: () => lastFix,
  realmAt: (lat, lng) => realmAt(map, lng, lat),
  addSeals(n) {
    collection.seals += n;
    creatureGame.changed();
  },
  stopFollowing: () => setFollowing(false),
  onChange: () => refreshWorld(),
});

/** Re-reads realm and shrines from the loaded tiles around the player. */
function refreshWorld(): void {
  if (!lastFix || !map.isStyleLoaded()) return;
  const realm = realmAt(map, lastFix.lng, lastFix.lat);
  if (realm) {
    currentRealm = realm;
    hud.setRealm(realm);
    sound.setRealm(realm);
  }
  const now = Date.now();
  const near = shrinesNear(map, lastFix.lng, lastFix.lat, SHRINE_SHOW_M).filter((s) => !hunts.hides(s));
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
  companionMarker.update(fix.lng, fix.lat);

  const metres = walk.add(fix);
  if (metres > 0) {
    game.recordWalk(metres);
    const before = companion(collection)?.level;
    const reward = walkRewards(collection, metres);
    const pet = companion(collection);
    if (pet && reward.levels > 0 && before !== pet.level) {
      sound.play('levelUp');
      toast(`${getSpecies(pet.speciesId).name} grew to level ${pet.level} on the road!`);
    }
    if (reward.seals > 0) {
      sound.play('coin');
      toast(`Found ${reward.seals > 1 ? `${reward.seals} binding seals` : 'a binding seal'} along the way.`);
    }
    const readyToEvolve = walkInRealm(collection, metres, currentRealm);
    if (readyToEvolve) {
      sound.play('discover');
      toast(`${getSpecies(readyToEvolve.speciesId).name} is glowing… it's ready to evolve! Open the bestiary.`);
    }
    creatureGame.changed();
  }
  refreshSpawns(firstFix);
  hunts.update(fix, metres);
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

sound.install();
setupSoundButton($<HTMLButtonElement>('sound-toggle'));

registerSW({ immediate: true });
setupInstallButton($<HTMLButtonElement>('install'), showNotice);
