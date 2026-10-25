import { grantPetXp, vigorNow, type OwnedPet } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { MAX_LEVEL } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { RUNE_IDS, RUNES, type RuneId } from '../game/gear';
import { MATERIALS, type MaterialId } from '../game/realms';
import type { GameState } from '../game/state';
import { sound } from '../audio/sound';
import type { GameContext } from '../ui/context';
import { h } from '../ui/dom';
import { journal } from '../ui/journal';
import { healList, tonicHeal } from '../ui/tonics';
import { formatCount } from './format';

/** Wildling XP given per tap; the Kennel makes about this much in a few hours. */
const XP_PER_TAP = 100;

interface BagItem {
  id: string;
  name: string;
  count: number;
  icon: string;
  blurb: string;
  /** Items that can be used here open a list of Wildlings to give them to. */
  use?: 'tonic' | 'petXp';
}

const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const ICONS = {
  tonic: svg(
    '<path d="M12 4h8v3h-1v5l6 10a4 4 0 0 1-3.5 6h-11A4 4 0 0 1 7 22l6-10V7h-1z" fill="#f3e6c4" stroke="#3b2a1a" stroke-width="1.5"/><path d="M9.5 19h13l2 3.5a2.5 2.5 0 0 1-2.2 3.8H9.7a2.5 2.5 0 0 1-2.2-3.8z" fill="#b5413a"/><circle cx="14" cy="22" r="1.2" fill="#f3b3a8"/>',
  ),
  petXp: svg(
    '<path d="M16 3l3.6 8 8.4.8-6.4 5.6 1.9 8.4L16 21.4l-7.5 4.4 1.9-8.4L4 11.8l8.4-.8z" fill="#7aa34f" stroke="#2f4a1e" stroke-width="1.5" stroke-linejoin="round"/>',
  ),
  coin: svg(
    '<circle cx="16" cy="16" r="12" fill="#e2b64a" stroke="#7a5a12" stroke-width="1.5"/><circle cx="16" cy="16" r="8" fill="none" stroke="#9b7420" stroke-width="1.2"/><path d="M16 10.5l1.6 3.9 3.9 1.6-3.9 1.6-1.6 3.9-1.6-3.9-3.9-1.6 3.9-1.6z" fill="#fff2c4"/>',
  ),
  wanderlight: svg(
    '<circle cx="16" cy="16" r="11" fill="#bcd6f2" opacity=".45"/><path d="M16 4l2.4 9.6L28 16l-9.6 2.4L16 28l-2.4-9.6L4 16l9.6-2.4z" fill="#eaf4ff" stroke="#3f6f9a" stroke-width="1.3" stroke-linejoin="round"/>',
  ),
  material: (color: string) =>
    svg(`<path d="M10 5h12l6 8-12 15L4 13z" fill="${color}" stroke="#3b2a1a" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 13h24M10 5l6 8 6-8M16 13v15" fill="none" stroke="#fff6dc" stroke-opacity=".45" stroke-width="1"/>`),
  rune: svg(
    '<path d="M9 5h14l4 6v12l-6 5H11l-6-5V11z" fill="#8a7a62" stroke="#3b2a1a" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 9v14M12 12l4 3 4-3M12 20l4-3 4 3" fill="none" stroke="#e7d7a8" stroke-width="1.6" stroke-linecap="round"/>',
  ),
};

const MATERIAL_COLORS: Record<MaterialId, string> = {
  ironbark: '#7a5a3a',
  mistwool: '#b9c9d6',
  cobbleOre: '#8d8f93',
  gravemoss: '#5f7a4a',
  hearthgrain: '#d8b25a',
  shrineRelic: '#a77fc4',
};

/**
 * The bag: every resource, supply and rune you carry as one grid of fixed tiles. Tap a
 * tile to see what it is; tonics and Wildling XP can be given to a Wildling right here.
 */
export class BagPanel {
  private readonly host = document.getElementById('bag-panel')!;
  private selected = 'tonic';

  constructor(
    private readonly game: GameState,
    private readonly ctx: GameContext,
    private readonly toast: (text: string) => void,
  ) {
    journal.onShow('bag', () => this.render());
    game.on((e) => e.kind === 'change' && journal.showing('bag') && this.render());
  }

  private items(): BagItem[] {
    const s = this.game.save;
    const runes = new Map<RuneId, number>();
    for (const r of s.runes) runes.set(r, (runes.get(r) ?? 0) + 1);
    const items: BagItem[] = [
      { id: 'tonic', name: 'Tonic', count: s.supplies.tonic, icon: ICONS.tonic, blurb: `Heals a Wildling ${tonicHeal(this.ctx)} health. Brewed in the Herb Garden.`, use: 'tonic' },
      { id: 'petXp', name: 'Wildling XP', count: s.supplies.petXp, icon: ICONS.petXp, blurb: 'Trained at the Kennel. Give it to a Wildling to help it grow.', use: 'petXp' },
      { id: 'coin', name: 'Coin', count: s.currencies.coin, icon: ICONS.coin, blurb: 'For building and the Forge.' },
      { id: 'wanderlight', name: 'Wanderlight', count: s.currencies.wanderlight, icon: ICONS.wanderlight, blurb: 'Only found by walking. Buys hunt clues.' },
      ...(Object.keys(MATERIALS) as MaterialId[])
        .filter((id) => (s.materials[id] ?? 0) > 0)
        .map((id) => ({ id, name: MATERIALS[id].name, count: s.materials[id] ?? 0, icon: ICONS.material(MATERIAL_COLORS[id]), blurb: `Found in ${MATERIALS[id].from}. Used to upgrade the Hearthstead.` })),
      ...RUNE_IDS.filter((id) => runes.has(id)).map((id) => ({
        id: `rune-${id}`,
        name: `${RUNES[id].name} rune`,
        count: runes.get(id) ?? 0,
        icon: ICONS.rune,
        blurb: `${RUNES[id].blurb}. Set it into gear at the Forge.`,
      })),
    ];
    // Wildling XP only once the Kennel has made some.
    return items.filter((i) => i.id !== 'petXp' || i.count > 0);
  }

  render(): void {
    const items = this.items();
    const item = items.find((i) => i.id === this.selected) ?? items[0];
    this.selected = item.id;
    const grid = h(
      'ul',
      { class: 'bag-grid' },
      ...items.map((i) => {
        const tile = h(
          'button',
          {
            class: 'bag-item',
            type: 'button',
            'aria-pressed': String(i.id === item.id),
            'aria-label': `${i.name}: ${formatCount(i.count)}`,
            onclick: () => {
              this.selected = i.id;
              this.render();
            },
          },
          h('b', {}, formatCount(i.count)),
          h('small', {}, i.name),
        );
        tile.insertAdjacentHTML('afterbegin', i.icon);
        return h('li', {}, tile);
      }),
    );
    const detail = h('div', { class: 'bag-detail' }, h('h3', {}, item.name), h('p', { class: 'satchel-hint' }, item.blurb));
    if (item.use === 'tonic') detail.append(this.tonicList());
    if (item.use === 'petXp') detail.append(this.xpList());
    this.host.replaceChildren(grid, detail);
  }

  private pets(): OwnedPet[] {
    return [...this.ctx.collection.pets].sort((a, b) => vigorNow(a) - vigorNow(b) || b.level - a.level);
  }

  private tonicList(): HTMLElement {
    const pets = this.pets();
    if (!pets.length) return h('p', { class: 'satchel-hint' }, 'No Wildlings yet.');
    const list = healList(this.ctx, pets);
    if (pets.every((p) => vigorNow(p) >= 1)) list.append(h('p', { class: 'hint' }, 'Every Wildling is at full health.'));
    return list;
  }

  private xpList(): HTMLElement {
    const have = this.game.save.supplies.petXp;
    const pets = [...this.ctx.collection.pets].sort((a, b) => b.level - a.level);
    if (!pets.length) return h('p', { class: 'satchel-hint' }, 'No Wildlings yet.');
    return h(
      'div',
      { class: 'heal-list' },
      h(
        'ul',
        {},
        ...pets.map((pet) =>
          h(
            'li',
            {},
            createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 40, still: true }),
            h('span', { class: 'heal-name' }, `${getSpecies(pet.speciesId).name} · Lv ${pet.level}`),
            pet.level >= MAX_LEVEL
              ? h('small', { class: 'pet-resting' }, 'Max')
              : h(
                  'button',
                  {
                    class: 'tonic-btn',
                    type: 'button',
                    disabled: have < 1,
                    'aria-label': `Give ${getSpecies(pet.speciesId).name} Wildling XP`,
                    onclick: () => this.giveXp(pet),
                  },
                  `+${formatCount(Math.min(XP_PER_TAP, have) || XP_PER_TAP)} XP`,
                ),
          ),
        ),
      ),
    );
  }

  private giveXp(pet: OwnedPet): void {
    const amount = this.game.takeWildlingXp(XP_PER_TAP);
    if (!amount) return;
    const levels = grantPetXp(pet, amount);
    sound.play('reward');
    this.ctx.changed();
    if (levels) this.toast(`${getSpecies(pet.speciesId).name} grew to level ${pet.level}!`);
    this.render();
  }
}
