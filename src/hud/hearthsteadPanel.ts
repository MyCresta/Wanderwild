import { BUILDING_IDS, BUILDINGS, capMs, TONIC_CARRY, isFull, MAX_BUILDING_LEVEL, msUntilFull, ratePerHour, storageCap, stored, STRIDE_DAILY_CAP_MS, strideLeftToday, upgradeCost } from '../game/hearthstead';
import { MATERIALS } from '../game/realms';
import type { GameState } from '../game/state';
import { formatCount, formatDuration } from './format';
import { journal } from '../ui/journal';
import { hintAttr } from '../ui/hint';

const HEARTHSTEAD_LEVEL = Math.min(...BUILDING_IDS.map((id) => BUILDINGS[id].unlockLevel));

/** The journal's Hearth tab: buildings to build, collect and upgrade. */
export class HearthsteadPanel {
  private readonly body = journal.pane('hearth');

  constructor(
    private readonly game: GameState,
    private readonly toast: (text: string) => void,
  ) {
    journal.onShow('hearth', () => {
      game.tickHearthstead();
      this.render();
    });
    this.body.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!button) return;
      const id = button.dataset.id as keyof typeof BUILDINGS;
      const def = BUILDINGS[id];
      if (button.dataset.act === 'build' && game.build(id)) this.toast(`The ${def.name} is built.`);
      if (button.dataset.act === 'collect') {
        const n = game.collect(id);
        const satchelFull = def.product.kind === 'supply' && def.product.id === 'tonic' && game.save.supplies.tonic >= TONIC_CARRY;
        this.toast(n ? `Collected ${n} ${def.productName}.` : satchelFull ? `Your satchel holds ${TONIC_CARRY} tonics at most.` : 'Nothing ready yet.');
      }
      if (button.dataset.act === 'upgrade' && game.upgrade(id)) this.toast(`${def.name} is now level ${game.save.hearthstead.buildings[id]?.level}.`);
      this.render();
    });
    game.on((event) => {
      if (event.kind !== 'change') return;
      if (journal.showing('hearth')) this.render();
      else this.markReady();
    });
    // Keep the hearth tab's dot in step with what is ready to collect.
    setInterval(() => this.markReady(), 20_000);
    this.markReady();
  }

  /** Marks the Hearth tab once a building is full. */
  private markReady(): void {
    const s = this.game.save;
    const now = Date.now();
    const ready = BUILDING_IDS.some((id) => {
      const b = s.hearthstead.buildings[id];
      return b && isFull(s.hearthstead, b, now);
    });
    journal.setBadge('hearth', ready);
    journal.setTabHidden('hearth', this.game.level.level < HEARTHSTEAD_LEVEL);
  }

  render(): void {
    this.markReady();
    const level = this.game.level.level;
    const s = this.game.save;
    const h = s.hearthstead;
    if (level < HEARTHSTEAD_LEVEL) {
      this.body.innerHTML = `<p>Reach Wayfarer level ${HEARTHSTEAD_LEVEL} to found your Hearthstead.</p>`;
      return;
    }
    const left = strideLeftToday(h, Date.now());
    const cards = BUILDING_IDS.map((id) => {
      const def = BUILDINGS[id];
      const b = h.buildings[id];
      if (!b) {
        const locked = level < def.unlockLevel;
        return `<li class="building ${locked ? 'locked' : ''}">
          <div class="building-head"><b>${def.name}</b><small>${locked ? `Level ${def.unlockLevel}` : def.blurb}</small></div>
          ${locked ? '' : `<button type="button" data-act="build" data-id="${id}">Build</button>`}
        </li>`;
      }
      const have = stored(def, b);
      const cap = storageCap(def, b);
      const cost = upgradeCost(def, b.level);
      const maxed = b.level >= MAX_BUILDING_LEVEL;
      const full = msUntilFull(b);
      return `<li class="building">
        <div class="building-head" title="${def.blurb}"><b>${def.name}</b><span class="building-level">Lv ${b.level}</span></div>
        <div class="building-bar" aria-hidden="true"><span style="width:${(100 * b.progressMs) / capMs(b.level)}%"></span></div>
        <p class="building-stats">${formatCount(have)} / ${formatCount(cap)} ${def.productName} · ${full ? `full in ${formatDuration(full)}` : '<b>full</b>'}</p>
        <div class="building-actions">
          <button type="button" data-act="collect" data-id="${id}" ${have ? '' : 'disabled'}${hintAttr(!full)}>Collect</button>
          <button type="button" data-act="upgrade" data-id="${id}" ${this.game.canUpgrade(id) ? '' : 'disabled'}
            title="${maxed ? '' : `${+ratePerHour(def, b.level).toFixed(1)}/h now`}">
            ${maxed ? 'Max level' : `Upgrade · ${formatCount(cost.coin)}c, ${cost.amount} ${MATERIALS[cost.material].name}`}
          </button>
        </div>
      </li>`;
    }).join('');
    this.body.innerHTML = `
      <p class="stride-note" title="Every 100 m you walk moves all timers forward 10 minutes">Walking skips time: <b>${formatDuration(STRIDE_DAILY_CAP_MS - left)}</b> of ${formatDuration(STRIDE_DAILY_CAP_MS)} today</p>
      <ul class="buildings">${cards}</ul>`;
  }
}
