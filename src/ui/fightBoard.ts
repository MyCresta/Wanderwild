import { FOE_TRAITS, RANKS } from '../creatures/foes';
import { MONSTERS } from '../creatures/species';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import type { Spawn } from '../game/spawns';
import { formatDistance } from '../hud/format';
import { h, openSheet } from './dom';
import { railButtons } from './layout';
import { elementTag, wheelHelp } from './wheel';

export interface FoeNear {
  spawn: Spawn;
  encounter: Encounter;
  metres: number;
  inReach: boolean;
}

export interface FightHooks {
  /** Starts a real fight with a Blotspawn in reach. */
  fight(spawn: Spawn, encounter: Encounter): void;
  /** Pans the map to a Blotspawn that is too far away. */
  show(spawn: Spawn): void;
  practice(encounter: Encounter): void;
  /** Level of the lead pet, or null without a companion. */
  companionLevel(): number | null;
}

/** A training blot: any Blotspawn kind, at the companion's level, with no quirks. */
export function practiceEncounter(level: number, rng: () => number = Math.random): Encounter {
  const species = MONSTERS[Math.floor(rng() * MONSTERS.length)];
  return { species, level: Math.max(1, level), seed: Math.floor(rng() * 2 ** 32), rank: 'normal', traits: [] };
}

const SWORDS =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 8l18 18-3 3L7 11V8zM38 8v3L20 29l-3-3L35 8z" fill="currentColor"/><path d="M13 30l5 5-4 4-2-2-3 3-2-2 3-3-2-2zM35 30l-5 5 4 4 2-2 3 3 2-2-3-3 2-2z" fill="#8e2b22"/></svg>';

/**
 * The ⚔ button on the map: counts Blotspawn nearby, glows when one is in reach, and
 * opens a board listing them, with a practice bout for when none are about.
 */
export class FightBoard {
  readonly button: HTMLButtonElement;
  private foes: FoeNear[] = [];

  constructor(private readonly hooks: FightHooks) {
    this.button = h('button', { class: 'fight-button', id: 'fight', type: 'button', 'aria-label': 'Fight Blotspawn' });
    this.button.innerHTML = SWORDS;
    this.button.addEventListener('click', () => this.open());
    // Second from the bottom on the right, under the thumb.
    const rail = railButtons('right');
    rail.insertBefore(this.button, document.getElementById('recenter')?.nextSibling ?? null);
  }

  update(foes: FoeNear[]): void {
    this.foes = [...foes].sort((a, b) => a.metres - b.metres);
    const inReach = this.foes.filter((f) => f.inReach).length;
    this.button.dataset.count = this.foes.length ? String(this.foes.length) : '';
    this.button.classList.toggle('fight-ready', inReach > 0);
    this.button.setAttribute('aria-label', `Fight Blotspawn: ${this.foes.length} nearby, ${inReach} in reach`);
  }

  open(): void {
    const sheet = openSheet('Blotspawn nearby', { className: 'sheet-fights' });
    const level = this.hooks.companionLevel();
    if (level === null) {
      sheet.body.append(h('p', {}, 'You need a companion before you can face Blotspawn. Open the bestiary to choose one.'));
      return;
    }
    const list = h('ul', { class: 'foe-list' });
    for (const foe of this.foes) {
      const { encounter: enc, spawn } = foe;
      const rank = enc.rank ?? 'normal';
      const btn = foe.inReach
        ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => (sheet.close(), this.hooks.fight(spawn, enc)) }, 'Fight')
        : h('button', { class: 'btn btn-small', type: 'button', onclick: () => (sheet.close(), this.hooks.show(spawn)) }, 'Show');
      list.append(
        h(
          'li',
          { class: `foe-row foe-${rank}${foe.inReach ? '' : ' foe-far'}` },
          createCreatureSvg({ speciesId: enc.species.id, seed: enc.seed, size: 56, still: true }),
          h(
            'div',
            { class: 'foe-info' },
            h('strong', {}, `${rank === 'normal' ? '' : rank === 'elite' ? '♛ Elite ' : '✦ Rare '}${enc.species.name}`, h('small', {}, ` Lv ${enc.level}`)),
            h(
              'span',
              { class: 'foe-meta' },
              elementTag(enc.species.element),
              enc.species.kind === 'monster' && h('span', {}, ' weak to '),
              enc.species.kind === 'monster' && elementTag(enc.species.weakTo),
            ),
            (enc.traits ?? []).length > 0 &&
              h('span', { class: 'foe-traits' }, (enc.traits ?? []).map((t) => `${FOE_TRAITS[t].glyph} ${FOE_TRAITS[t].name}`).join(' · ')),
            h('span', { class: 'foe-dist' }, foe.inReach ? 'In reach' : `${formatDistance(foe.metres)} away`),
          ),
          btn,
        ),
      );
    }
    sheet.body.append(
      this.foes.length
        ? list
        : h('p', { class: 'hint' }, 'No Blotspawn about right now. They gather in quiet lanes and old graveyards, and new ones spill out every 15 minutes.'),
      h(
        'p',
        { class: 'hint' },
        `Blotspawn show on the map with a dark ink pool. ${RANKS.rare.name} ones glow gold and ${RANKS.elite.name}s wear a crown: tougher, with quirks, and worth far more.`,
      ),
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => (sheet.close(), this.hooks.practice(practiceEncounter(level))) },
        '⚔ Practice bout',
      ),
      h('p', { class: 'hint' }, 'Practice anytime against a training blot. No rewards, nothing lost.'),
      wheelHelp(),
    );
  }
}
