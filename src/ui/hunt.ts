import './hunt.css';
import type { Map } from 'maplibre-gl';
import { sound } from '../audio/sound';
import { railButtons } from './layout';
import { journal } from './journal';
import type { Fix } from '../geo/distance';
import type { GameState } from '../game/state';
import { MATERIALS, REALMS, type MaterialId, type RealmId } from '../game/realms';
import {
  buyHint,
  chooseLandmark,
  finishHunt,
  HINT_COST,
  HUNT_MAX_M,
  huntClues,
  loadHuntLog,
  MAX_HINTS,
  metresToNextHint,
  saveHuntLog,
  searchArea,
  startHunt,
  walkHunt,
  warmth,
  WARMTH_TEXT,
  type ActiveHunt,
  type Treasure,
  type Warmth,
} from '../hunts/hunt';
import { HuntLayer, landmarksNear } from '../map/huntLayer';
import { h, openSheet, toast, wait } from './dom';

export interface HuntDeps {
  map: Map;
  game: GameState;
  /** The latest GPS fix, if any. */
  position(): Fix | null;
  realmAt(lat: number, lng: number): RealmId | undefined;
  /** Gives binding seals, which the creatures code owns. */
  addSeals(n: number): void;
  /** Stops the map following the player, as a hand pan does. */
  stopFollowing(): void;
  /** Called after a hunt starts, ends or moves on. */
  onChange(): void;
}

const SCROLL_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M12 9h24a4 4 0 014 4v0a4 4 0 01-4 4h-2v20a4 4 0 01-4 4H10a4 4 0 01-4-4v0a4 4 0 014-4h2z" fill="#e8d9b5" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M12 37V13a4 4 0 014-4" fill="none" stroke="currentColor" stroke-width="2.4"/>
  <path d="M18 20l8 8M26 20l-8 8" stroke="#8a2d1c" stroke-width="3" stroke-linecap="round"/>
  <path d="M16 32q4-2 8 0t8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/>
</svg>`;

const CHEST_ICON = `<svg class="hunt-chest" viewBox="0 0 120 100" aria-hidden="true">
  <g class="hunt-chest-glow"><circle cx="60" cy="52" r="40" fill="#f3d27a" opacity=".55"/></g>
  <path d="M18 50h84v38a4 4 0 01-4 4H22a4 4 0 01-4-4z" fill="#7a4a24" stroke="#2f2014" stroke-width="3"/>
  <path d="M18 62h84M54 50v42M66 50v42" stroke="#c99a3a" stroke-width="4"/>
  <rect x="53" y="58" width="14" height="14" rx="2" fill="#f3d27a" stroke="#2f2014" stroke-width="2"/>
  <g class="hunt-chest-lid">
    <path d="M18 50V38a20 16 0 0120-16h44a20 16 0 0120 16v12z" fill="#8a5a2c" stroke="#2f2014" stroke-width="3"/>
    <path d="M54 22v28M66 22v28" stroke="#c99a3a" stroke-width="4"/>
  </g>
</svg>`;

/** Draws the scroll icon at list size. */
function scrollIcon(): HTMLElement {
  const span = h('span', { class: 'journal-link-icon', 'aria-hidden': 'true' });
  span.innerHTML = SCROLL_ICON;
  return span;
}

/** The treasure hunt: its map button, the treasure map sheet, and the chest at the end. */
export class HuntController {
  private log = loadHuntLog();
  private readonly layer: HuntLayer;
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private last: Warmth | undefined;
  private chestReady = false;
  /** A found chest waiting to be opened. */
  private pending: { treasure: Treasure; name: string; hints: number; material: string } | null = null;

  constructor(private readonly deps: HuntDeps) {
    this.layer = new HuntLayer(deps.map);
    this.label = h('span', { class: 'hunt-button-label' }, 'Hunt');
    this.button = h('button', { class: 'hunt-button', type: 'button', 'aria-label': 'Treasure hunt', onclick: () => this.open() });
    this.button.innerHTML = SCROLL_ICON;
    this.button.append(this.label);
    // On the map only while a hunt is under way; hunts start from the journal.
    railButtons('right').append(this.button);
    document.getElementById('satchel-hunt')?.append(
      h('button', { class: 'journal-link', type: 'button', onclick: () => (journal.close(), this.open()) }, scrollIcon(), 'Treasure hunts'),
    );
    this.render();
  }

  private get hunt(): ActiveHunt | null {
    return this.log.active;
  }

  private persist(): void {
    saveHuntLog(this.log);
    this.render();
    this.deps.onChange();
  }

  /** True for the place being hunted, so its wayshrine pin does not give the answer away. */
  hides(place: { name: string; lat: number; lng: number }): boolean {
    const target = this.hunt?.landmark;
    return !!target && target.name === place.name && Math.abs(target.lat - place.lat) < 3e-4 && Math.abs(target.lng - place.lng) < 5e-4;
  }

  /** Feeds a GPS fix and the metres walked since the last one. */
  update(fix: Fix, metres: number): void {
    const hunt = this.hunt;
    if (!hunt) return;
    if (metres > 0) {
      const fresh = walkHunt(hunt, metres);
      if (fresh > 0) sound.play('coin');
      if (fresh > 0) toast(fresh > 1 ? 'Your walking uncovered new clues on the treasure map!' : 'Your walking uncovered a new clue on the treasure map!');
    }
    const w = warmth(hunt, fix).warmth;
    if (w === 'found') return this.arrive();
    if (w !== this.last && (w === 'burning' || w === 'hot')) toast(`${WARMTH_TEXT[w]} The treasure is close.`);
    this.last = w;
    this.persist();
  }

  private render(): void {
    const hunt = this.hunt;
    this.button.hidden = !hunt && !this.chestReady;
    this.button.classList.toggle('hunt-active', !!hunt);
    this.button.classList.toggle('hunt-ready', this.chestReady);
    this.label.textContent = this.chestReady ? 'Open!' : hunt ? (this.last ? WARMTH_TEXT[this.last] : 'Hunting') : 'Hunt';
    this.button.dataset.warmth = this.last ?? '';
    this.layer.setArea(hunt ? searchArea(hunt) : null);
  }

  private arrive(): void {
    const hunt = this.hunt;
    if (!hunt) return;
    const landmark = hunt.landmark;
    const treasure = finishHunt(this.log)!;
    this.last = undefined;
    const material = this.grant(treasure, landmark.lat, landmark.lng);
    this.layer.markFound(landmark);
    this.pending = { treasure, name: landmark.name, hints: hunt.hints, material };
    // Never close a battle or catch to show the chest; wait for a tap instead.
    if (document.querySelector('.sheet-backdrop, dialog[open]')) {
      this.chestReady = true;
      toast(`You found ${landmark.name}! Tap the treasure map to open the chest.`);
    } else {
      void this.showChest();
    }
    this.persist();
  }

  /** Pays out a chest; returns the name of the realm material it held. */
  private grant(t: Treasure, lat: number, lng: number): string {
    const { game } = this.deps;
    const realm = this.deps.realmAt(lat, lng) ?? 'hearthfields';
    const material = REALMS[realm].material;
    const materials: Partial<Record<MaterialId, number>> = { [material]: t.materials };
    if (t.relic) materials.shrineRelic = (materials.shrineRelic ?? 0) + 1;
    game.save.currencies.coin += t.coin;
    game.save.currencies.wanderlight += t.wanderlight;
    game.addMaterials(materials);
    game.grantXp(t.xp);
    game.changed();
    this.deps.addSeals(t.seals);
    return MATERIALS[material].name;
  }

  private async showChest(): Promise<void> {
    const found = this.pending;
    if (!found) return;
    this.pending = null;
    this.chestReady = false;
    this.render();
    const { treasure: t } = found;
    const sheet = openSheet(`${t.title}!`, { className: 'hunt-sheet' });
    const stage = h('div', { class: 'hunt-chest-stage' });
    stage.innerHTML = CHEST_ICON;
    const loot = h('ul', { class: 'hunt-loot' });
    sheet.body.append(
      h('p', { class: 'hunt-found' }, `You solved the riddle and found `, h('b', {}, found.name), '.'),
      stage,
      loot,
      h('p', { class: 'hint' }, found.hints === 0 ? 'Solved with no clues at all. A true pathfinder!' : `Solved with ${found.hints} extra ${found.hints === 1 ? 'clue' : 'clues'}. Fewer clues fill the chest richer.`),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.open() }, 'Seek another'), h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Close')),
    );
    await wait(350);
    stage.classList.add('open');
    sound.play('reward');
    await wait(500);
    const lines = [
      `${t.coin} coin`,
      `${t.xp} Wayfarer XP`,
      `${t.wanderlight} Wanderlight`,
      `${t.seals} binding ${t.seals === 1 ? 'seal' : 'seals'}`,
      `${t.materials} ${found.material}`,
      t.relic && `1 ${MATERIALS.shrineRelic.name}`,
    ];
    for (const line of lines) {
      if (!line) continue;
      loot.append(h('li', {}, line));
      await wait(140);
    }
  }

  /** Opens the treasure map: the current riddle and clues, or a way to begin a hunt. */
  open(): void {
    if (this.chestReady) {
      void this.showChest();
      return;
    }
    const hunt = this.hunt;
    if (!hunt) return this.openIdle();
    const sheet = openSheet('Treasure map', { className: 'hunt-sheet' });
    const clues = huntClues(hunt);
    const fix = this.deps.position();
    const w = fix ? warmth(hunt, fix).warmth : undefined;
    const next = metresToNextHint(hunt);
    const light = this.deps.game.save.currencies.wanderlight;
    const buy = h(
      'button',
      { class: 'btn', type: 'button', disabled: hunt.hints >= MAX_HINTS || light < HINT_COST },
      `Reveal a clue (${HINT_COST} Wanderlight)`,
    );
    buy.addEventListener('click', () => {
      if (this.deps.game.save.currencies.wanderlight < HINT_COST || !buyHint(hunt)) return;
      this.deps.game.save.currencies.wanderlight -= HINT_COST;
      this.deps.game.changed();
      this.persist();
      this.open();
    });
    sheet.body.append(
      h('p', { class: 'hunt-intro' }, 'Somewhere near, a treasure waits at a real landmark. Read the riddle, follow the clues, and walk to it.'),
      h(
        'ol',
        { class: 'hunt-clues' },
        ...clues.map((clue, i) => h('li', { class: i === 0 ? 'hunt-riddle' : '' }, clue)),
      ),
      w ? h('p', { class: `hunt-warmth hunt-warmth-${w}` }, WARMTH_TEXT[w]) : h('p', { class: 'hint' }, 'Find your location to feel how warm you are.'),
      h(
        'p',
        { class: 'hint' },
        next === undefined
          ? 'Every clue is uncovered. The red circle on the map shows where to search.'
          : `Walk ${Math.ceil(next)} m more to uncover the next clue. The red circle on the map shrinks with each one.`,
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (sheet.close(), this.showArea()) }, 'Show on map'),
        buy,
      ),
      h('button', { class: 'link-back hunt-abandon', type: 'button', onclick: () => this.abandon(sheet.close) }, 'Abandon this hunt'),
    );
  }

  private openIdle(): void {
    const sheet = openSheet('Treasure hunts', { className: 'hunt-sheet' });
    const recent = this.log.solved.slice(0, 10);
    sheet.body.append(
      h('p', { class: 'hunt-intro' }, 'Cartographers of old hid chests at the landmarks of this land. Take a treasure map, solve its riddle, and walk to the place it speaks of.'),
      h('p', { class: 'hint' }, 'Walking uncovers more clues. The fewer clues you need, the richer the chest.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => void this.begin() }, 'Take a treasure map')),
      h('h3', {}, `Treasures found: ${this.log.found.length}`),
      recent.length
        ? h('ul', { class: 'hunt-log' }, ...recent.map((r) => h('li', {}, r.landmark.name, h('small', {}, r.hints === 0 ? ' · no clues' : ` · ${r.hints} ${r.hints === 1 ? 'clue' : 'clues'}`))))
        : h('p', { class: 'hint' }, 'No treasure found yet.'),
    );
  }

  private async begin(): Promise<void> {
    const fix = this.deps.position();
    if (!fix) return toast('Find your location first to take a treasure map.');
    const { map } = this.deps;
    let landmark = chooseLandmark(fix, landmarksNear(map, fix.lat, fix.lng, HUNT_MAX_M), this.log.found);
    if (!landmark && map.getZoom() > 14.2) {
      // Too little of the land is loaded; glance wider to chart more landmarks.
      const zoom = map.getZoom();
      map.easeTo({ center: [fix.lng, fix.lat], zoom: 14, duration: 500 });
      await new Promise<void>((resolve) => map.once('idle', () => resolve()));
      landmark = chooseLandmark(fix, landmarksNear(map, fix.lat, fix.lng, HUNT_MAX_M), this.log.found);
      map.easeTo({ zoom, duration: 500 });
    }
    if (!landmark) {
      toast('No uncharted landmarks lie within reach. Walk towards a busier street and try again.');
      return;
    }
    sound.play('open');
    this.log.active = startHunt(landmark, fix);
    this.last = undefined;
    this.persist();
    this.open();
  }

  private abandon(close: () => void): void {
    if (!confirm('Abandon this treasure hunt? The landmark can turn up again later.')) return;
    this.log.active = null;
    this.last = undefined;
    this.persist();
    close();
    toast('You fold the treasure map away.');
  }

  /** Fits the search circle on screen. */
  private showArea(): void {
    const hunt = this.hunt;
    if (!hunt) return;
    const { lat, lng, radiusM } = searchArea(hunt);
    const dLat = radiusM / 111_320;
    const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
    this.deps.map.fitBounds(
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat + dLat],
      ],
      { padding: 60, duration: 900, maxZoom: 17 },
    );
    this.deps.stopFollowing();
  }
}
