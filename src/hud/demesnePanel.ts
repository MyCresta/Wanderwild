import {
  DEMESNE_LEVEL,
  inkAt,
  isFull,
  maxParcels,
  MAX_RESIDENTS,
  parcelRate,
  RESIDENT_BONUS,
  leyNear,
  type Parcel,
} from '../game/demesne';
import { GLYPHS, glyphSvg, type GlyphKind } from '../game/glyphs';
import { MATERIALS, REALMS, type MaterialId, type RealmId } from '../game/realms';
import type { GameState } from '../game/state';
import { partyPets } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { sound } from '../audio/sound';
import type { GameContext } from '../ui/context';
import { journal } from '../ui/journal';
import { formatCount, formatDistance, formatDuration } from './format';

const GLYPH_PICTURES: Record<GlyphKind, string> = {
  ring: glyphSvg({ kind: 'ring', path: Array.from({ length: 12 }, (_, i) => [Math.cos(i / 1.91) * 0.001, Math.sin(i / 1.91) * 0.0006] as [number, number]) }, 40),
  stroke: glyphSvg({ kind: 'stroke', path: [[0, 0], [1, 1]] }, 40),
  knot: glyphSvg({ kind: 'knot', path: [] }, 40),
};

export function formatArea(m2: number): string {
  return m2 >= 10_000 ? `${(m2 / 10_000).toFixed(m2 >= 100_000 ? 0 : 1)} ha` : `${formatCount(Math.round(m2 / 10) * 10)} m²`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The journal's Demesne tab: the parcels held, their residents, Waymarks, and how to walk glyphs. */
export class DemesnePanel {
  private readonly body = journal.pane('demesne');

  constructor(
    private readonly game: GameState,
    private readonly toast: (text: string) => void,
    private readonly creatures: GameContext,
    private readonly trailMetres: () => number,
    private readonly showOnMap: (lng: number, lat: number) => void,
  ) {
    journal.onShow('demesne', () => {
      this.game.tickDemesne();
      this.render();
    });
    this.body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (el && el.tagName !== 'SELECT') this.act(el);
    });
    this.body.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      if (el.dataset.act === 'resident' && el.value) {
        this.game.toggleResident(el.dataset.id ?? '', el.value);
        sound.play('equip');
        this.render();
      }
    });
    game.on((event) => {
      if (event.kind !== 'change') return;
      if (journal.showing('demesne')) this.render();
      else this.markReady();
    });
    setInterval(() => this.markReady(), 20_000);
    this.markReady();
  }

  open(focusId?: string): void {
    journal.open('demesne');
    if (focusId) this.body.querySelector(`[data-parcel="${focusId}"]`)?.scrollIntoView({ block: 'center' });
  }

  private act(el: HTMLElement): void {
    const id = el.dataset.id ?? '';
    const s = this.game.save;
    const parcel = s.parcels.find((p) => p.id === id);
    switch (el.dataset.act) {
      case 'collect': {
        const got = this.game.collectParcel(id);
        const text = materialsText(got);
        if (text) sound.play('coin');
        this.toast(text ? `Gathered ${text} from ${parcel?.name}.` : 'Nothing ready yet.');
        break;
      }
      case 'collect-all': {
        const total: Partial<Record<MaterialId, number>> = {};
        for (const p of s.parcels)
          for (const [m, n] of Object.entries(this.game.collectParcel(p.id)) as [MaterialId, number][]) total[m] = (total[m] ?? 0) + n;
        const text = materialsText(total);
        if (text) sound.play('coin');
        this.toast(text ? `Gathered ${text} across your Demesne.` : 'Nothing ready yet.');
        break;
      }
      case 'show':
        if (parcel) this.showOnMap(parcel.centroid[0], parcel.centroid[1]);
        else {
          const w = s.waymarks.find((x) => x.id === id);
          if (w) this.showOnMap(w.lng, w.lat);
        }
        journal.close();
        return;
      case 'release':
        if (parcel && confirm(`Release ${parcel.name}? Its residents come home and anything waiting there is lost.`)) {
          this.game.releaseParcel(id);
          this.toast(`${parcel.name} returns to the wild.`);
        }
        break;
      case 'evict':
        this.game.toggleResident(id, el.dataset.pet ?? '');
        break;
    }
    this.render();
  }

  private markReady(): void {
    const s = this.game.save;
    const now = Date.now();
    const full = s.parcels.some((p) => isFull(p, s.leyLines, now) && inkAt(p, now) > 0);
    journal.setBadge('demesne', full || s.parcels.some((p) => inkAt(p, now) < 0.3));
  }

  render(): void {
    const s = this.game.save;
    const now = Date.now();
    const level = this.game.level.level;
    if (level < DEMESNE_LEVEL) {
      this.body.innerHTML = `<p class="satchel-hint">The Demesne opens at Wayfarer level ${DEMESNE_LEVEL}.</p>`;
      return;
    }
    const trail = this.trailMetres();
    const glyphs = (Object.keys(GLYPHS) as GlyphKind[])
      .map(
        (k) => `<li class="glyph-card"><span class="glyph-pic">${GLYPH_PICTURES[k]}</span>
          <div><b>${GLYPHS[k].name}</b> <small>cast ${formatCount(s.glyphsCast[k])}×</small>
          <p>${GLYPHS[k].how}</p><p class="glyph-effect">${GLYPHS[k].effect}</p></div></li>`,
      )
      .join('');
    const cap = maxParcels(level);
    const parcels = s.parcels.map((p) => this.parcelHtml(p, now)).join('');
    const anyStored = s.parcels.some((p) => Object.values(p.stored).some((n) => (n ?? 0) >= 1));
    const ley = s.leyLines.filter((l) => l.until > now);
    const waymarks = s.waymarks
      .map(
        (w, i) => `<li class="waymark-row"><span>Waymark ${i + 1}</span><small>set ${formatDuration(now - w.setAt)} ago</small>
          <button type="button" data-act="show" data-id="${w.id}">Show</button></li>`,
      )
      .join('');
    this.body.innerHTML = `
      ${trail > 0 ? `<p class="satchel-hint">Current trail: ${formatDistance(trail)}</p>` : ''}
      <h3>Parcels <small>${s.parcels.length} of ${cap}</small></h3>
      ${parcels ? `<ul class="buildings">${parcels}</ul>` : '<p class="satchel-hint">Walk a Ring around a block or a park to claim one.</p>'}
      ${anyStored ? '<div class="satchel-actions"><button type="button" data-act="collect-all">Gather everything</button></div>' : ''}
      ${ley.length ? `<h3>Ley lines <small>${ley.length}</small></h3><ul class="ley-list">${ley.map((l) => `<li>Hums for ${formatDuration(l.until - now)} · ${s.parcels.filter((p) => leyNear(l, p.centroid)).length} parcels nearby</li>`).join('')}</ul>` : ''}
      ${waymarks ? `<h3>Waymarks <small>${s.waymarks.length} of 5</small></h3><ul class="waymark-list">${waymarks}</ul>` : ''}
      <details class="journal-more">
        <summary>How to walk glyphs</summary>
        <ul class="glyph-cards">${glyphs}</ul>
        <p class="satchel-hint">Ink fades over a week. Walk half a parcel's border to re-ink it.</p>
      </details>`;
  }

  private parcelHtml(p: Parcel, now: number): string {
    const s = this.game.save;
    const ink = inkAt(p, now);
    const realms = (Object.entries(p.realms) as [RealmId, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([r, share]) => `<span class="realm-chip" style="--realm:${REALMS[r].color}">${REALMS[r].name} ${Math.round(share * 100)}%</span>`)
      .join('');
    const stored = (Object.entries(p.stored) as [MaterialId, number][]).filter(([, n]) => n >= 1);
    const leyOn = s.leyLines.some((l) => l.until > now && leyNear(l, p.centroid));
    const pets = this.creatures.collection.pets;
    const residents = p.residents
      .map((uid) => pets.find((x) => x.uid === uid))
      .filter((x) => !!x)
      .map((x) => `<button type="button" class="resident-chip" data-act="evict" data-id="${p.id}" data-pet="${x.uid}" title="Send home">${escapeHtml(getSpecies(x.speciesId).name)} ×</button>`)
      .join('');
    const housed = new Set(s.parcels.flatMap((x) => x.residents));
    const busy = new Set([...s.expeditions.map((e) => e.petUid), ...partyPets(this.creatures.collection).map((x) => x.uid)]);
    const free = pets.filter((x) => !housed.has(x.uid) && !busy.has(x.uid));
    const addResident =
      p.residents.length < MAX_RESIDENTS && free.length
        ? `<select data-act="resident" data-id="${p.id}"><option value="">Settle a pet here…</option>${free
            .map((x) => `<option value="${x.uid}">${escapeHtml(getSpecies(x.speciesId).name)} (Lv ${x.level})</option>`)
            .join('')}</select>`
        : '';
    return `<li class="building parcel${ink === 0 ? ' faded' : ''}" data-parcel="${p.id}">
      <div class="building-head"><b>${escapeHtml(p.name)}</b><small>${formatArea(p.areaM2)}${leyOn ? ' · <span class="ley-badge">ley ×1.5</span>' : ''}</small></div>
      <div class="realm-chips">${realms}</div>
      <div class="building-bar ink-bar" title="Ink"><span style="width:${Math.round(ink * 100)}%"></span></div>
      <p class="building-stats">${ink > 0 ? `Ink ${Math.round(ink * 100)}% · ${parcelRate(p, s.leyLines, now).toFixed(1)} materials an hour` : 'The ink has faded. Walk the border to wake it.'}
        ${stored.length ? `<br>Waiting: ${stored.map(([m, n]) => `${Math.floor(n)} ${MATERIALS[m].name}`).join(', ')}` : ''}</p>
      <div class="residents">${residents}${addResident}${p.residents.length ? `<small>+${Math.round(RESIDENT_BONUS * 100)}% each</small>` : ''}</div>
      <div class="building-actions">
        <button type="button" data-act="show" data-id="${p.id}">Show</button>
        <button type="button" data-act="release" data-id="${p.id}">Release</button>
        <button type="button" data-act="collect" data-id="${p.id}" ${stored.length ? '' : 'disabled'}>Gather</button>
      </div></li>`;
  }
}

function materialsText(got: Partial<Record<MaterialId, number>>): string {
  return (Object.entries(got) as [MaterialId, number][])
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${n} ${MATERIALS[m].name}`)
    .join(', ');
}
