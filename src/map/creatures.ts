import { Marker, type Map } from 'maplibre-gl';
import type { OwnedPet } from '../creatures/collection';
import { hashString } from '../creatures/rng';
import { getSpecies } from '../creatures/species';
import { inkAt, type Parcel } from '../game/demesne';
import { residentSpot } from './residentSpot';
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
      const rankName = encounter.rank === 'elite' ? 'Elite ' : encounter.rank === 'rare' ? 'Rare ' : '';
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

/**
 * Marginalia: Wildlings settled in the Demesne, drawn in the parcels they live in. They fade
 * with the parcel's ink, so a neglected border shows its residents growing faint.
 */
export class ResidentMarkers {
  private placed = new globalThis.Map<string, { marker: Marker; key: string }>();

  constructor(private readonly map: Map) {}

  show(parcels: readonly Parcel[], pets: readonly OwnedPet[], now = Date.now()): void {
    const byUid = new globalThis.Map(pets.map((p) => [p.uid, p]));
    const seen = new Set<string>();
    for (const parcel of parcels) {
      const ink = inkAt(parcel, now);
      parcel.residents.forEach((uid, i) => {
        const pet = byUid.get(uid);
        if (!pet) return;
        seen.add(uid);
        // Redraw when the pet moves house or evolves.
        const key = `${parcel.id}:${pet.speciesId}:${i}`;
        let placed = this.placed.get(uid);
        if (placed && placed.key !== key) {
          placed.marker.remove();
          placed = undefined;
        }
        if (!placed) {
          const el = document.createElement('div');
          el.className = 'map-resident';
          el.style.setProperty('--bob', `${(hashString(uid) % 1000) / 1000}s`);
          const name = getSpecies(pet.speciesId).name;
          el.title = `${name} lives in ${parcel.name}`;
          el.setAttribute('aria-label', el.title);
          el.appendChild(createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 40, facing: hashString(uid) % 2 ? 1 : -1 }));
          const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat(residentSpot(parcel, uid, i)).addTo(this.map);
          placed = { marker, key };
          this.placed.set(uid, placed);
        }
        placed.marker.getElement().style.opacity = (0.45 + 0.55 * ink).toFixed(2);
      });
    }
    for (const [uid, placed] of this.placed)
      if (!seen.has(uid)) {
        placed.marker.remove();
        this.placed.delete(uid);
      }
  }
}
