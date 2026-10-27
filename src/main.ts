import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { AttributionControl, Map, setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { createFantasyStyle } from './map/fantasyStyle';
import { installFantasyImages } from './map/fantasyImages';
import { transformGlyphRequest } from './map/glyphs';
import { installMarkerScale } from './map/markerScale';
import { PlayerMarker } from './map/player';
import { haversine, WalkTracker, type Fix } from './geo/distance';
import { watchLocation } from './geo/location';
import { setupInstallButton } from './install';
import { loadSave } from './game/save';
import { GameState } from './game/state';
import { BLESSINGS, type Shrine } from './game/shrines';
import { isNight } from './game/gear';
import { MATERIALS, type MaterialId, type RealmId } from './game/realms';
import { installProbeLayers, realmAt, shrinesNear } from './map/realmProbe';
import { ShrineLayer } from './map/shrineLayer';
import { Hud } from './hud/hud';
import { HearthsteadPanel } from './hud/hearthsteadPanel';
import { ExpeditionsPanel } from './hud/expeditionsPanel';
import { renderParty } from './hud/partyPanel';
import { journal } from './ui/journal';
import { ForgePanel } from './hud/forgePanel';
import { BagPanel } from './hud/bagPanel';
import { HeroPanel, openHeroChoice } from './hud/heroPanel';
import { heroSvg } from './hud/heroArt';
import { CompanionMarker, CreatureMarkers, FollowerMarker } from './map/creatures';
import { companion, loadCollection, partyLevel, saveCollection, walkRewards } from './creatures/collection';
import { foeThreat } from './creatures/foes';
import { spawnsNear, type Spawn } from './game/spawns';
import { getSpecies } from './creatures/species';
import { creatureForSpawn, type Encounter } from './creatures/stats';
import { wildlingWanted } from './creatures/scarcity';
import type { GameContext } from './ui/context';
import { openBattle } from './ui/battle';
import { lairsNear, lairWeek } from './game/lairs';
import { wantedAnchor, wantedPosts, type Bounty, type WantedAnchor, type WantedPost } from './game/wanted';
import { WantedBoard } from './hud/wantedBoard';
import { SkyWatch } from './game/weather';
import { rivalsNear } from './game/rivals';
import { renderBestiary, openStarterChoice } from './ui/bestiary';
import { h, openSheet, toast } from './ui/dom';
import { openFollower, openJoined, openMeeting } from './ui/meet';
import { gatherRoost, materialName, mergeDuplicates } from './creatures/roost';
import { BLOT_TRUST_M, followerTrust, type FollowOutcome } from './creatures/befriend';
import { sound } from './audio/sound';
import { HuntController } from './ui/hunt';
import { Trace } from './game/glyphs';
import { waymarkSpawn } from './game/waymarks';
import { GlyphLayer } from './map/glyphLayer';
import { evolutionStatus, ringInRealm, walkInRealm } from './creatures/evolution';
import { bondMoveFor, walkBond } from './creatures/bond';
import { playerReach } from './geo/reach';
import { watchLayout } from './ui/layout';
import { installOrbitCamera } from './map/orbitCamera';
import { Farsight } from './ui/farsight';
import { CurioLayer } from './map/curioLayer';
import { CURIO_KINDS, curiosNear, FARSIGHT_SHARE, farsightRange, type Curio } from './game/farsight';
import { companionFind, FIND_EVERY_M, findsBetween } from './game/companionFinds';
import { marksReached, peekUsed, TRAIL_MARKS } from './game/trail';
import { TrailLayer } from './map/trailLayer';
import { PeddlerLayer } from './map/peddlerLayer';
import type { PeddlerWare } from './game/peddler';
import { power, RARITIES, RUNES, SLOT_DEFS } from './game/gear';
import { gearSvg } from './hud/gearArt';

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
/** Wayfarer XP for befriending a Wildling or driving off Blotspawn, by rarity. */
const CREATURE_XP: Record<Spawn['rarity'], number> = { common: 60, uncommon: 90, rare: 150, epic: 250, legendary: 400 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const noticeEl = $('notice');
const recenterEl = $<HTMLButtonElement>('recenter');

watchLayout();

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
installMarkerScale(map);

installProbeLayers(map);

const game = new GameState(await loadSave());
const hud = new Hud(game);
const forge = new ForgePanel(game, (text) => hud.toast(text));
// Bank the time the app was closed, so offline production shows straight away.
game.tickHearthstead();
const player = new PlayerMarker(map);
const dressPlayer = () => player.setFigure(heroSvg(game.save.hero.cls, game.save.hero.look, 40));
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
  recenterEl.hidden = value || farsight.active;
  if (value && lastFix) map.easeTo({ center: [lastFix.lng, lastFix.lat], zoom: Math.max(map.getZoom(), 15) });
}

// Dragging orbits rather than pans, so only looking at a Waymark or a hunt stops following; the compass button resumes it.
recenterEl.addEventListener('click', () => setFollowing(true));

function useShrine(shrine: Shrine): void {
  if (!lastFix) return hud.toast('Find your location first to reach a shrine.');
  const away = haversine(lastFix, shrine);
  if (!onFoot(shrine)) return hud.toast(`${shrine.name} is ${Math.round(away)} m away. Walk until it is inside your ring to touch it.`);
  const blessing = BLESSINGS[shrine.kind];
  if (game.shrineReadyAt(shrine) > Date.now())
    return hud.toast(`${shrine.name} already blessed you today. Its ${blessing.name} (${blessing.effect}) returns tomorrow.`);
  if (game.useShrine(shrine, realmAt(map, shrine.lng, shrine.lat) ?? currentRealm ?? 'hearthfields')) sound.play('shrine');
  refreshWorld();
  showReach();
}

const shrines = new ShrineLayer(map, useShrine);
const curioLayer = new CurioLayer(map, (curio) => takeCurio(curio));

// Creatures: the collection, wild spawns around the player, and the companion at their side.
const collection = loadCollection();
// One of each kind: fold any second Wildling of a kind into the first, and send its expedition home under the one kept.
const folded = mergeDuplicates(collection);
if (folded.size) {
  for (const e of game.save.expeditions) e.petUid = folded.get(e.petUid) ?? e.petUid;
  game.save.expeditions = game.save.expeditions.filter((e, i, all) => all.findIndex((x) => x.petUid === e.petUid) === i);
  saveCollection(collection);
  game.changed();
}
const companionMarker = new CompanionMarker(map);
const followerMarker = new FollowerMarker(map, () => {
  // Bring its trust up to date first; it may decide to stay right then.
  settleFollower(followerTrust(collection, 0));
  if (collection.follower) openFollower(creatureGame);
});
/** Wildlings away on an expedition leave the party, and the companion's place goes to one at home. */
function benchAway(): void {
  const away = creatureGame.away?.();
  if (!away?.size) return;
  collection.lineup = collection.lineup.filter((uid) => !away.has(uid));
  if (collection.companionUid && away.has(collection.companionUid)) collection.companionUid = collection.pets.find((p) => !away.has(p.uid))?.uid ?? collection.companionUid;
}

const creatureGame: GameContext = {
  collection,
  changed() {
    benchAway();
    saveCollection(collection);
    companionMarker.setPet(companion(collection));
    followerMarker.set(collection.follower);
    journal.setBadge('bestiary', collection.pets.some((p) => evolutionStatus(p)?.ready));
  },
};
creatureGame.away = () => new Set(game.save.expeditions.map((e) => e.petUid));
creatureGame.wayfarer = {
  level: () => game.level.level,
  tonics: () => game.save.supplies.tonic,
  useTonic: () => game.useTonic(),
  hero: () => game.heroPower(),
  heroName: () => game.save.hero.name,
  mana: () => game.mana,
  maxMana: () => game.maxMana,
  spellCost: (spell) => game.spellCost(spell),
  spendMana: (spell) => game.spendMana(spell),
  findGear: (foe) => game.findGear({ kind: 'foe', ...foe })?.text ?? null,
  gear: () => {
    const b = game.bonuses();
    return { petDamage: b.petDamage + (isNight() ? b.nightDamage : 0), petHealth: b.petHealth, catchBonus: b.catchBonus };
  },
};
creatureGame.changed();
journal.onShow('wayfarer', () => renderParty($('satchel-party'), creatureGame));
journal.onShow('bestiary', () =>
  renderBestiary(creatureGame, { body: journal.pane('bestiary'), setTitle: (text) => journal.setTitle(text), close: () => journal.close() }),
);
new HearthsteadPanel(game, (text) => hud.toast(text));
new WantedBoard({
  posts: () => wanted(),
  claimed: (id) => id in collection.cleared,
  here: () => lastFix,
  show(post) {
    journal.close();
    setFollowing(false);
    map.easeTo({ center: [post.spawn.lng, post.spawn.lat], zoom: Math.max(map.getZoom(), 16) });
  },
});
new ExpeditionsPanel(game, creatureGame, (text) => hud.toast(text));
new HeroPanel(game, forge, (text) => hud.toast(text));
new BagPanel(game, creatureGame, (text) => hud.toast(text));

// Glyphwalking: the shape of the walk, kept in memory only, and the Waymarks it ties.
const trace = new Trace();
const glyphLayer = new GlyphLayer(map);
glyphLayer.showWaymarks(game.save.waymarks);
game.on((e) => e.kind === 'glyph' && glyphLayer.showWaymarks(game.save.waymarks));
// A Ring walked in the companion's home realm is the last step of its evolution.
game.on((e) => {
  if (e.kind !== 'glyph' || e.glyph.kind !== 'ring') return;
  const rung = ringInRealm(collection, e.realm);
  if (!rung) return;
  const name = getSpecies(rung.pet.speciesId).name;
  sound.play('discover');
  toast(rung.ready ? `${name} is glowing… it's ready to evolve! Open its page in the Bestiary.` : `${name} felt the Ring close around its home. One step nearer to changing.`);
  creatureGame.changed();
});

/** Removes a spawn that was caught, beaten or fled; only the first two earn Wayfarer XP, less by Farsight. */
function clearSpawn(spawn: Spawn, won: boolean, remote = false): void {
  collection.cleared[spawn.id] = spawn.expiresAt;
  creatures.remove(spawn.id);
  if (won) {
    game.grantXp(CREATURE_XP[spawn.rarity] * (remote ? FARSIGHT_SHARE : 1));
    game.changed();
  }
  creatureGame.changed();
}

/** Pays a Wanted poster's bounty on top of the fight's own spoils; by Farsight it pays a share. */
function claimBounty(bounty: Bounty, remote: boolean): void {
  const share = remote ? FARSIGHT_SHARE : 1;
  const coin = Math.round(bounty.coin * share);
  const xp = Math.round(bounty.xp * share);
  game.save.currencies.coin += coin;
  game.grantXp(xp);
  const gear = bounty.gear ? game.findGear({ kind: 'chest', hints: 0 }) : null;
  game.changed();
  sound.play('coin');
  toast(`Bounty on ${bounty.name} claimed: +${coin} coin, +${xp} XP.${gear ? ` ${gear.text}` : ''}`);
}

/** A follower has been won over, or has given up and wandered off. */
function settleFollower(outcome: FollowOutcome): void {
  if (outcome?.kind === 'joined') {
    const species = getSpecies(outcome.pet.speciesId);
    game.grantXp(CREATURE_XP[species.rarity]);
    game.changed();
    openJoined(creatureGame, outcome.pet, outcome.upgraded, outcome.fromLevel, outcome.gained);
  }
  creatureGame.changed();
}

/** Within the purple ring of where the Wayfarer actually stands. */
const onFoot = (p: { lat: number; lng: number }) => !!lastFix && haversine(lastFix, p) <= playerReach(game.bonuses().reachM);
/** How far Farsight sees: a lantern widens it three times as much as it widens reach. */
const farsightReach = () => farsightRange(game.bonuses().reachM);
/** In Farsight, and inside the dashed ring the eye may roam. */
const byFarsight = (p: { lat: number; lng: number }) => farsight.active && !!lastFix && haversine(lastFix, p) <= farsightReach();

function meet(spawn: Spawn, encounter: Encounter): void {
  // By Farsight anything on the map can be met, for a smaller reward; in person it pays in full.
  const remote = !onFoot(spawn);
  if (remote && !byFarsight(spawn)) {
    if (!lastFix) return;
    const metres = haversine(lastFix, spawn);
    sound.play('error');
    if (farsight.active) toast(`${encounter.species.name} is beyond Farsight's reach. Walk closer to see that far.`);
    else toast(`${encounter.species.name} is ${Math.ceil(metres - playerReach(game.bonuses().reachM))} m out of reach. Walk closer, or use Farsight 👁.`);
    return;
  }
  if (encounter.species.kind === 'pet') {
    openMeeting(creatureGame, spawn.id, encounter, () => clearSpawn(spawn, false));
  } else if (!companion(collection)) {
    toast('You need a companion to face Blotspawn.');
  } else {
    openBattle(creatureGame, encounter, (won) => {
      if (!won) return;
      clearSpawn(spawn, true, remote);
      if (encounter.bounty) claimBounty(encounter.bounty, remote);
      // A Wildling that sees you drive off a Blotspawn trusts you all the faster.
      if (collection.follower) settleFollower(followerTrust(collection, remote ? BLOT_TRUST_M / 2 : BLOT_TRUST_M));
    });
  }
}

const creatures = new CreatureMarkers(map, meet);
/** What stands on the map right now. */
let shown: { spawn: Spawn; encounter: Encounter }[] = [];
let foeHinted = false;

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
    // The eye button is the only way home from Farsight, so the compass stays hidden.
    following = false;
    recenterEl.setAttribute('aria-pressed', 'false');
    recenterEl.hidden = true;
    orbit.setFree(true);
    player.setFarsight(farsightReach());
    if (!seenFarsightHint()) {
      hud.toast(`Farsight: explore inside the dashed ring for ${Math.round(FARSIGHT_SHARE * 100)}% rewards. Walking pays full.`, 5000);
    }
    refreshAround(true);
  },
  exit() {
    orbit.setFree(false);
    player.setFarsight(0);
    setFollowing(true);
    refreshAround(true);
  },
});
// The eye stays on a leash: dragging past the dashed ring holds the lens on its edge.
let leashing = false;
map.on('move', () => {
  if (!farsight.active || !lastFix || leashing) return;
  const c = map.getCenter();
  const d = haversine(lastFix, c);
  const range = farsightReach();
  if (d <= range) return;
  const k = range / d;
  leashing = true;
  map.setCenter([lastFix.lng + (c.lng - lastFix.lng) * k, lastFix.lat + (c.lat - lastFix.lat) * k]);
  leashing = false;
});
/** Where play is happening: the lens while in Farsight, otherwise the Wayfarer. */
function focus(): { lat: number; lng: number } | null {
  if (!farsight.active) return lastFix;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng };
}

// The real sky: weather and night change what turns up, so spawns are read again when it turns.
const skyWatch = new SkyWatch((sky) => {
  hud.setSky(sky);
  refreshSpawns(true);
});
hud.setSky(skyWatch.sky);

// The Wanted board is pinned where the Wayfarer was first seen this week.
let wantedAt: WantedAnchor | null = null;
function wanted(): WantedPost[] | null {
  if (!lastFix) return null;
  if (wantedAt?.week !== lairWeek(Date.now())) wantedAt = wantedAnchor(lastFix.lat, lastFix.lng);
  return wantedPosts(wantedAt, partyLevel(collection));
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
  // Blotspawn measure themselves against the whole party, not just whoever walks along.
  const level = partyLevel(collection);
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
  // Boss lairs hold the same spot all week and rise to meet your strongest pet.
  const strongest = Math.max(1, ...collection.pets.map((p) => p.level));
  const lairs = lairsNear(fix.lat, fix.lng, now, strongest).filter(({ spawn }) => !(spawn.id in collection.cleared));
  // Inkbinders camp for a day with three Taken, levelled against the party they will fight.
  const rivals = rivalsNear(fix.lat, fix.lng, now, level).filter(({ spawn }) => !(spawn.id in collection.cleared));
  const posters = (wanted() ?? []).filter(({ spawn }) => !(spawn.id in collection.cleared));
  shown = [
    ...live
      .map((spawn) => ({ spawn, encounter: creatureForSpawn(spawn, level, skyWatch.sky) }))
      .filter(({ spawn, encounter }) => wildlingWanted(spawn.id, encounter, collection)),
    ...lairs,
    ...rivals,
    ...posters,
  ];
  creatures.show(shown, (e) => (e.species.kind === 'monster' ? foeThreat(e.level, level, e.rank, e.tier) : null));
  showReach();
}

/** Draws the reach ring and dims creatures outside it, so what looks near can be tapped. */
function showReach(): void {
  const fix = focus();
  if (!fix) return;
  if (lastFix) player.setReach(playerReach(game.bonuses().reachM));
  if (farsight.active) player.setFarsight(farsightReach());
  // By Farsight everything inside the dashed ring is in reach.
  creatures.markReach((spawn) => onFoot(spawn) || byFarsight(spawn));
  // Shrines need the Wayfarer in person; curios can still be taken by Farsight for a share.
  shrines.markReach(onFoot);
  curioLayer.markReach((curio) => onFoot(curio) || byFarsight(curio));
  const foeInReach = shown.some(
    ({ spawn, encounter }) => encounter.species.kind === 'monster' && !(spawn.id in collection.cleared) && (onFoot(spawn) || byFarsight(spawn)),
  );
  if (!foeHinted && companion(collection) && foeInReach) {
    foeHinted = true;
    toast('A Blotspawn is in reach! Tap it to fight.');
  }
}
game.on((e) => e.kind === 'change' && showReach());
setInterval(() => refreshSpawns(), SPAWN_REFRESH_MS);
// The first fix can arrive before tiles; look again once they have loaded.
map.once('idle', () => refreshSpawns(true));

// Curios: small daily finds. Walk past one to pick it up in full, or tap it by Farsight for a share.

function takeCurio(curio: Curio): void {
  const here = onFoot(curio);
  if (!here && !byFarsight(curio)) {
    sound.play('error');
    if (farsight.active) return toast(`${CURIO_KINDS[curio.kind].name} is beyond Farsight's reach.`);
    const away = lastFix ? `${Math.round(haversine(lastFix, curio))} m away. ` : '';
    toast(`${CURIO_KINDS[curio.kind].name}, ${away}Walk to it, or pick it up by Farsight 👁 for ${Math.round(FARSIGHT_SHARE * 100)}%.`);
    return;
  }
  const reward = game.findCurio(curio, realmAt(map, curio.lng, curio.lat) ?? currentRealm ?? 'hearthfields', here);
  curioLayer.remove(curio.id);
  if (!reward) return;
  sound.play('coin');
  toast(`${CURIO_KINDS[curio.kind].name}${here ? '' : ' (by Farsight)'}: ${rewardText(reward)}.${reward.gear ? ` ${reward.gear.text}` : ''}`);
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

/** Lists a reward as "+12 coin, +3 Ironbark". */
function rewardText(r: { coin?: number; xp?: number; wanderlight?: number; materials: Partial<Record<MaterialId, number>> }): string {
  return [
    r.coin && `+${r.coin} coin`,
    r.xp && `+${r.xp} XP`,
    r.wanderlight && `+${r.wanderlight} Wanderlight`,
    ...Object.entries(r.materials).map(([id, n]) => `+${n} ${MATERIALS[id as MaterialId].name}`),
  ]
    .filter(Boolean)
    .join(', ');
}

// Companion finds: every thousand steps or so the companion noses out something of its element.
function companionFinds(before: number, after: number): void {
  const pet = companion(collection);
  const count = findsBetween(before, after);
  if (!pet || !count) return;
  const species = getSpecies(pet.speciesId);
  const first = Math.floor(after / FIND_EVERY_M) - count + 1;
  for (let n = first; n < first + count; n++) {
    const find = companionFind(species.element, pet.level, n);
    game.takeFind(find);
    sound.play('coin');
    toast(`${species.name} sniffed something out: ${rewardText(find)}.`);
  }
}

// The daily wander trail: three ink marks within a kilometre, the last one holding a chest.
const trailLayer = new TrailLayer(map, (i) => tapTrailMark(i));

function reachTrailMark(i: number, how: 'foot' | 'farsight'): void {
  const mark = game.save.trail?.marks[i];
  if (!mark) return;
  const result = game.reachTrailMark(i, how, realmAt(map, mark.lng, mark.lat) ?? currentRealm ?? 'hearthfields');
  if (!result) return;
  trailLayer.show(game.save.trail);
  const by = how === 'farsight' ? ' (by Farsight)' : '';
  if (result.chest) {
    sound.play('reward');
    hud.toast(`Trail chest${by}: ${rewardText(result.chest)}.${result.chest.gear ? ` ${result.chest.gear.text}` : ''}`, 6000);
  } else {
    sound.play('discover');
    const done = marksReached(game.save.trail!);
    toast(`Trail mark ${done} of ${TRAIL_MARKS}${by}. ${done === TRAIL_MARKS - 1 ? 'The last one holds a chest.' : 'Two more to go.'}`);
  }
}

function tapTrailMark(i: number): void {
  const trail = game.save.trail;
  const mark = trail?.marks[i];
  if (!trail || !mark) return;
  if (mark.reached) return toast(trail.opened ? 'Today’s trail is walked. A new one is inked each morning.' : `Mark reached. ${TRAIL_MARKS - marksReached(trail)} still to go.`);
  if (onFoot(mark)) return reachTrailMark(i, 'foot');
  if (byFarsight(mark)) {
    if (peekUsed(trail)) return toast('You already peeked a mark today. Walk to this one.');
    return reachTrailMark(i, 'farsight');
  }
  sound.play('error');
  const away = lastFix ? `${Math.round(haversine(lastFix, mark))} m away. ` : '';
  toast(`Trail mark, ${away}Walk there, or peek one a day by Farsight 👁.`);
}

// The wandering peddler: one tent a day within a kilometre, selling one rare ware for coin.
const peddlerLayer = new PeddlerLayer(map, () => tapPeddler());

const wareName = (ware: PeddlerWare) =>
  ware.kind === 'rune' ? `${RUNES[ware.rune].name} rune` : `${RARITIES[ware.rarity].name} ${SLOT_DEFS[ware.slot].name}`;

function tapPeddler(): void {
  const peddler = game.save.peddler;
  const ware = game.peddlerWare();
  if (!peddler || !ware) return toast('The peddler has nothing you need today. Another comes tomorrow.');
  if (!onFoot(peddler)) {
    const away = lastFix ? `${Math.round(haversine(lastFix, peddler))} m away. ` : '';
    return hud.toast(`A peddler selling a ${wareName(ware)} for ${ware.price} coin, ${away}Walk there to trade.`, 5000);
  }
  openPeddler(ware);
}

function openPeddler(ware: PeddlerWare): void {
  const sheet = openSheet('Wandering peddler', { className: 'sheet-peddler' });
  const worn = ware.kind === 'gear' ? game.save.gear[ware.slot] : undefined;
  let line: string;
  if (ware.kind === 'rune') line = RUNES[ware.rune].blurb;
  else {
    const effect = SLOT_DEFS[ware.slot].effect(power({ rarity: ware.rarity, plus: worn?.plus ?? 0 }));
    const swap = worn
      ? `replaces your ${RARITIES[worn.rarity].name} ${SLOT_DEFS[ware.slot].name}${worn.plus ? ` and keeps its +${worn.plus}` : ''}`
      : 'fills an empty slot';
    line = `${effect}, ${swap}.`;
  }
  const art =
    ware.kind === 'rune'
      ? `<span class="peddler-rune">${RUNES[ware.rune].name[0]}</span>`
      : gearSvg({ slot: ware.slot, rarity: ware.rarity, plus: worn?.plus ?? 0 }, 64);
  const coin = game.save.currencies.coin;
  const artBox = h('div', { class: 'peddler-ware' });
  artBox.innerHTML = art;
  const color = ware.kind === 'gear' ? RARITIES[ware.rarity].color : '#5b3f8a';
  sheet.body.append(
    artBox,
    h('p', { class: 'peddler-name', style: `color:${color}` }, wareName(ware)),
    h('p', { class: 'peddler-line' }, line),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Leave'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          disabled: coin < ware.price,
          onclick: () => {
            const text = game.buyFromPeddler();
            sheet.close();
            if (!text) return;
            sound.play('reward');
            peddlerLayer.show(game.save.peddler);
            hud.toast(`${text} The peddler packs up.`, 5000);
          },
        },
        coin < ware.price ? `Need ${ware.price} coin` : `Buy, ${ware.price} coin`,
      ),
    ),
  );
}

/** Draws today's trail around the Wayfarer, and reaches any mark they walk up to. */
function walkTrail(fix: Fix): void {
  const { trail, fresh } = game.trail(fix);
  trailLayer.show(trail);
  const { peddler, fresh: newPeddler } = game.peddler(fix);
  peddlerLayer.show(peddler);
  peddlerLayer.markReach(onFoot(peddler));
  const camp = newPeddler && game.peddlerWare() ? ' A peddler has pitched a tent nearby, too.' : '';
  if (fresh) hud.toast(`A wander trail is inked on your map: three marks within a kilometre, and a chest at the last.${camp}`, 6000);
  else if (camp) hud.toast(camp.trim().replace(', too.', '.'), 5000);
  trail.marks.forEach((mark, i) => !mark.reached && onFoot(mark) && reachTrailMark(i, 'foot'));
}

/** Re-reads spawns, curios and shrines around the lens or the Wayfarer. */
function refreshAround(force = false): void {
  refreshSpawns(force);
  showReach();
  refreshCurios();
  refreshWorld();
}
map.on('moveend', () => farsight.active && refreshAround());

// First play: who the hero is, then the first companion.
const meetCompanion = () => {
  if (!collection.pets.length) openStarterChoice(creatureGame);
};
if (!game.save.hero.cls) openHeroChoice(game, meetCompanion);
else meetCompanion();

// Treasure hunts: riddles that lead to real landmarks.
const hunts = new HuntController({
  map,
  game,
  position: () => lastFix,
  reach: () => playerReach(game.bonuses().reachM),
  realmAt: (lat, lng) => realmAt(map, lng, lat),
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
/** Banks what roosting Wildlings gathered while you were busy or away. */
function gatherRoostNow(): void {
  const found = gatherRoost(collection, Date.now(), creatureGame.away?.());
  const parts = Object.entries(found).map(([id, n]) => `${n} ${materialName(id as MaterialId)}`);
  if (!parts.length) return;
  game.addMaterials(found);
  game.changed();
  creatureGame.changed();
  toast(`Your Roost gathered ${parts.join(', ')}.`);
}
gatherRoostNow();

setInterval(() => {
  // A follower warms to you just by staying near, even with the app closed.
  if (collection.follower) settleFollower(followerTrust(collection, 0));
  gatherRoostNow();
  refreshWorld();
  hud.render();
}, 15_000);

function onFix(fix: Fix): void {
  const firstFix = !lastFix;
  lastFix = fix;
  showNotice(null);
  player.update(fix);
  companionMarker.update(fix.lng, fix.lat);
  followerMarker.update(fix.lng, fix.lat);

  const metres = walk.add(fix);
  if (metres > 0) {
    const walkedBefore = game.save.distanceMetres;
    game.recordWalk(metres);
    companionFinds(walkedBefore, game.save.distanceMetres);
    const before = companion(collection)?.level;
    const reward = walkRewards(collection, metres);
    const pet = companion(collection);
    if (pet && reward.levels > 0 && before !== pet.level) {
      sound.play('levelUp');
      toast(`${getSpecies(pet.speciesId).name} grew to level ${pet.level} on the road!`);
    }
    const bonded = walkBond(collection, metres);
    if (bonded) {
      sound.play('discover');
      toast(`${getSpecies(bonded.speciesId).name} learned its bond move, ${bondMoveFor(bonded.speciesId)?.name}, from your walks together!`);
    }
    if (collection.follower) settleFollower(followerTrust(collection, metres));
    const readyToEvolve = walkInRealm(collection, metres, currentRealm);
    if (readyToEvolve) {
      sound.play('discover');
      toast(`${getSpecies(readyToEvolve.speciesId).name} is glowing… it's ready to evolve! Open its page in the Bestiary.`);
    }
    creatureGame.changed();
  }
  if (fix.accuracy <= 30) {
    for (const glyph of trace.add(fix)) {
      game.castGlyph(glyph, currentRealm);
      if (glyph.kind === 'knot') refreshSpawns(true);
    }
    glyphLayer.showTrace(trace.line);
  }
  skyWatch.update(fix.lat, fix.lng);
  refreshSpawns(firstFix);
  showReach();
  if (firstFix || !farsight.active) refreshCurios();
  pickUpNearby(fix);
  walkTrail(fix);
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
  else if (collection.follower) settleFollower(followerTrust(collection, 0));
});

sound.install();

registerSW({ immediate: true });
setupInstallButton($<HTMLButtonElement>('install'), showNotice, $('install-row'));
