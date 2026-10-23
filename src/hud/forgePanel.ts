import {
  craftCost,
  FORGE_LEVEL,
  maxPlus,
  power,
  RARITIES,
  RUNE_LEVEL,
  RUNES,
  runeSockets,
  SLOT_DEFS,
  SLOTS,
  upgradeCost,
  type GearItem,
  type RuneId,
  type Slot,
} from '../game/gear';
import { MATERIALS } from '../game/realms';
import type { GameState } from '../game/state';
import { formatCount } from './format';
import { gearSvg } from './gearArt';
import { sound } from '../audio/sound';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const itemName = (item: GearItem) => `${RARITIES[item.rarity].name} ${SLOT_DEFS[item.slot].name}${item.plus ? ` +${item.plus}` : ''}`;
const cost = (c: { coin: number; material: keyof typeof MATERIALS; amount: number }) =>
  `${formatCount(c.coin)} coin, ${c.amount} ${MATERIALS[c.material].name}`;

/** The Forge: craft gear for five slots, upgrade it to +10, equip it and socket runes. */
export class ForgePanel {
  private readonly dialog = $<HTMLDialogElement>('forge');
  private readonly body = $('forge-content');

  constructor(
    private readonly game: GameState,
    private readonly toast: (text: string) => void,
  ) {
    $('forge-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) return this.dialog.close();
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn) return;
      const { act, id } = btn.dataset;
      if (act === 'craft') {
        const item = game.craft(id as Slot);
        if (item) {
          sound.play('forge');
          this.toast(`Forged a ${itemName(item)}!`);
        }
      }
      if (act === 'upgrade' && id && game.upgradeGear(id)) {
        const item = game.save.gear.find((g) => g.id === id)!;
        sound.play('forge');
        this.toast(`${itemName(item)}${item.plus === 5 || item.plus === 10 ? ' shines anew!' : '.'}`);
      }
      if (act === 'equip' && id) {
        game.equip(id);
        sound.play('equip');
      }
      if (act === 'salvage' && id && game.salvage(id)) this.toast('Melted down for materials.');
      if (act === 'rune' && id) {
        const rune = btn.dataset.rune as RuneId;
        if (game.socketRune(id, rune)) this.toast(`${RUNES[rune].name} rune socketed.`);
      }
      this.render();
    });
  }

  open(): void {
    this.render();
    this.dialog.showModal();
  }

  private render(): void {
    const g = this.game;
    const level = g.level.level;
    if (level < FORGE_LEVEL) {
      this.body.innerHTML = `<p>The Forge opens at Wayfarer level ${FORGE_LEVEL}.</p>`;
      return;
    }
    const s = g.save;
    const equippedIds = new Set(Object.values(s.equipped));
    const slots = SLOTS.map((slot) => {
      const item = s.gear.find((x) => x.id === s.equipped[slot]);
      return `<li class="gear-slot">${gearSvg(item ?? { slot }, 44)}<div><b>${item ? itemName(item) : SLOT_DEFS[slot].name}</b>
        <small>${item ? SLOT_DEFS[slot].effect(power(item)) : `Empty. Made from ${MATERIALS[SLOT_DEFS[slot].material].name}.`}</small>
        ${item?.runes.length ? `<small class="gear-runes">${item.runes.map((r) => RUNES[r].name).join(', ')}</small>` : ''}</div></li>`;
    }).join('');

    const craft = SLOTS.map((slot) => {
      const c = craftCost(slot);
      return `<button type="button" data-act="craft" data-id="${slot}" ${g.canCraft(slot) ? '' : 'disabled'}>
        ${gearSvg({ slot }, 28)}<span>${SLOT_DEFS[slot].name}<small>${cost(c)}</small></span></button>`;
    }).join('');

    const items = [...s.gear]
      .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || power(b) - power(a))
      .map((item) => {
        const equipped = equippedIds.has(item.id);
        const capped = item.plus >= maxPlus(level);
        const sockets = level >= RUNE_LEVEL ? runeSockets(item) - item.runes.length : 0;
        const runeButtons =
          sockets > 0
            ? [...new Set(s.runes)]
                .map((r) => `<button type="button" data-act="rune" data-id="${item.id}" data-rune="${r}" title="${RUNES[r].blurb}">+ ${RUNES[r].name}</button>`)
                .join('')
            : '';
        return `<li class="gear-item${equipped ? ' gear-equipped' : ''}">
          ${gearSvg(item, 40)}
          <div class="gear-info"><b style="color:${RARITIES[item.rarity].color}">${itemName(item)}</b>
            <small>${SLOT_DEFS[item.slot].effect(power(item))}${item.runes.length ? ` · ${item.runes.map((r) => RUNES[r].name).join(', ')}` : ''}</small></div>
          <div class="gear-actions">
            ${equipped ? '<span class="gear-tag">Worn</span>' : `<button type="button" data-act="equip" data-id="${item.id}">Equip</button>`}
            <button type="button" data-act="upgrade" data-id="${item.id}" ${g.canUpgradeGear(item) ? '' : 'disabled'}>
              ${capped ? `Max +${item.plus}` : `+${item.plus + 1} · ${cost(upgradeCost(item))}`}</button>
            ${equipped ? '' : `<button type="button" data-act="salvage" data-id="${item.id}">Salvage</button>`}
            ${runeButtons}
          </div></li>`;
      })
      .join('');

    this.body.innerHTML = `
      <ul class="gear-slots">${slots}</ul>
      <h3>Forge new gear</h3>
      <div class="forge-craft">${craft}</div>
      <p class="satchel-hint">Each slot is made from a material found in a different kind of place. Upgrades go to +${maxPlus(level)}${level < RUNE_LEVEL ? ` (to +10 from level ${RUNE_LEVEL})` : ''}; looks change at +5 and +10.</p>
      <h3>Your gear</h3>
      ${items ? `<ul class="gear-list">${items}</ul>` : '<p class="satchel-hint">Nothing forged yet.</p>'}
      ${level >= RUNE_LEVEL ? `<p class="satchel-hint">Runes: ${s.runes.length ? s.runes.map((r) => RUNES[r].name).join(', ') : 'none yet. Shrines sometimes hold one.'} Sockets open at +5 and +10.</p>` : ''}`;
  }
}
