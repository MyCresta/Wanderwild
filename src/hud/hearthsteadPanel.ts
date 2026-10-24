import { BUILDING_IDS, BUILDINGS, capMs, MAX_BUILDING_LEVEL, msUntilFull, ratePerHour, storageCap, stored, STRIDE_DAILY_CAP_MS, strideLeftToday, upgradeCost } from '../game/hearthstead';
import { MATERIALS } from '../game/realms';
import type { GameState } from '../game/state';
import { EGG_UNLOCK_LEVEL } from '../game/state';
import { formatCount, formatDistance, formatDuration } from './format';
import { EXPEDITION_LENGTHS, EXPEDITION_LEVEL, EXPEDITION_SLOTS, expeditionProgress, msLeft } from '../game/expeditions';
import { REALMS } from '../game/realms';
import { grantPetXp, partyPets } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import type { GameContext } from '../ui/context';
import { journal } from '../ui/journal';

const HEARTHSTEAD_LEVEL = Math.min(...BUILDING_IDS.map((id) => BUILDINGS[id].unlockLevel));

/** The journal's Hearth tab: buildings to build, collect and upgrade, expeditions and the egg incubator. */
export class HearthsteadPanel {
  private readonly body = journal.pane('hearth');

  constructor(
    private readonly game: GameState,
    private readonly toast: (text: string) => void,
    private readonly creatures: GameContext,
  ) {
    journal.onShow('hearth', () => {
      game.tickHearthstead();
      this.render();
    });
    this.body.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!button) return;
      if (button.dataset.act?.startsWith('exp-')) return this.expeditionAction(button);
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
      if (journal.showing('hearth')) this.render();
      else this.markReady();
    });
    // Keep the hearth tab's dot in step with what is ready to collect.
    setInterval(() => this.markReady(), 20_000);
    this.markReady();
  }

  private expeditionAction(button: HTMLButtonElement): void {
    const c = this.creatures.collection;
    const uid = button.dataset.pet ?? '';
    if (button.dataset.act === 'exp-send') {
      const pet = c.pets.find((p) => p.uid === uid);
      const realm = (this.body.querySelector<HTMLSelectElement>('#exp-realm')?.value ?? '') as keyof typeof REALMS;
      const hours = Number(this.body.querySelector<HTMLSelectElement>('#exp-length')?.value ?? 1);
      if (pet && this.game.sendExpedition(uid, pet.level, realm, hours * 3_600_000))
        this.toast(`${getSpecies(pet.speciesId).name} sets off for ${REALMS[realm].name}.`);
    } else if (button.dataset.act === 'exp-claim') {
      const done = this.game.claimExpedition(uid);
      const pet = c.pets.find((p) => p.uid === uid);
      if (done && pet) {
        const levels = grantPetXp(pet, done.reward.petXp);
        this.creatures.changed();
        const mats = Object.entries(done.reward.materials).map(([m, n]) => `${n} ${MATERIALS[m as keyof typeof MATERIALS].name}`).join(', ');
        this.toast(`${getSpecies(pet.speciesId).name} is back with ${mats} and ${done.reward.coin} coin${levels ? `, and grew to level ${pet.level}` : ''}!`);
      }
    }
    this.render();
  }

  private expeditionsHtml(): string {
    const level = this.game.level.level;
    if (level < EXPEDITION_LEVEL) return `<p class="satchel-hint">Opens at level ${EXPEDITION_LEVEL}.</p>`;
    const s = this.game.save;
    const c = this.creatures.collection;
    const now = Date.now();
    const away = new Set(s.expeditions.map((e) => e.petUid));
    const party = new Set(partyPets(c).map((p) => p.uid));
    const active = s.expeditions
      .map((e) => {
        const pet = c.pets.find((p) => p.uid === e.petUid);
        const name = pet ? getSpecies(pet.speciesId).name : 'A pet';
        const done = expeditionProgress(e, now) >= 1;
        return `<li class="building"><div class="building-head"><b>${name}</b><small>Exploring ${REALMS[e.realm].name}</small></div>
          <div class="building-bar"><span style="width:${100 * expeditionProgress(e, now)}%"></span></div>
          ${done ? `<button type="button" data-act="exp-claim" data-pet="${e.petUid}">Welcome home</button>` : `<p class="building-stats">Back in ${formatDuration(msLeft(e, now))}</p>`}</li>`;
      })
      .join('');
    const free = c.pets.filter((p) => !away.has(p.uid) && !party.has(p.uid));
    let form = '';
    if (s.expeditions.length >= EXPEDITION_SLOTS) form = '<p class="satchel-hint">All expedition slots are in use.</p>';
    else if (!s.realmsVisited.length) form = '<p class="satchel-hint">Walk into a realm first; pets can only go where you have been.</p>';
    else if (!free.length) form = '<p class="satchel-hint">Every pet is in your party or away. Pets outside the party can explore.</p>';
    else
      form = `<div class="exp-form">
        <label>Realm <select id="exp-realm">${s.realmsVisited.map((r) => `<option value="${r}">${REALMS[r].name}</option>`).join('')}</select></label>
        <label>Length <select id="exp-length">${EXPEDITION_LENGTHS.map((ms) => `<option value="${ms / 3_600_000}">${formatDuration(ms)}</option>`).join('')}</select></label>
        </div>
        <ul class="exp-pets">${free
          .map((p) => `<li><button type="button" data-act="exp-send" data-pet="${p.uid}">Send ${getSpecies(p.speciesId).name} <small>Lv ${p.level}</small></button></li>`)
          .join('')}</ul>`;
    return `${active ? `<ul class="buildings">${active}</ul>` : ''}${form}`;
  }

  private markReady(): void {
    const h = this.game.save.hearthstead;
    const ready = BUILDING_IDS.some((id) => {
      const b = h.buildings[id];
      return b && stored(BUILDINGS[id], b) >= storageCap(BUILDINGS[id], b) * 0.25;
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
          <button type="button" data-act="collect" data-id="${id}" ${have ? '' : 'disabled'}>Collect</button>
          <button type="button" data-act="upgrade" data-id="${id}" ${this.game.canUpgrade(id) ? '' : 'disabled'}
            title="${maxed ? '' : `${formatCount(ratePerHour(def, b.level))}/h now`}">
            ${maxed ? 'Max level' : `Upgrade · ${formatCount(cost.coin)}c, ${cost.amount} ${MATERIALS[cost.material].name}`}
          </button>
        </div>
      </li>`;
    }).join('');
    const eggs =
      level < EGG_UNLOCK_LEVEL
        ? `<p class="satchel-hint">Opens at level ${EGG_UNLOCK_LEVEL}.</p>`
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
      <p class="stride-note" title="Every 100 m you walk moves all timers forward 10 minutes">Walking skips time: <b>${formatDuration(STRIDE_DAILY_CAP_MS - left)}</b> of ${formatDuration(STRIDE_DAILY_CAP_MS)} today</p>
      <ul class="buildings">${cards}</ul>
      <p class="satchel-hint">${formatCount(s.supplies.tonic)} Tonic · ${formatCount(s.supplies.petXp)} Pet XP</p>
      <h3>Expeditions</h3>
      ${this.expeditionsHtml()}
      <h3>Incubator</h3>
      ${eggs}`;
  }
}
