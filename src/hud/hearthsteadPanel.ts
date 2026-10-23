import { BUILDING_IDS, BUILDINGS, capMs, MAX_BUILDING_LEVEL, msUntilFull, ratePerHour, storageCap, stored, STRIDE_DAILY_CAP_MS, strideLeftToday, upgradeCost } from '../game/hearthstead';
import { MATERIALS } from '../game/realms';
import type { GameState } from '../game/state';
import { EGG_UNLOCK_LEVEL } from '../game/state';
import { formatCount, formatDistance, formatDuration } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const HEARTHSTEAD_LEVEL = Math.min(...BUILDING_IDS.map((id) => BUILDINGS[id].unlockLevel));

/** The Hearthstead dialog: buildings to build, collect and upgrade, plus the egg incubator. */
export class HearthsteadPanel {
  private readonly dialog = $<HTMLDialogElement>('hearthstead');
  private readonly body = $('hearthstead-content');

  constructor(
    private readonly game: GameState,
    private readonly toast: (text: string) => void,
  ) {
    $('hearthstead-open').addEventListener('click', () => {
      game.tickHearthstead();
      this.render();
      this.dialog.showModal();
    });
    $('hearthstead-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) return this.dialog.close();
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!button) return;
      const id = button.dataset.id as keyof typeof BUILDINGS;
      const def = BUILDINGS[id];
      if (button.dataset.act === 'build' && game.build(id)) this.toast(`The ${def.name} is built.`);
      if (button.dataset.act === 'collect') {
        const n = game.collect(id);
        this.toast(n ? `Collected ${n} ${def.productName}.` : 'Nothing ready yet.');
      }
      if (button.dataset.act === 'upgrade' && game.upgrade(id)) this.toast(`${def.name} is now level ${game.save.hearthstead.buildings[id]?.level}.`);
      this.render();
    });
    game.on((event) => {
      if (event.kind !== 'change') return;
      if (this.dialog.open) this.render();
      else this.markReady();
    });
    // Keep the hearth button's glow in step with what is ready to collect.
    setInterval(() => this.markReady(), 20_000);
    this.markReady();
  }

  private markReady(): void {
    const h = this.game.save.hearthstead;
    const ready = BUILDING_IDS.some((id) => {
      const b = h.buildings[id];
      return b && stored(BUILDINGS[id], b) >= storageCap(BUILDINGS[id], b) * 0.25;
    });
    $('hearthstead-open').classList.toggle('ready', ready);
    $('hearthstead-open').hidden = this.game.level.level < HEARTHSTEAD_LEVEL;
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
          <div class="building-head"><b>${def.name}</b><small>${def.blurb}</small></div>
          ${locked ? `<p class="building-lock">Unlocks at Wayfarer level ${def.unlockLevel}</p>` : `<button type="button" data-act="build" data-id="${id}">Build</button>`}
        </li>`;
      }
      const have = stored(def, b);
      const cap = storageCap(def, b);
      const cost = upgradeCost(def, b.level);
      const maxed = b.level >= MAX_BUILDING_LEVEL;
      const full = msUntilFull(b);
      return `<li class="building">
        <div class="building-head"><b>${def.name}</b><span class="building-level">Lv ${b.level}</span><small>${def.blurb}</small></div>
        <div class="building-bar" aria-hidden="true"><span style="width:${(100 * b.progressMs) / capMs(b.level)}%"></span></div>
        <p class="building-stats">${formatCount(have)} / ${formatCount(cap)} ${def.productName} · ${formatCount(ratePerHour(def, b.level))}/h · ${full ? `full in ${formatDuration(full)}` : '<b>storage full</b>'}</p>
        <div class="building-actions">
          <button type="button" data-act="collect" data-id="${id}" ${have ? '' : 'disabled'}>Collect</button>
          <button type="button" data-act="upgrade" data-id="${id}" ${this.game.canUpgrade(id) ? '' : 'disabled'}>
            ${maxed ? 'Max level' : `Upgrade · ${formatCount(cost.coin)} coin, ${cost.amount} ${MATERIALS[cost.material].name}`}
          </button>
        </div>
      </li>`;
    }).join('');
    const eggs =
      level < EGG_UNLOCK_LEVEL
        ? `<p class="satchel-hint">Wild eggs unlock at Wayfarer level ${EGG_UNLOCK_LEVEL}. Shrines sometimes hold one.</p>`
        : s.eggs.length
          ? `<ul class="eggs">${s.eggs
              .map(
                (e) =>
                  `<li><span class="egg egg-${e.km}" aria-hidden="true"></span><b>${e.km} km egg</b> ${formatDistance(e.walkedM)} of ${e.km} km
                  <span class="building-bar"><span style="width:${(100 * e.walkedM) / (e.km * 1000)}%"></span></span></li>`,
              )
              .join('')}</ul>`
          : '<p class="satchel-hint">No eggs yet. Touch shrines to find one.</p>';
    this.body.innerHTML = `
      <p class="stride-note">Every 100 m you walk moves all timers forward 10 minutes. Today: <b>${formatDuration(STRIDE_DAILY_CAP_MS - left)}</b> of ${formatDuration(STRIDE_DAILY_CAP_MS)} skipped.</p>
      <ul class="buildings">${cards}</ul>
      <p class="satchel-hint">Supplies: ${formatCount(s.supplies.tonic)} Tonic, ${formatCount(s.supplies.petXp)} Pet XP</p>
      <h3>Incubator</h3>
      ${eggs}`;
  }
}
