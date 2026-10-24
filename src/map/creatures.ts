import { Marker, type Map } from 'maplibre-gl';
import type { Follower, OwnedPet } from '../creatures/collection';
import type { Spawn } from '../game/spawns';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';

interface Placed {
  marker: Marker;
  spawn: Spawn;
}

/** Wild creatures standing on the map. Tapping one reports it with its encounter. */
export class CreatureMarkers {
  private placed = new globalThis.Map<string, Placed>();

  constructor(
    private readonly map: Map,
    private readonly onTap: (spawn: Spawn, encounter: Encounter) => void,
  ) {}

  /** Shows exactly these spawns, keeping markers that are already up. */
  show(entries: { spawn: Spawn; encounter: Encounter }[]): void {
    const keep = new Set(entries.map((e) => e.spawn.id));
    for (const [id, placed] of this.placed)
      if (!keep.has(id)) {
        placed.marker.remove();
        this.placed.delete(id);
      }
    for (const { spawn, encounter } of entries) {
      if (this.placed.has(spawn.id)) continue;
      const el = document.createElement('button');
      el.type = 'button';
      const rank = encounter.rank && encounter.rank !== 'normal' ? ` map-creature-rank-${encounter.rank}` : '';
      el.className = `map-creature map-creature-${encounter.species.kind} map-creature-${encounter.species.rarity}${rank}`;
      el.dataset.lngLat = `${spawn.lng},${spawn.lat}`;
      const rankName = encounter.rank === 'boss' ? 'Boss ' : encounter.rank === 'elite' ? 'Elite ' : encounter.rank === 'rare' ? 'Rare ' : '';
      el.setAttribute('aria-label', `${encounter.species.kind === 'pet' ? 'Wild' : `Hostile ${rankName}`}${encounter.species.name}, level ${encounter.level}`);
      el.appendChild(createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 64 }));
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onTap(spawn, encounter);
      });
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([spawn.lng, spawn.lat]).addTo(this.map);
      this.placed.set(spawn.id, { marker, spawn });
    }
  }

  /** Dims creatures the player cannot reach yet, so near-looking ones are not a surprise. */
  markReach(inReach: (spawn: Spawn) => boolean): void {
    for (const { marker, spawn } of this.placed.values()) marker.getElement().classList.toggle('out-of-reach', !inReach(spawn));
  }

  remove(id: string): void {
    this.placed.get(id)?.marker.remove();
    this.placed.delete(id);
  }
}

/** The current companion trotting beside the player token. */
export class CompanionMarker {
  private readonly marker: Marker;
  private shownUid: string | null = null;
  private placed = false;
  private readonly el: HTMLElement;

  constructor(private readonly map: Map) {
    this.el = document.createElement('div');
    this.el.className = 'map-companion';
    this.marker = new Marker({ element: this.el, anchor: 'bottom', offset: [-34, 4] });
  }

  setPet(pet: OwnedPet | null): void {
    if ((pet?.uid ?? null) === this.shownUid) return;
    this.shownUid = pet?.uid ?? null;
    this.el.replaceChildren();
    if (pet) this.el.appendChild(createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 48 }));
  }

  update(lng: number, lat: number): void {
    this.marker.setLngLat([lng, lat]);
    if (!this.placed) {
      this.marker.addTo(this.map);
      this.placed = true;
    }
  }
}

/** A wild Wildling trailing the Wayfarer, with how far it still wants to walk. */
export class FollowerMarker {
  private readonly marker: Marker;
  private shown: string | null = null;
  private placed = false;
  private readonly el: HTMLElement;
  private readonly art: HTMLElement;
  private readonly label: HTMLElement;

  constructor(private readonly map: Map) {
    this.art = document.createElement('div');
    this.label = document.createElement('span');
    this.label.className = 'map-follower-left';
    this.el = document.createElement('div');
    this.el.className = 'map-follower';
    this.el.append(this.art, this.label);
    this.marker = new Marker({ element: this.el, anchor: 'bottom', offset: [36, 10] });
  }

  set(follower: Follower | null | undefined): void {
    const key = follower ? `${follower.spawnId}` : null;
    if (key !== this.shown) {
      this.shown = key;
      this.art.replaceChildren();
      if (follower) this.art.appendChild(createCreatureSvg({ speciesId: follower.speciesId, seed: follower.seed, size: 42, facing: -1 }));
    }
    this.el.hidden = !follower;
    if (follower) this.label.textContent = `${Math.max(0, Math.ceil(follower.needM - follower.walkedM))} m`;
  }

  update(lng: number, lat: number): void {
    this.marker.setLngLat([lng, lat]);
    if (!this.placed) {
      this.marker.addTo(this.map);
      this.placed = true;
    }
  }
}
