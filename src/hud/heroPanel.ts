import {
  canPickSecond,
  classSpells,
  CLASSES,
  HERO_CLASSES,
  HERO_SPELLS,
  heroClasses,
  heroStats,
  LOOKS,
  openTalentRows,
  SECOND_CLASS_LEVEL,
  STATS,
  talentRows,
  type HeroClass,
  type Stat,
} from '../game/hero';
import { FORGE_LEVEL, power, RARITIES, SLOT_DEFS, SLOTS } from '../game/gear';
import type { GameState } from '../game/state';
import { nextUnlock } from '../game/wayfarer';
import { journal } from '../ui/journal';
import { h, openSheet } from '../ui/dom';
import { sound } from '../audio/sound';
import { formatCount } from './format';
import { gearSvg } from './gearArt';
import { heroSvg } from './heroArt';
import type { ForgePanel } from './forgePanel';

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The hero page, first tab behind the hero's portrait on the map: level, class, stats,
 * mana, spells, talents and gear. Everything here is a tap; nothing needs a manual.
 */
export class HeroPanel {
  private readonly host = document.getElementById('hero-panel')!;
  private readonly mapButton = document.getElementById('journal-open')!;

  constructor(
    private readonly game: GameState,
    private readonly forge: ForgePanel,
    private readonly toast: (text: string) => void,
  ) {
    journal.onShow('wayfarer', () => this.render());
    this.host.addEventListener('click', (e) => this.onClick(e));
    game.on((e) => {
      if (e.kind !== 'change' && e.kind !== 'levelUp') return;
      this.refreshBadge();
      if (journal.showing('wayfarer')) this.render();
    });
    this.refreshBadge();
  }

  /** The portrait on the map button, and a dot when a talent or a second class waits. */
  private refreshBadge(): void {
    const hero = this.game.save.hero;
    const level = this.game.level.level;
    this.mapButton.innerHTML = `<span class="hero-bust">${heroSvg(hero.cls, hero.look, 40)}</span>`;
    const waiting = openTalentRows(hero, level) + (canPickSecond(hero, level) ? 1 : 0);
    journal.setBadge('wayfarer', waiting > 0);
  }

  private onClick(e: Event): void {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    const { act, cls, row, pick } = btn.dataset;
    const g = this.game;
    if (act === 'look') {
      journal.close();
      openLookChoice(g, g.save.hero.cls ?? 'beastcaller');
    }
    if (act === 'class' && cls && g.chooseClass(cls as HeroClass)) {
      sound.play('levelUp', 0.3);
      this.toast(`${g.save.hero.name} walks the path of the ${CLASSES[cls as HeroClass].name} too.`);
    }
    if (act === 'talent' && cls && g.pickTalent(cls as HeroClass, Number(row), Number(pick) as 0 | 1)) sound.play('equip');
    if (act === 'reset') g.resetTalents();
    if (act === 'forge') this.forge.open();
  }

  render(): void {
    const g = this.game;
    const hero = g.save.hero;
    const lvl = g.level;
    const level = lvl.level;
    journal.setTitle(hero.name);
    if (!hero.cls) {
      this.host.innerHTML = '';
      this.host.append(classPicker(HERO_CLASSES, (cls) => {
        journal.close();
        openLookChoice(g, cls);
      }));
      return;
    }
    const classes = heroClasses(hero);
    const stats = heroStats(hero, level);
    const next = nextUnlock(level);
    const xpPct = lvl.needed ? (100 * lvl.into) / lvl.needed : 100;
    const manaPct = (100 * g.mana) / g.maxMana;

    const card = `
      <div class="hero-card">
        <button type="button" class="hero-portrait" data-act="look" aria-label="Change looks and name">${heroSvg(hero.cls, hero.look, 72)}</button>
        <div class="hero-id">
          <b class="hero-name">${esc(hero.name)}</b>
          <span class="hero-classes">Level ${level} ${classes.map((c) => `<span class="class-chip" style="--cls:${CLASSES[c].color}">${CLASSES[c].glyph} ${CLASSES[c].name}</span>`).join(' ')}</span>
          <span class="meter" title="${lvl.needed ? `${formatCount(lvl.into)} / ${formatCount(lvl.needed)} XP` : 'Highest level'}"><span style="width:${xpPct}%"></span></span>
          <small>${lvl.needed ? `${formatCount(lvl.needed - lvl.into)} XP to level ${level + 1}` : 'Highest level reached'}${next ? ` · Lv ${next.level}: ${next.what}` : ''}</small>
        </div>
      </div>
      <ul class="hero-stats">
        ${(Object.keys(STATS) as Stat[]).map((s) => `<li title="${STATS[s].blurb}"><b>${STATS[s].glyph} ${stats[s]}</b>${STATS[s].name}</li>`).join('')}
        <li class="hero-mana" title="Fills as you walk"><b>✦ ${g.mana}/${g.maxMana}</b>Mana<span class="meter meter-mana"><span style="width:${manaPct}%"></span></span></li>
      </ul>`;

    const spells = classSpells(hero)
      .map(({ id, level: at }) => {
        const s = HERO_SPELLS[id];
        const known = at <= level;
        return `<li class="hero-spell${known ? '' : ' locked'}"><span class="spell-glyph">${s.glyph}</span>
          <div><b>${s.name}</b><small>${s.blurb}</small></div>
          <span class="spell-cost">${known ? `✦${g.spellCost(id)}` : `Lv ${at}`}</span></li>`;
      })
      .join('');

    const rows = talentRows(hero);
    const talents = rows
      .map((r) => {
        const open = r.level <= level;
        const opts = r.options
          .map(
            (t, i) => `<button type="button" class="talent" data-act="talent" data-cls="${r.cls}" data-row="${r.row}" data-pick="${i}"
              aria-pressed="${r.picked === i}" ${open ? '' : 'disabled'}><b>${t.name}</b><small>${t.blurb}</small></button>`,
          )
          .join('');
        return `<li class="talent-row${open && r.picked === undefined ? ' talent-open' : ''}"><span class="talent-level">${r.level}</span>${opts}</li>`;
      })
      .join('');
    const anyPicked = rows.some((r) => r.picked !== undefined);

    const s = g.save;
    const gear = SLOTS.map((slot) => {
      const item = s.gear.find((x) => x.id === s.equipped[slot]);
      return `<li title="${item ? SLOT_DEFS[slot].effect(power(item)) : `${SLOT_DEFS[slot].name}: empty`}">${gearSvg(item ?? { slot }, 36)}<small style="${item ? `color:${RARITIES[item.rarity].color}` : ''}">${item ? `${SLOT_DEFS[slot].name}${item.plus ? ` +${item.plus}` : ''}` : '—'}</small></li>`;
    }).join('');

    this.host.innerHTML = `
      ${card}
      ${canPickSecond(hero, level) ? '<div class="second-class"><h3>Choose a second class</h3><div id="second-picker"></div></div>' : ''}
      <h3>Spells <small>one per turn in battle, free</small></h3>
      <ul class="hero-spells">${spells}</ul>
      <h3>Talents ${anyPicked ? '<button type="button" class="link-button" data-act="reset">Reset</button>' : ''}</h3>
      <ul class="talent-rows">${talents}</ul>
      ${level < SECOND_CLASS_LEVEL ? `<p class="satchel-hint">A second class opens at level ${SECOND_CLASS_LEVEL}.</p>` : ''}
      <h3>Gear</h3>
      <ul class="hero-gear">${gear}</ul>
      ${level >= FORGE_LEVEL ? '<div class="satchel-actions"><button type="button" data-act="forge">Forge and equip</button></div>' : `<p class="satchel-hint">The Forge opens at level ${FORGE_LEVEL}.</p>`}`;
    const second = this.host.querySelector('#second-picker');
    if (second)
      second.replaceWith(
        classPicker(
          HERO_CLASSES.filter((c) => c !== hero.cls),
          (cls) => {
            if (g.chooseClass(cls)) sound.play('levelUp', 0.3);
          },
        ),
      );
  }
}

/** Big tappable class cards: portrait, name, one line, and the first spell. */
function classPicker(classes: HeroClass[], onPick: (cls: HeroClass) => void): HTMLElement {
  return h(
    'div',
    { class: 'class-picker' },
    ...classes.map((cls) => {
      const c = CLASSES[cls];
      const btn = h(
        'button',
        { class: 'class-card', type: 'button', style: `--cls:${c.color}`, onclick: () => onPick(cls) },
        h('strong', {}, `${c.glyph} ${c.name}`),
        h('small', {}, c.blurb),
        h('small', { class: 'class-spells' }, c.spells.map((id) => HERO_SPELLS[id].name).join(' · ')),
      );
      btn.insertAdjacentHTML('afterbegin', heroSvg(cls, 0, 64));
      return btn;
    }),
  );
}

/** Picks a look and a name. On first play it follows the class choice; later it opens from the portrait. */
export function openLookChoice(game: GameState, cls: HeroClass, onDone?: () => void): void {
  const hero = game.save.hero;
  const first = !hero.cls;
  let look = first ? 0 : hero.look;
  const sheet = openSheet(first ? `The ${CLASSES[cls].name}` : 'Your hero', { closable: !first, className: 'sheet-hero' });
  const looks = h('div', { class: 'look-row', role: 'radiogroup', 'aria-label': 'Looks' });
  const drawLooks = () =>
    looks.replaceChildren(
      ...LOOKS[cls].map((_, i) => {
        const b = h('button', { class: 'look', type: 'button', role: 'radio', 'aria-checked': String(i === look), onclick: () => ((look = i), drawLooks()) });
        b.innerHTML = heroSvg(cls, i, 72);
        return b;
      }),
    );
  drawLooks();
  const name = h('input', { class: 'hero-name-input', type: 'text', maxlength: 24, value: hero.name, 'aria-label': 'Name', autocomplete: 'off' }) as HTMLInputElement;
  const done = () => {
    if (first) game.chooseClass(cls);
    game.setHeroLook(name.value, look);
    sound.play(first ? 'levelUp' : 'equip');
    sheet.close();
    onDone?.();
  };
  sheet.body.append(
    looks,
    h('label', { class: 'hero-name-label' }, 'Name', name),
    h('div', { class: 'satchel-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: done }, first ? 'Set out' : 'Done')),
  );
}

/** First play: who are you? Three classes, then a look and a name. */
export function openHeroChoice(game: GameState, onDone: () => void): void {
  const sheet = openSheet('Who walks the map?', { closable: false, className: 'sheet-hero' });
  sheet.body.append(
    h('p', { class: 'lore' }, 'Pick a path. Your hero fights beside your Wildlings. A second path opens at level 20.'),
    classPicker(HERO_CLASSES, (cls) => openLookChoice(game, cls, onDone)),
  );
}
