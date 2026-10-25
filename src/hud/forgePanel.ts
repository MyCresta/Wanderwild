import {
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

export const gearName = (item: GearItem) => `${RARITIES[item.rarity].name} ${SLOT_DEFS[item.slot].name}${item.plus ? ` +${item.plus}` : ''}`;

/**
 * The Forge: one fixed row per slot, each with a single upgrade button. Gear itself is
 * found, not made, and upgrades stay with the slot when a better piece turns up.
 */
export class ForgePanel {
  private readonly dialog = $<HTMLDialogElement>('forge');
  private readonly body = $('forge-content');
  /** The slot whose open rune socket was tapped, showing the runes to set. */
  private picking: Slot | null = null;

  constructor(
    private readonly game: GameState,
    private readonly toast: (text: string) => void,
  ) {
    $('forge-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) return this.dialog.close();
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn) return;
      const slot = btn.dataset.slot as Slot;
      const act = btn.dataset.act;
      if (act === 'upgrade' && game.upgradeGear(slot)) {
        const item = game.save.gear[slot]!;
        sound.play('forge');
        if (item.plus === 5 || item.plus === 10) this.toast(`${gearName(item)} shines anew!`);
      }
      if (act === 'socket') this.picking = this.picking === slot ? null : slot;
      if (act === 'rune') {
        const rune = btn.dataset.rune as RuneId;
        if (game.socketRune(slot, rune)) {
          sound.play('equip');
          this.toast(`${RUNES[rune].name} rune set.`);
        }
        this.picking = null;
      }
      this.render();
    });
  }

  open(): void {
    this.picking = null;
    this.render();
    this.dialog.showModal();
  }

  private render(): void {
    const g = this.game;
    const level = g.level.level;
    const s = g.save;
    const runesOpen = level >= RUNE_LEVEL;
    this.body.innerHTML = `<ul class="forge-rows">${SLOTS.map((slot) => {
      const item = s.gear[slot];
      if (!item) {
        return `<li class="forge-row forge-empty">${gearSvg({ slot }, 44)}
          <div class="forge-info"><b>${SLOT_DEFS[slot].name}</b><small>Not found yet</small></div>
          <span class="forge-up" aria-hidden="true"></span></li>`;
      }
      const sockets = runesOpen ? runeSockets(item) : 0;
      const pips = runesOpen
        ? `<span class="forge-pips">${[0, 1]
            .map((i) => {
              const rune = item.runes[i];
              if (rune) return `<span class="pip pip-full" title="${RUNES[rune].name}: ${RUNES[rune].blurb}">${RUNES[rune].name[0]}</span>`;
              if (i < sockets && s.runes.length)
                return `<button type="button" class="pip pip-open" data-act="socket" data-slot="${slot}" aria-label="Set a rune" aria-pressed="${this.picking === slot}">+</button>`;
              // A socket not open yet keeps its space, so the row never shifts when it opens.
              return i < sockets ? '<span class="pip pip-open" title="Empty socket"></span>' : '<span class="pip pip-shut"></span>';
            })
            .join('')}</span>`
        : '';
      const line =
        this.picking === slot
          ? `<span class="forge-runes">${[...new Set(s.runes)]
              .map((r) => `<button type="button" data-act="rune" data-slot="${slot}" data-rune="${r}" title="${RUNES[r].blurb}">${RUNES[r].name}</button>`)
              .join('')}</span>`
          : `<small>${SLOT_DEFS[slot].effect(power(item))}</small>`;
      return `<li class="forge-row">${gearSvg(item, 44)}
        <div class="forge-info"><b style="color:${RARITIES[item.rarity].color}">${gearName(item)}</b>${line}</div>
        ${pips}${this.upgradeButton(item, level)}</li>`;
    }).join('')}</ul>`;
  }

  private upgradeButton(item: GearItem, level: number): string {
    const attrs = `type="button" class="forge-up" data-act="upgrade" data-slot="${item.slot}"`;
    if (level < FORGE_LEVEL) return `<button ${attrs} disabled><b>+${item.plus + 1}</b><small>Lv ${FORGE_LEVEL}</small></button>`;
    if (item.plus >= maxPlus(level))
      return `<button ${attrs} disabled><b>Max</b>${item.plus < 10 ? `<small>+10 at Lv ${RUNE_LEVEL}</small>` : ''}</button>`;
    const c = upgradeCost(item);
    const s = this.game.save;
    const coinShort = s.currencies.coin < c.coin ? ' class="short"' : '';
    const matShort = (s.materials[c.material] ?? 0) < c.amount ? ' class="short"' : '';
    return `<button ${attrs} ${this.game.canUpgradeGear(item.slot) ? '' : 'disabled'} title="${formatCount(c.coin)} coin and ${c.amount} ${MATERIALS[c.material].name}">
      <b>+${item.plus + 1}</b><small${coinShort}>${formatCount(c.coin)} <i class="coin-dot"></i></small><small${matShort}>${c.amount} ${MATERIALS[c.material].name}</small></button>`;
  }
}
