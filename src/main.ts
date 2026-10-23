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
import { isNight, RARITIES } from './game/gear';
import { MATERIALS, type MaterialId, type RealmId } from './game/realms';
import { installProbeLayers, realmAt, shrinesNear } from './map/realmProbe';
import { ShrineLayer } from './map/shrineLayer';
import { Hud } from './hud/hud';
import { HearthsteadPanel } from './hud/hearthsteadPanel';
import { renderParty } from './hud/partyPanel';
import { ForgePanel } from './hud/forgePanel';
import { formatWait } from './hud/format';
import { CompanionMarker, CreatureMarkers, ResidentMarkers } from './map/creatures';
import { addPet, companion, loadCollection, saveCollection, walkRewards } from './creatures/collection';
import { spawnsNear, type Spawn } from './game/spawns';
import { getSpecies } from './creatures/species';
import { creatureForSpawn, type Encounter } from './creatures/stats';
import type { GameContext } from './ui/context';
import { openBattle } from './ui/battle';
import { openBestiary, openStarterChoice } from './ui/bestiary';
import { toast } from './ui/dom';
import { openEncounter } from './ui/encounter';
import { DeedKeeper } from './ui/deeds';
import { sound } from './audio/sound';
import { setupSoundButton } from './ui/soundButton';
import { HuntController } from './ui/hunt';
import { Trace } from './game/glyphs';
import { realmShares, samplePoints, waymarkSpawn } from './game/demesne';
import { DemesneLayer } from './map/demesneLayer';
import { DemesnePanel } from './hud/demesnePanel';
import { ringInRealm, walkInRealm } from './creatures/evolution';
import { creatureReach } from './geo/reach';
import { setupRailMenu, watchLayout } from './ui/layout';
import { installOrbitCamera } from './map/orbitCamera';
import { FightBoard, type FoeNear } from './ui/fightBoard';
import { Farsight } from './ui/farsight';
import { CurioLayer } from './map/curioLayer';
import { CURIO_KINDS, curiosNear, FARSIGHT_SHARE, type Curio } from './game/farsight';

// Shown until the first GPS fix arrives, or for good if location is unavailable.
const FALLBACK_CENTER: [number, number] = [-3.1883, 55.9533]; // Edinburgh
const PLAY_ZOOM = 16;
const SHRINE_SHOW_M = 600;
// Add ?walk to the address to move by tapping the map instead of GPS (for testing at a desk).
const SIMULATE = new URLSearchParams(location.search).has('walk');
const SIM_SPEED_MPS = 1.4;
/** Re-check spawns after moving this far or this long. */
const SPAWN_REFRESH_M = 25;
const SPAWN_REFRESH_MS = 30_000;
/** Wayfarer XP for binding a Wildling or driving off Blotspawn, by spawn rarity. */
const CREATURE_XP: Record<Spawn['rarity'], number> = { common: 60, uncommon: 90, rare: 150, epic: 250, legendary: 400 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const noticeEl = $('notice');
const recenterEl = $<HTMLButtonElement>('recenter');
const sealsEl = $('seals');

watchLayout();
setupRailMenu();

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
const orbit = installOrbitCamera(map);

installProbeLayers(map);

const game = new GameState(await loadSave());
const hud = new Hud(game);
const forge = new ForgePanel(game, (text) => hud.toast(text));
// Bank the time the app was closed, so offline production shows straight away.
game.tickHearthstead();
const player = new PlayerMarker(map);
const dressPlayer = () => {
  const worn = Object.fromEntries(game.equippedItems().map((g) => [g.slot, RARITIES[g.rarity].color]));
  player.setLook({ cloak: worn.cloak, staff: worn.staff, lantern: !!worn.lantern });
};
dressPlayer();
game.on((e) => e.kind === 'change' && dressPlayer());
const walk = new WalkTracker();

let following = true;
let lastFix: Fix | null = null;
let currentRealm: RealmId | undefined;

function setFollowing(value: boolean): void {
  // Following the Wayfarer means coming home from Farsight.
  if (value && farsight.active) return farsight.set(false);
  following = value;
  recenterEl.setAttribute('aria-pressed', String(value));
  if (value && lastFix) map.easeTo({ center: [lastFix.lng, lastFix.lat], zoom: Math.max(map.getZoom(), 15) });
}

// Dragging orbits rather than pans, so only looking at a Waymark or a hunt stops following; the compass button resumes it.
recenterEl.addEventListener('click', () => setFollowing(true));

function useShrine(shrine: Shrine): void {
  if (!lastFix) return hud.toast('Find your location first to reach a shrine.');
  const away = haversine(lastFix, shrine);
  const reach = SHRINE_REACH_M + game.bonuses().reachM;
  if (away > reach) return hud.toast(`${shrine.name} is ${Math.round(away)} m away. Walk within ${Math.round(reach)} m to touch it.`);
  const wait = game.shrineReadyAt(shrine) - Date.now();
  if (wait > 0) return hud.toast(`${shrine.name} is gathering its power. Ready in ${formatWait(wait)}.`);
  if (game.useShrine(shrine, realmAt(map, shrine.lng, shrine.lat) ?? currentRealm ?? 'hearthfields')) sound.play('shrine');
  refreshWorld();
}

const shrines = new ShrineLayer(map, useShrine);

// Creatures: the collection, wild spawns around the player, and the companion at their side.
const collection = loadCollection();
const companionMarker = new CompanionMarker(map);
// Deeds read the collection, so they are set up just after it.
let deeds: DeedKeeper | undefined;
// The Demesne's residents redraw when pets change; that layer is set up further down.
let refreshResidents: (() => void) | undefined;
const creatureGame: GameContext = {
  collection,
  changed() {
    saveCollection(collection);
    sealsEl.textContent = String(collection.seals);
    companionMarker.setPet(companion(collection));
    deeds?.check();
    refreshResidents?.();
  },
};
creatureGame.wayfarer = {
  level: () => game.level.level,
  tonics: () => game.save.supplies.tonic,
  useTonic: () => game.useTonic(),
  spellMetres: () => game.save.spellChargeM,
  spendSpell: (m) => game.spendSpell(m),
  gear: () => {
    const b = game.bonuses();
    return { petDamage: b.petDamage + (isNight() ? b.nightDamage : 0), petHealth: b.petHealth, catchBonus: b.catchBonus };
  },
};
creatureGame.changed();
deeds = new DeedKeeper(game, collection, $('deeds'), $('wayfarer-title'));
$('satchel-open').addEventListener('click', () => renderParty($('satchel-party'), creatureGame));
new HearthsteadPanel(game, (text) => hud.toast(text), creatureGame, forge);

// Glyphwalking: the shape of the walk, kept in memory only, and the Demesne it claims.
const trace = new Trace();
const trailMetres = () => {
  let m = 0;
  for (let i = 1; i < trace.points.length; i++) m += haversine(trace.points[i - 1], trace.points[i]);
  return m;
};
const demesnePanel = new DemesnePanel(game, (text) => hud.toast(text), creatureGame, trailMetres, (lng, lat) => {
  setFollowing(false);
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16) });
});
// In practice-walk mode a tap moves the Wayfarer, so parcels open from the panel only.
const demesneLayer = new DemesneLayer(map, SIMULATE ? undefined : (id) => demesnePanel.open(id));
const residents = new ResidentMarkers(map);
const drawDemesne = () => {
  demesneLayer.show(game.save.parcels, game.save.leyLines, game.save.waymarks);
  residents.show(game.save.parcels, collection.pets);
};
game.tickDemesne();
drawDemesne();
game.on((e) => e.kind === 'change' && drawDemesne());
refreshResidents = () => residents.show(game.save.parcels, collection.pets);
// A Ring walked in the companion's home realm is the last step of its evolution.
game.on((e) => {
  if (e.kind !== 'glyph' || e.glyph.kind !== 'ring') return;
  const rung = ringInRealm(collection, e.realm);
  if (!rung) return;
  const name = getSpecies(rung.pet.speciesId).name;
  sound.play('discover');
  toast(rung.ready ? `${name} is glowing… it's ready to evolve! Open the bestiary.` : `${name} felt the Ring close around its home. One step nearer to changing.`);
  creatureGame.changed();
});

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

/** Removes a spawn that was caught, beaten or fled; only the first two earn Wayfarer XP, less by Farsight. */
function clearSpawn(spawn: Spawn, won: boolean, kind: 'pet' | 'monster', remote = false): void {
  collection.cleared[spawn.id] = spawn.expiresAt;
  creatures.remove(spawn.id);
  if (won) {
    game.grantXp(CREATURE_XP[spawn.rarity] * (remote ? FARSIGHT_SHARE : 1));
    game.changed();
  }
  creatureGame.changed();
  if (won) deeds?.win(kind, spawn.rarity);
}

/** Within the purple ring of where the Wayfarer actually stands. */
const onFoot = (p: { lat: number; lng: number }) => !!lastFix && haversine(lastFix, p) <= creatureReach(lastFix, game.bonuses().reachM);

function meet(spawn: Spawn, encounter: Encounter): void {
  // By Farsight anything on the map can be met, for a smaller reward; in person it pays in full.
  const remote = !onFoot(spawn);
  if (remote && !farsight.active) {
    if (!lastFix) return;
    const metres = haversine(lastFix, spawn);
    const reach = creatureReach(lastFix, game.bonuses().reachM);
    sound.play('error');
    toast(`That ${encounter.species.name} is ${Math.round(metres)} m away. Walk ${Math.ceil(metres - reach)} m closer, or reach it by Farsight 👁 for ${Math.round(FARSIGHT_SHARE * 100)}% rewards.`);
    return;
  }
  if (encounter.species.kind === 'pet') {
    openEncounter(creatureGame, encounter, (caught, fled) => (caught || fled) && clearSpawn(spawn, caught, 'pet', remote));
  } else if (!companion(collection)) {
    toast('You need a companion to face Blotspawn.');
  } else {
    openBattle(creatureGame, encounter, (won) => won && clearSpawn(spawn, true, 'monster', remote));
  }
}

const creatures = new CreatureMarkers(map, meet);
/** What stands on the map right now, so the Fight board can list the Blotspawn. */
let shown: { spawn: Spawn; encounter: Encounter }[] = [];
let foeHinted = false;
const fights = new FightBoard({
  fight: meet,
  show(spawn) {
    setFollowing(false);
    map.flyTo({ center: [spawn.lng, spawn.lat], zoom: Math.max(map.getZoom(), 17) });
  },
  practice: (encounter) => openBattle(creatureGame, encounter, () => {}, { practice: true }),
  companionLevel: () => companion(collection)?.level ?? null,
});

function seenFarsightHint(): boolean {
  try {
    if (localStorage.getItem('wanderwild.farsightHint')) return true;
    localStorage.setItem('wanderwild.farsightHint', '1');
  } catch {
    // Without storage the hint just shows every time.
  }
  return false;
}

// Farsight: drag the map freely and play wherever the lens in the middle looks.
const farsight = new Farsight({
  enter() {
    following = false;
    recenterEl.setAttribute('aria-pressed', 'false');
    orbit.setFree(true);
    if (!seenFarsightHint()) {
      hud.toast(`Farsight: drag anywhere to explore. Fight, sketch and pick up curios from here for ${Math.round(FARSIGHT_SHARE * 100)}% rewards. Walking still pays full.`, 6000);
    }
    refreshAround(true);
  },
  exit() {
    orbit.setFree(false);
    setFollowing(true);
    refreshAround(true);
  },
});
/** Where play is happening: the lens while in Farsight, otherwise the Wayfarer. */
function focus(): { lat: number; lng: number } | null {
  if (!farsight.active) return lastFix;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng };
}

let spawnCheck: { lat: number; lng: number; at: number } | null = null;
// Realm lookups read tiles, so each spawn's realm is worked out once.
const spawnRealms = new globalThis.Map<string, RealmId>();

function refreshSpawns(force = false): void {
  const fix = focus();
  if (!fix) return;
  const now = Date.now();
  if (!force && spawnCheck && haversine(spawnCheck, fix) < SPAWN_REFRESH_M && now - spawnCheck.at < SPAWN_REFRESH_MS) return;
  spawnCheck = { lat: fix.lat, lng: fix.lng, at: now };
  const level = companion(collection)?.level ?? 1;
  const waymarked = game.save.waymarks.filter((w) => haversine(fix, w) < 1500).map((w) => waymarkSpawn(w, now));
  const live = [...spawnsNear(fix.lat, fix.lng, now, 1), ...waymarked].filter(
    (spawn) => spawn.expiresAt > now && !(spawn.id in collection.cleared),
  );
  for (const spawn of live) {
    if (!spawnRealms.has(spawn.id)) {
      const realm = realmAt(map, spawn.lng, spawn.lat);
      if (realm) spawnRealms.set(spawn.id, realm);
    }
    spawn.realm = spawnRealms.get(spawn.id);
  }
  shown = live.map((spawn) => ({ spawn, encounter: creatureForSpawn(spawn, level) }));
  creatures.show(shown);
  showReach();
}

/** Draws the reach ring and dims creatures outside it, so what looks near can be tapped. */
function showReach(): void {
  const fix = focus();
  if (!fix) return;
  const reach = lastFix ? creatureReach(lastFix, game.bonuses().reachM) : 0;
  if (lastFix) player.setReach(reach);
  // By Farsight everything shown is in reach, so nothing is dimmed.
  creatures.markReach((spawn) => farsight.active || onFoot(spawn));
  const foes: FoeNear[] = shown
    .filter(({ spawn, encounter }) => encounter.species.kind === 'monster' && !(spawn.id in collection.cleared))
    .map(({ spawn, encounter }) => {
      const metres = haversine(fix, spawn);
      return { spawn, encounter, metres, inReach: farsight.active || onFoot(spawn) };
    });
  fights.update(foes);
  if (!foeHinted && companion(collection) && foes.some((f) => f.inReach)) {
    foeHinted = true;
    toast('A Blotspawn is close enough to fight! Tap it, or the ⚔ button.');
  }
}
game.on((e) => e.kind === 'change' && showReach());
setInterval(() => refreshSpawns(), SPAWN_REFRESH_MS);
// The first fix can arrive before tiles; look again once they have loaded.
map.once('idle', () => refreshSpawns(true));

// Curios: small daily finds. Walk past one to pick it up in full, or tap it by Farsight for a share.
const curioLayer = new CurioLayer(map, (curio) => takeCurio(curio));

function takeCurio(curio: Curio): void {
  const here = onFoot(curio);
  if (!here && !farsight.active) {
    sound.play('error');
    const away = lastFix ? `${Math.round(haversine(lastFix, curio))} m away. ` : '';
    toast(`${CURIO_KINDS[curio.kind].name}, ${away}Walk to it, or pick it up by Farsight 👁 for ${Math.round(FARSIGHT_SHARE * 100)}%.`);
    return;
  }
  const reward = game.findCurio(curio, realmAt(map, curio.lng, curio.lat) ?? currentRealm ?? 'hearthfields', here);
  curioLayer.remove(curio.id);
  if (!reward) return;
  if (reward.seals) {
    collection.seals += reward.seals;
    creatureGame.changed();
  }
  const parts = [
    reward.coin && `+${reward.coin} coin`,
    reward.xp && `+${reward.xp} XP`,
    reward.seals && `+${reward.seals} binding seal${reward.seals > 1 ? 's' : ''}`,
    ...Object.entries(reward.materials).map(([id, n]) => `+${n} ${MATERIALS[id as MaterialId].name}`),
  ].filter(Boolean);
  sound.play('coin');
  toast(`${CURIO_KINDS[curio.kind].name}${here ? '' : ' (by Farsight)'}: ${parts.join(', ')}.`);
}

/** Today's curios around wherever play is happening. */
function refreshCurios(): void {
  const at = focus();
  if (!at) return;
  curioLayer.show(curiosNear(at.lat, at.lng, Date.now(), game.save.curiosFound));
}

/** Walking within a few steps of a curio picks it up without a tap. */
function pickUpNearby(fix: Fix): void {
  for (const curio of curiosNear(fix.lat, fix.lng, Date.now(), game.save.curiosFound, 1))
    if (haversine(fix, curio) <= Math.max(25, Math.min(fix.accuracy, 40))) takeCurio(curio);
}

/** Re-reads spawns, curios and shrines around the lens or the Wayfarer. */
function refreshAround(force = false): void {
  refreshSpawns(force);
  showReach();
  refreshCurios();
  refreshWorld();
}
map.on('moveend', () => farsight.active && refreshAround());

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
    game.visitRealm(realm);
    hud.setRealm(realm);
    deeds?.enterRealm(realm);
    sound.setRealm(realm);
  }
  const now = Date.now();
  const at = focus() ?? lastFix;
  const near = shrinesNear(map, at.lng, at.lat, SHRINE_SHOW_M).filter((s) => !hunts.hides(s));
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
    deeds?.walk(metres, fix.time);
  }
  game.walkBorders(fix.lat, fix.lng, metres);
  if (fix.accuracy <= 30) {
    for (const glyph of trace.add(fix)) {
      // Ask the map which realms the Ring encloses, so the parcel yields their materials.
      const shares = glyph.kind === 'ring' ? realmShares(samplePoints(glyph.path).map(([lng, lat]) => realmAt(map, lng, lat)), currentRealm ?? 'hearthfields') : {};
      game.castGlyph(glyph, shares, currentRealm);
      if (glyph.kind === 'knot') refreshSpawns(true);
    }
    demesneLayer.showTrace(trace.line);
  }
  refreshSpawns(firstFix);
  showReach();
  if (firstFix || !farsight.active) refreshCurios();
  pickUpNearby(fix);
  hunts.update(fix, metres);
  if (fix.accuracy <= 40) game.visit(fix.lat, fix.lng);

  if (firstFix) map.jumpTo({ center: [fix.lng, fix.lat], zoom: PLAY_ZOOM });
  else if (following && orbit.orbiting()) map.jumpTo({ center: [fix.lng, fix.lat] });
  else if (following) map.easeTo({ center: [fix.lng, fix.lat], duration: 800 });
  refreshWorld();
}

if (SIMULATE) {
  let time = Date.now();
  onFix({ lat: FALLBACK_CENTER[1], lng: FALLBACK_CENTER[0], accuracy: 5, time });
  hud.toast('Practice walk: tap the map to walk there.', 5000);
  map.on('click', (e) => {
    if (farsight.active) return;
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
