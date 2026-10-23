import type { Collection } from '../creatures/collection';
import {
  DEED_GROUPS,
  DEEDS,
  deedProgress,
  earnDeeds,
  recordRealm,
  recordShrines,
  recordWalk,
  recordWin,
  TIER_REWARD,
  wearTitle,
  wornTitle,
  type Deed,
  type DeedGroup,
  type DeedStats,
} from '../game/deeds';
import type { RealmId } from '../game/realms';
import type { Rarity } from '../game/spawns';
import type { GameState } from '../game/state';
import { formatCount } from '../hud/format';
import { h, openSheet, type Sheet } from './dom';

const TIER_COLORS: Record<Deed['tier'], [string, string]> = {
  1: ['#c98b52', '#7a4a22'],
  2: ['#d9d9d0', '#6f6f66'],
  3: ['#f3d27a', '#9a7212'],
  4: ['#b7a2f0', '#4b3790'],
};

/** A wax medal, coloured by tier; greyed out until the deed is earned. */
function medal(deed: Deed, earned: boolean): HTMLElement {
  const [face, rim] = earned ? TIER_COLORS[deed.tier] : ['#cbbb98', '#8d7b5c'];
  const star = earned ? '<path d="M20 9l3 7 7 .6-5.4 4.6 1.7 7.3L20 24.6l-6.3 3.9 1.7-7.3L10 16.6l7-.6z" fill="#fdf6e3" opacity=".85"/>' : '<text x="20" y="26" text-anchor="middle" font-size="15" fill="#8d7b5c">?</text>';
  const span = h('span', { class: 'deed-medal', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 40 40"><path d="M12 30l-4 9 6-2 3 4 3-9M28 30l4 9-6-2-3 4-3-9" fill="${earned ? '#8e2b22' : '#a89878'}"/><circle cx="20" cy="18" r="15" fill="${face}" stroke="${rim}" stroke-width="2.5"/><circle cx="20" cy="18" r="11" fill="none" stroke="${rim}" stroke-width="1" opacity=".6"/>${star}</svg>`;
  return span;
}

function progressText(deed: Deed, stats: DeedStats): string {
  const value = Math.min(deed.goal, deed.progress(stats));
  if (deed.unit === 'km') return `${(value / 1000).toFixed(1)} / ${(deed.goal / 1000).toFixed(1)} km`;
  return `${formatCount(Math.floor(value))} / ${formatCount(deed.goal)}`;
}

/**
 * Keeps the deeds: feeds their counters from what happens in the game, awards the ones
 * that are earned (coin and Wayfarer XP), shows the deeds sheet and the worn title.
 */
export class DeedKeeper {
  private checking = false;
  private unseen = 0;
  private queue: Deed[] = [];
  private showing = false;
  private sheet: Sheet | null = null;

  constructor(
    private readonly game: GameState,
    private readonly collection: Collection,
    private readonly button: HTMLElement,
    private readonly titleEl: HTMLElement,
  ) {
    button.addEventListener('click', () => this.open());
    game.on((event) => event.kind === 'change' && this.check());
    this.check();
    this.renderTitle();
  }

  private get state() {
    return this.game.save.deeds;
  }

  stats(): DeedStats {
    const s = this.game.save;
    const pets = this.collection.pets;
    return {
      distanceMetres: s.distanceMetres,
      shrinesVisited: s.shrinesVisited,
      cellsWalked: s.visitedCells.length,
      wayfarerLevel: this.game.level.level,
      coin: s.currencies.coin,
      wanderlight: s.currencies.wanderlight,
      speciesBound: new Set(pets.map((p) => p.speciesId)).size,
      speciesSeen: this.collection.seen.length,
      bestPetLevel: pets.reduce((best, p) => Math.max(best, p.level), 0),
      counters: this.state.counters,
      deedsEarned: Object.keys(this.state.earned).length,
    };
  }

  walk(metres: number, time: number): void {
    recordWalk(this.state.counters, metres, time);
    this.check(time);
  }

  enterRealm(realm: RealmId, time = Date.now()): void {
    const before = this.state.counters.feats.length;
    if (recordRealm(this.state.counters, realm, time) || this.state.counters.feats.length !== before) {
      this.check(time);
      this.game.changed();
    }
  }

  /** A Wildling bound or a Blotspawn driven off. */
  win(kind: 'pet' | 'monster', rarity: Rarity): void {
    recordWin(this.state.counters, kind, rarity);
    this.check();
    this.game.changed();
  }

  /** Awards any deed now earned. Safe to call often. */
  check(now = Date.now()): void {
    if (this.checking) return;
    this.checking = true;
    try {
      recordShrines(this.state.counters, this.game.save.shrinesVisited, now);
      const fresh = earnDeeds(this.state, this.stats(), now);
      if (!fresh.length) return;
      for (const deed of fresh) {
        const reward = TIER_REWARD[deed.tier];
        this.game.save.currencies.coin += reward.coin;
        this.game.grantXp(reward.xp);
      }
      // Wear the first title earned so new players see what titles are.
      if (!this.state.title) {
        const titled = fresh.find((d) => d.title);
        if (titled) wearTitle(this.state, titled.id);
      }
      this.unseen += fresh.length;
      this.queue.push(...fresh);
      this.game.changed();
      this.renderButton();
      this.renderTitle();
      if (this.sheet) this.renderSheet(this.sheet);
      void this.announce();
    } finally {
      this.checking = false;
    }
  }

  /** Shows earned deeds one by one in a banner that unrolls from the top. */
  private async announce(): Promise<void> {
    if (this.showing) return;
    this.showing = true;
    while (this.queue.length) {
      const deed = this.queue.shift()!;
      const reward = TIER_REWARD[deed.tier];
      const banner = h(
        'button',
        { class: `deed-banner deed-tier-${deed.tier}`, type: 'button', role: 'status', onclick: () => this.open() },
        medal(deed, true),
        h(
          'span',
          { class: 'deed-banner-text' },
          h('small', {}, 'Deed done'),
          h('b', {}, deed.name),
          h('span', {}, `+${reward.coin} coin, +${reward.xp} XP${deed.title ? ` · Title: ${deed.title}` : ''}`),
        ),
      );
      document.body.appendChild(banner);
      await new Promise((r) => setTimeout(r, 3400));
      banner.classList.add('deed-banner-out');
      await new Promise((r) => setTimeout(r, 400));
      banner.remove();
    }
    this.showing = false;
  }

  private renderButton(): void {
    this.button.dataset.unseen = this.unseen ? String(Math.min(this.unseen, 99)) : '';
  }

  private renderTitle(): void {
    const title = wornTitle(this.state);
    this.titleEl.hidden = !title;
    this.titleEl.textContent = title ?? '';
  }

  open(): void {
    this.unseen = 0;
    this.renderButton();
    const sheet = openSheet('Deeds & Titles', { className: 'deeds-sheet' });
    this.sheet = sheet;
    sheet.onClose(() => this.sheet === sheet && (this.sheet = null));
    this.renderSheet(sheet);
  }

  private renderSheet(sheet: Sheet): void {
    const stats = this.stats();
    const earned = this.state.earned;
    const titles = DEEDS.filter((d) => d.title && d.id in earned);
    const scroll = sheet.body.scrollTop;

    const choose = (id: string | null) => {
      wearTitle(this.state, id);
      this.renderTitle();
      this.game.changed();
      this.renderSheet(sheet);
    };

    const titleRow = h(
      'div',
      { class: 'deeds-titles' },
      h('p', { class: 'deeds-summary' }, `${Object.keys(earned).length} of ${DEEDS.length} deeds done · ${titles.length} titles earned`),
      titles.length
        ? h(
            'div',
            { class: 'title-chips', role: 'radiogroup', 'aria-label': 'Title to wear' },
            h('button', { type: 'button', class: 'title-chip', role: 'radio', 'aria-checked': String(!this.state.title), onclick: () => choose(null) }, 'No title'),
            ...titles.map((d) =>
              h(
                'button',
                { type: 'button', class: 'title-chip', role: 'radio', 'aria-checked': String(this.state.title === d.id), onclick: () => choose(d.id) },
                d.title!,
              ),
            ),
          )
        : h('p', { class: 'deeds-hint' }, 'Earn deeds marked with a title to wear one beside your name.'),
    );

    const groups = (Object.keys(DEED_GROUPS) as DeedGroup[]).map((group) => {
      const deeds = DEEDS.filter((d) => d.group === group);
      const done = deeds.filter((d) => d.id in earned).length;
      return h(
        'section',
        { class: 'deed-group' },
        h('h3', {}, DEED_GROUPS[group], h('small', {}, ` ${done}/${deeds.length}`)),
        h('ul', { class: 'deed-list' }, ...deeds.map((d) => this.deedRow(d, stats, d.id in earned))),
      );
    });

    sheet.body.replaceChildren(titleRow, ...groups);
    sheet.body.scrollTop = scroll;
  }

  private deedRow(deed: Deed, stats: DeedStats, earned: boolean): HTMLElement {
    if (deed.secret && !earned) {
      return h(
        'li',
        { class: 'deed deed-secret' },
        medal(deed, false),
        h('div', { class: 'deed-text' }, h('b', {}, 'A secret deed'), h('span', {}, 'Some deeds reveal themselves only when done.')),
      );
    }
    const reward = TIER_REWARD[deed.tier];
    const fraction = deedProgress(deed, stats);
    return h(
      'li',
      { class: `deed${earned ? ' deed-earned' : ''}` },
      medal(deed, earned),
      h(
        'div',
        { class: 'deed-text' },
        h('b', {}, deed.name),
        h('span', {}, deed.text),
        earned
          ? h('small', {}, `Done ${new Date(this.state.earned[deed.id]).toLocaleDateString()}`)
          : h(
              'span',
              { class: 'deed-progress' },
              h('span', { class: 'deed-track' }, h('span', { class: 'deed-fill', style: { width: `${fraction * 100}%` } })),
              h('small', {}, progressText(deed, stats)),
            ),
      ),
      h(
        'div',
        { class: 'deed-reward' },
        deed.title && h('span', { class: 'deed-title-tag' }, deed.title),
        h('small', {}, `${reward.coin} coin · ${reward.xp} XP`),
      ),
    );
  }
}
