import { Marker, type Map } from 'maplibre-gl';
import type { Follower, OwnedPet } from '../creatures/collection';
import type { Spawn } from '../game/spawns';
import type { Encounter } from '../creatures/stats';
import { THREATS, type Threat } from '../creatures/foes';
import { createCreatureSvg } from '../creatures/view';
import { inkbinderSvg } from '../creatures/art/inkbinder';

interface Placed {
  marker: Marker;
  spawn: Spawn;
  encounter: Encounter;
}

/** Wild creatures standing on the map. Tapping one reports it with its encounter. */
export class CreatureMarkers {
  private placed = new globalThis.Map<string, Placed>();

  constructor(
    private readonly map: Map,
    private readonly onTap: (spawn: Spawn, encounter: Encounter) => void,
  ) {}

  /**
   * Shows exactly these spawns, keeping markers that are already up. Foes with a threat get a
   * small level chip coloured by how hard they are for the party.
   */
  show(entries: { spawn: Spawn; encounter: Encounter }[], threat: (e: Encounter) => Threat | null = () => null): void {
    const keep = new Set(entries.map((e) => e.spawn.id));
    for (const [id, placed] of this.placed)
      if (!keep.has(id)) {
        placed.marker.remove();
        this.placed.delete(id);
      }
    for (const { spawn, encounter } of entries) {
      const existing = this.placed.get(spawn.id);
      if (existing) {
        // The party may have changed, and with it the foe's level and how hard it looks.
        existing.encounter = encounter;
        setLevelChip(existing.marker.getElement(), encounter, threat(encounter));
        continue;
      }
      const el = document.createElement('button');
      el.type = 'button';
      const rival = encounter.rival;
      const rank = rival ? ` map-creature-rival map-creature-rival-${rival.grade}` : encounter.rank && encounter.rank !== 'normal' ? ` map-creature-rank-${encounter.rank}` : '';
      el.className = `map-creature map-creature-${encounter.species.kind} map-creature-${encounter.species.rarity}${rank}`;
      el.dataset.lngLat = `${spawn.lng},${spawn.lat}`;
      const rankName = encounter.rank === 'boss' ? 'Boss ' : encounter.rank === 'elite' ? 'Elite ' : encounter.rank === 'rare' ? 'Rare ' : '';
      el.setAttribute(
        'aria-label',
        rival
          ? `${rival.grade === 'arch' ? 'Archbinder' : 'Inkbinder'} ${rival.name} with three Taken, level ${encounter.level}`
          : `${encounter.species.kind === 'pet' ? 'Wild' : `Hostile ${rankName}`}${encounter.species.name}, level ${encounter.level}`,
      );
      // An Inkbinder's camp shows the Inkbinder; their Taken wait on the challenge sheet.
      if (rival) el.insertAdjacentHTML('beforeend', inkbinderSvg(rival, 52));
      else el.appendChild(createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 64 }));
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onTap(spawn, this.placed.get(spawn.id)?.encounter ?? encounter);
      });
      setLevelChip(el, encounter, threat(encounter));
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([spawn.lng, spawn.lat]).addTo(this.map);
      this.placed.set(spawn.id, { marker, spawn, encounter });
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

/** The level chip on a foe marker: always the same size, its colour says easy, even, hard or deadly. */
function setLevelChip(el: HTMLElement, encounter: Encounter, threat: Threat | null): void {
  let chip = el.querySelector<HTMLElement>('.foe-level');
  if (!threat) {
    chip?.remove();
    return;
  }
  if (!chip) {
    chip = document.createElement('span');
    chip.setAttribute('aria-hidden', 'true');
    el.append(chip);
  }
  chip.className = `foe-level threat-${threat}`;
  chip.textContent = String(encounter.level);
  chip.title = `Level ${encounter.level} · ${THREATS[threat].name}`;
  const label = el.getAttribute('aria-label')?.replace(/, (easy|even|hard|deadly) for your party$/, '') ?? '';
  el.setAttribute('aria-label', `${label.replace(/level \d+/, `level ${encounter.level}`)}, ${THREATS[threat].name.toLowerCase()} for your party`);
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

/** A wild Wildling trailing the Wayfarer, with how much it trusts you so far. Tap it for the details. */
export class FollowerMarker {
  private readonly marker: Marker;
  private shown: string | null = null;
  private placed = false;
  private readonly el: HTMLButtonElement;
  private readonly art: HTMLElement;
  private readonly label: HTMLElement;

  constructor(
    private readonly map: Map,
    onTap: () => void,
  ) {
    this.art = document.createElement('div');
    this.label = document.createElement('span');
    this.label.className = 'map-follower-left';
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'map-follower';
    this.el.setAttribute('aria-label', 'Wildling following you');
    this.el.append(this.art, this.label);
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      onTap();
    });
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
    if (follower) this.label.textContent = `♥ ${Math.floor((100 * follower.walkedM) / follower.needM)}%`;
  }

  update(lng: number, lat: number): void {
    this.marker.setLngLat([lng, lat]);
    if (!this.placed) {
      this.marker.addTo(this.map);
      this.placed = true;
    }
  }
}
