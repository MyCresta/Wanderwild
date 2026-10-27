import {
  Battle,
  CRIT_QUALITY,
  makeFighter,
  shareXp,
  victoryRewards,
  type Action,
  type BattleEvent,
  type Fighter,
  type HpSnap,
} from '../creatures/battle';
import { BOSS_TITLES, FOE_TRAITS, RANKS, rankLabel } from '../creatures/foes';
import {
  FIT_TO_FIGHT,
  fitToFight,
  grantPetXp,
  markSeen,
  partyPets,
  petBonus,
  REST_FULL_MS,
  setVigor,
  vigorNow,
  type OwnedPet,
} from '../creatures/collection';
import { ELEMENTS, getSpecies } from '../creatures/species';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { cadence, moveBlurb, moveSummary, readyIn } from '../creatures/moves';
import type { GameContext } from './context';
import { h, openSheet, toast, wait } from './dom';
import { elementTag, wheelHelp } from './wheel';
import { healList } from './tonics';
import { sound } from '../audio/sound';
import { HERO_SPELLS, type HeroSpellId } from '../game/hero';
import { inkbinderSvg } from '../creatures/art/inkbinder';
import { GRADES, rivalTitle, unbound, type Rival } from '../game/rivals';
import { startFollowing } from '../creatures/befriend';
import { setBonus } from '../creatures/roost';
import { lineWanted } from '../creatures/scarcity';

/** How long the timing needle takes to sweep across an attack button. */
const SWEEP_MS = 850;
/** Where the sweet spot sits on the sweep, 0..1, and how far from it still counts for something. */
const SWEET = 0.8;
const SWEET_SPREAD = 0.3;
/** Lunge timings: the blow lands at the far end of the lunge. */
const LUNGE_MS = 420;
const IMPACT_MS = 190;
/** Pause between your move and the foe's, so turns read as turns. */
const TURN_PAUSE_MS = 450;

function hpBar() {
  const name = h('span', { class: 'hp-name' });
  const fill = h('span', { class: 'hp-fill' });
  const text = h('span', { class: 'hp-text' });
  const bar = h('div', { class: 'hp' }, name, h('span', { class: 'hp-track' }, fill), text);
  const update = (fighter: Fighter, hp: number) => {
    const pct = (hp / fighter.maxHp) * 100;
    name.textContent = `${fighter.species.name} · Lv ${fighter.level}`;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('hp-low', pct < 30);
    text.textContent = `${hp} / ${fighter.maxHp}`;
  };
  return { bar, update };
}

function floatText(host: HTMLElement, text: string, kind: string) {
  const node = h('span', { class: `float-text float-${kind}` }, text);
  host.appendChild(node);
  setTimeout(() => node.remove(), 1100);
}

/**
 * The timing tap: a needle sweeps along a wide bar just above the attacks, where the thumb
 * on the button cannot hide it, and a second tap on that same button (or on the bar) as the
 * needle crosses the gold mark lands a critical hit. Resolves with 0..1.
 */
function timingSweep(btn: HTMLButtonElement, bar: HTMLElement, critAt = CRIT_QUALITY): Promise<number> {
  const needle = h('span', { class: 'sweep-needle' });
  const runner = h('span', { class: 'sweep-runner' }, needle);
  const track = h('span', { class: 'sweep-track', style: `--sweet: ${SWEET * 100}%` }, h('span', { class: 'sweep-zone' }), runner);
  const hint = h('span', { class: 'sweep-hint' }, 'Tap again on the gold!');
  bar.replaceChildren(hint, track);
  bar.classList.add('sweeping');
  btn.classList.add('sweeping');
  btn.disabled = false;
  // A transform animation runs on the compositor, so the needle glides even when the page is busy,
  // and the tap is scored from its own timestamp against the animation's clock: what you see is what counts.
  const sweep = runner.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], {
    duration: SWEEP_MS,
    easing: 'linear',
    fill: 'forwards',
  });
  return new Promise((resolve) => {
    let done = false;
    const at = (t: number) => {
      const start = sweep.startTime;
      return typeof start === 'number' ? Math.min(1, Math.max(0, (t - start) / SWEEP_MS)) : 0;
    };
    const finish = (quality: number) => {
      if (done) return;
      done = true;
      sweep.pause();
      btn.removeEventListener('pointerdown', onTap);
      bar.removeEventListener('pointerdown', onTap);
      bar.classList.add(quality >= critAt ? 'sweep-perfect' : quality > 0.4 ? 'sweep-good' : 'sweep-miss');
      hint.textContent = quality >= critAt ? 'Perfect!' : quality > 0.4 ? 'Good' : 'Missed the mark';
      setTimeout(() => {
        btn.classList.remove('sweeping');
        bar.classList.remove('sweeping', 'sweep-perfect', 'sweep-good', 'sweep-miss');
        bar.replaceChildren();
      }, 420);
      resolve(quality);
    };
    const onTap = (e: Event) => {
      e.preventDefault();
      finish(Math.max(0, 1 - Math.abs(at(e.timeStamp) - SWEET) / SWEET_SPREAD));
    };
    btn.addEventListener('pointerdown', onTap);
    bar.addEventListener('pointerdown', onTap);
    sweep.finished.then(
      () => finish(0.2),
      () => finish(0.2),
    );
  });
}

/** One command card: icon and name, a line under it, and an optional tag. All buttons in the battle share it. */
function card(btn: HTMLButtonElement, name: string, sub: string, tag?: HTMLElement | null): void {
  btn.replaceChildren(h('span', { class: 'cmd-name' }, name), h('span', { class: 'cmd-sub' }, sub), tag ?? '');
}

export interface BattleOpts {
  /** A practice bout: no rewards and nothing at stake. */
  practice?: boolean;
  /** The boss check has been shown and the player chose to fight. */
  gateSeen?: boolean;
}

/** What a foe is called on screen: bosses carry a title, ranked foes a badge. */
export function foeName(encounter: Encounter): string {
  if (encounter.rank === 'boss') return `${encounter.species.name} ${BOSS_TITLES[(encounter.tier ?? 1) - 1]}`;
  return encounter.species.name;
}

/** Average level of the pets fit to fight, to weigh against a boss. */
const partyLevel = (pets: OwnedPet[]) => (pets.length ? Math.round(pets.reduce((sum, p) => sum + p.level, 0) / pets.length) : 0);

/**
 * Before a boss: what it is, what it is weak to, and how ready the party is. Bosses do not
 * scale with you, so this is the moment to turn back, rest or bring other pets.
 */
function openBossGate(ctx: GameContext, encounter: Encounter, onFight: () => void): void {
  const pets = partyPets(ctx.collection);
  const level = partyLevel(pets.filter((p) => fitToFight(p)));
  const gap = encounter.level - level;
  const sheet = openSheet(foeName(encounter), { className: 'sheet-boss' });
  const weak = encounter.species.kind === 'monster' ? encounter.species.weakTo : null;
  const counter = weak && pets.some((p) => getSpecies(p.speciesId).element === weak);
  const verdict =
    gap > 2
      ? `Too strong for now: it is level ${encounter.level}, your party about ${level}.`
      : !counter && weak
        ? `A hard fight. None of your party is ${ELEMENTS[weak].name}, which it fears. Bring one, and tonics.`
        : pets.length < 3
          ? 'A hard fight. Bring a full party of three Wildlings, and tonics.'
          : 'A hard fight, but you are ready. Lead with your strongest against it and keep tonics close.';
  sheet.body.append(
    h('div', { class: 'boss-gate' }, createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 120, facing: -1 })),
    h(
      'p',
      { class: 'boss-meta' },
      h('span', { class: 'rank-chip rank-boss' }, rankLabel('boss', encounter.tier)),
      ` Level ${encounter.level} `,
      elementTag(encounter.species.element),
      weak ? ' weak to ' : '',
      weak ? elementTag(weak) : '',
    ),
    h('p', { class: 'hint' }, (encounter.traits ?? []).map((t) => `${FOE_TRAITS[t].glyph} ${FOE_TRAITS[t].name}: ${FOE_TRAITS[t].blurb}`).join(' '), ' Below half health it grows enraged.'),
    healList(ctx, pets),
    h('p', { class: `gate-verdict${gap > 1 ? ' gate-risky' : ''}` }, verdict),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Not yet'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (sheet.close(), onFight()) }, 'Fight'),
    ),
  );
}

/**
 * Before an Inkbinder: who they are, the three Taken they will send in, and how ready the party is.
 * Each Taken is a different element, so one counter will not carry the fight: the party needs range.
 */
function openRivalGate(ctx: GameContext, rival: Rival, onFight: () => void): void {
  const pets = partyPets(ctx.collection);
  const level = partyLevel(pets.filter((p) => fitToFight(p)));
  const top = Math.max(...rival.line.map((e) => e.level));
  const arch = rival.grade === 'arch';
  const sheet = openSheet(rivalTitle(rival), { className: `sheet-boss sheet-rival rival-${rival.grade}` });
  const counters = rival.line.filter((e) => {
    const s = e.species;
    return s.kind === 'monster' && pets.some((p) => getSpecies(p.speciesId).element === s.weakTo);
  }).length;
  const verdict =
    top - level > 3
      ? `Too strong for now: their Taken reach level ${top}, your party about ${level}.`
      : pets.length < 3
        ? 'Three Taken against fewer Wildlings. Bring a full party of three, and tonics.'
        : counters < 2
          ? `Your party counters only ${counters} of the three. Bring Wildlings strong against the others.`
          : arch
            ? 'A hard fight. Swap to the right Wildling for each Taken and keep tonics close.'
            : 'A fair fight. Swap to the right Wildling for each Taken.';
  const figure = h('div', { class: 'rival-figure' });
  figure.innerHTML = inkbinderSvg(rival, 72);
  sheet.body.append(
    figure,
    h(
      'p',
      { class: 'hint rival-lore' },
      arch
        ? 'An Archbinder: their Taken are Rare and stronger than your party. Free them and one may walk with you.'
        : 'A renegade scribe who binds Wildlings with Blot ink. Beat all three Taken to free them, and one may walk with you.',
    ),
    h(
      'ol',
      { class: 'rival-line' },
      ...rival.line.map((e) =>
        h(
          'li',
          {},
          createCreatureSvg({ speciesId: e.species.id, seed: e.seed, size: 64, facing: -1 }),
          h('span', { class: 'rival-lv' }, `Lv ${e.level}`),
          elementTag(e.species.element),
          h('span', { class: 'rival-quirks', title: (e.traits ?? []).map((t) => `${FOE_TRAITS[t].name}: ${FOE_TRAITS[t].blurb}`).join(' ') }, (e.traits ?? []).map((t) => FOE_TRAITS[t].glyph).join(' ')),
        ),
      ),
    ),
    healList(ctx, pets),
    h('p', { class: `gate-verdict${top - level > 2 || (arch && counters < 2) ? ' gate-risky' : ''}` }, verdict),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Not yet'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (sheet.close(), onFight()) }, 'Challenge'),
    ),
  );
}

/** A quick turn-based fight between the party and a Blotspawn, or an Inkbinder's line of three Taken. */
export function openBattle(ctx: GameContext, encounter: Encounter, onDone: (won: boolean) => void, opts: BattleOpts = {}): void {
  const owned = partyPets(ctx.collection);
  if (!owned.length) return;
  if (!owned.some((p) => fitToFight(p))) {
    const soonest = Math.ceil(Math.min(...owned.map((p) => (FIT_TO_FIGHT - vigorNow(p)) * REST_FULL_MS)) / 60_000);
    toast(`Your party is worn out. Let them rest${soonest > 0 ? ` about ${soonest} min` : ''}, or give them a tonic from your Bag.`);
    return;
  }
  const rival = encounter.rival;
  if ((encounter.rank === 'boss' || rival) && !opts.gateSeen) {
    const go = () => openBattle(ctx, encounter, onDone, { ...opts, gateSeen: true });
    if (rival) openRivalGate(ctx, rival, go);
    else openBossGate(ctx, encounter, go);
    return;
  }
  const practice = !!opts.practice;
  const line = rival?.line ?? [encounter];
  if (!practice) {
    for (const e of line) markSeen(ctx.collection, e.species.id);
    ctx.changed();
  }

  const way = ctx.wayfarer;
  const heroName = way?.heroName?.() ?? 'Your hero';
  const battle = new Battle(
    owned.map((p) => {
      const f = makeFighter(getSpecies(p.speciesId), p.level, p.seed, p.uid, {}, petBonus(p));
      // A completed element in the bestiary makes its Wildlings hit harder.
      f.atk = Math.round(f.atk * setBonus(ctx.collection, p.speciesId));
      return f;
    }),
    line.map((e) => makeFighter(e.species, e.level, e.seed, undefined, e)),
    {
      petDamage: way?.gear().petDamage,
      petHealth: way?.gear().petHealth,
      // Damage lasts between fights; practice bouts start fresh and leave no marks.
      vigor: practice ? undefined : owned.map((p) => vigorNow(p)),
      tonicPower: way?.tonicPower?.() ?? 1,
      hero: way?.hero(),
    },
  );
  /** The foe on screen, which trails the battle until a fallen foe's exit has played out. */
  let foe = battle.foe;
  let foeEnc = line[0];
  const rankName = foe.rank === 'rare' || foe.rank === 'elite' ? `${RANKS[foe.rank].name} ` : '';
  const title = practice ? 'Practice bout' : rival ? rivalTitle(rival) : `${rankName}${foeName(encounter)} blocks the way`;
  const sheet = openSheet(title, { className: `sheet-battle battle-rank-${foe.rank}${rival ? ' battle-rival' : ''}` });
  let reported = false;
  const finish = (won: boolean) => {
    if (reported) return;
    reported = true;
    if (!practice) {
      const now = Date.now();
      battle.vigorLeft().forEach((v, i) => setVigor(owned[i], v, now));
      ctx.changed();
    }
    onDone(won);
  };
  const endMusic = sound.scene('battle');
  sheet.onClose(() => {
    endMusic();
    finish(false);
  });

  // What the screen shows, which trails the battle's own state until each blow is played out.
  const shown: HpSnap & { active: number } = { foe: foe.hp, party: battle.party.map((f) => f.hp), active: battle.active };

  const intent = h('div', { class: 'intent', 'aria-live': 'polite' });
  const foeSpot = h('div', { class: `fighter fighter-foe fighter-${foe.rank}` }, intent);
  const petSpot = h('div', { class: 'fighter fighter-pet' });
  const petStatus = h('div', { class: 'status-row' });
  const showPet = () => {
    const p = owned[shown.active];
    petSpot.classList.remove('faint');
    petSpot.replaceChildren(createCreatureSvg({ speciesId: p.speciesId, seed: p.seed, size: 150 }));
  };
  showPet();
  const foeHp = hpBar();
  const petHp = hpBar();
  const showHp = () => {
    foeHp.update(foe, shown.foe);
    petHp.update(battle.party[shown.active], shown.party[shown.active]);
    bench.querySelectorAll<HTMLElement>('.bench-hp > span').forEach((bar, i) => {
      bar.style.width = `${(100 * shown.party[i]) / battle.party[i].maxHp}%`;
    });
  };
  const applySnap = (e: BattleEvent) => {
    if (!e.hp) return;
    shown.foe = e.hp.foe;
    shown.party = [...e.hp.party];
    showHp();
  };
  /** Speed as one chip on each side; the faster one is marked, since it attacks first. */
  const speedChip = (f: Fighter, first: boolean) =>
    h(
      'span',
      { class: `trait-chip chip-speed${first ? ' chip-first' : ''}`, title: 'Speed: a faster foe strikes before you choose your move; otherwise your Wildling goes first.' },
      `⚡ ${f.spd}${first ? ' · first' : ''}`,
    );
  const foeSpeed = h('span', { class: 'speed-slot' });
  const foeTags = h('div', { class: 'status-row' });
  const enragedChip = h('span', { class: 'trait-chip chip-enraged', title: 'Its big attack comes every other turn' }, '🔥 Enraged');
  let wardChip: Element | null = null;
  // A rival's line as pips: one per Taken, dimmed once it falls.
  const pips = h('span', { class: 'foe-pips', 'aria-hidden': 'true' });
  /** Puts the current foe on screen: its art, badge, element and quirks. */
  const showFoe = () => {
    foeSpot.className = `fighter fighter-foe fighter-${foe.rank}`;
    foeSpot.replaceChildren(createCreatureSvg({ speciesId: foeEnc.species.id, seed: foeEnc.seed, size: 150, facing: -1 }), intent);
    foeTags.replaceChildren(
      ...(line.length > 1 ? [pips] : []),
      ...(foe.rank !== 'normal' ? [h('span', { class: `rank-chip rank-${foe.rank}` }, rankLabel(foe.rank, foe.tier))] : []),
      elementTag(foe.species.element),
      foeSpeed,
      ...foe.traits.map((t) => h('span', { class: 'trait-chip', title: FOE_TRAITS[t].blurb }, `${FOE_TRAITS[t].glyph} ${FOE_TRAITS[t].name}`)),
    );
    pips.replaceChildren(...line.map((_, i) => h('span', { class: i < battle.foes.indexOf(foe) ? 'pip-down' : '' })));
    wardChip = foe.traits.includes('warded') ? foeTags.querySelectorAll('.trait-chip')[foe.traits.indexOf('warded')] : null;
  };
  showFoe();
  const turnBanner = h('div', { class: 'turn-banner', 'aria-live': 'polite' });
  const arena = h(
    'div',
    { class: 'arena' },
    turnBanner,
    h('div', { class: 'arena-row arena-row-foe' }, h('div', { class: 'arena-info' }, foeHp.bar, foeTags), foeSpot),
    h('div', { class: 'arena-row arena-row-pet' }, petSpot, h('div', { class: 'arena-info' }, petHp.bar, petStatus)),
  );
  const weakness = foe.species.kind === 'monster' ? foe.species.weakTo : null;
  const opening = [
    practice
      ? 'A training blot made of practice ink. No rewards, nothing lost.'
      : rival
        ? `${rival.name} sends in ${foe.species.name}, with two more Taken behind it.`
        : `${foe.species.epithet}.`,
    weakness ? ` Weak to ${ELEMENTS[weakness].glyph} ${ELEMENTS[weakness].name}.` : '',
    foe.traits.length ? ` ${foe.traits.map((t) => `${FOE_TRAITS[t].name}: ${FOE_TRAITS[t].blurb.toLowerCase()}`).join(' ')}` : '',
  ].join('');
  const log = h('p', { class: 'battle-log' }, opening);

  const cmd = (extra = '') => h('button', { class: `cmd ${extra}`, type: 'button' });
  const attacks = [0, 1, 2].map((slot) => {
    const btn = cmd('cmd-attack');
    btn.addEventListener('click', () => act({ kind: 'attack', slot }));
    return btn;
  });
  const tonicBtn = cmd('cmd-way');
  const spellBtns = (battle.hero?.spells ?? []).map((id) => ({ id, el: cmd('cmd-way cmd-spell') }));
  const fleeBtn = h('button', { class: 'btn btn-small btn-flee', type: 'button', onclick: () => sheet.close() }, practice ? 'Stop' : 'Flee');
  const bench = h('div', { class: 'party-bench', role: 'group', 'aria-label': 'Party' });

  const section = (title: string, ...children: HTMLElement[]) =>
    h('section', { class: 'cmd-section' }, h('h3', { class: 'cmd-title' }, title), ...children);
  const attackSection = section('Attacks', h('div', { class: 'cmd-grid' }, ...attacks));
  const waySection = section('Hero', h('div', { class: 'cmd-grid' }, ...spellBtns.map((s) => s.el), tonicBtn));
  const wayTitle = waySection.querySelector('.cmd-title')!;
  const partySection = section('Party · tap to swap', bench);
  const partyTitle = partySection.querySelector('.cmd-title')!;
  waySection.hidden = !way;
  partySection.hidden = battle.party.length < 2;
  const panel = h('div', { class: 'cmd-panel' }, attackSection, waySection, partySection);
  const footer = h('div', { class: 'battle-footer' }, wheelHelp(foe.species.element), fleeBtn);
  // The crit bar lies over the log, so it shows above the attacks without shifting the buttons.
  const sweepBar = h('div', { class: 'sweep-bar', 'aria-live': 'polite' });
  sheet.body.append(arena, h('div', { class: 'log-wrap' }, log, sweepBar), panel, footer);

  let busy = false;
  const all = () => [...attacks, tonicBtn, ...spellBtns.map((s) => s.el), ...bench.querySelectorAll('button')];

  const setTurn = (side: 'pet' | 'foe' | null) => {
    arena.classList.toggle('turn-pet', side === 'pet');
    arena.classList.toggle('turn-foe', side === 'foe');
    panel.classList.toggle('cmd-waiting', side !== 'pet');
    turnBanner.hidden = !side;
    turnBanner.className = `turn-banner${side === 'foe' ? ' turn-banner-foe' : ''}`;
    turnBanner.textContent = side === 'foe' ? `${foe.species.name}'s turn` : battle.mustSwap ? 'Send in a Wildling' : 'Your turn';
  };

  const refreshStatus = () => {
    petStatus.replaceChildren(
      ...[
        elementTag(battle.party[shown.active].species.element),
        speedChip(battle.party[shown.active], battle.party[shown.active].spd >= foe.spd),
        battle.guard && h('span', { class: 'trait-chip chip-good' }, `⛨ Guard ${battle.guard.turns}`),
        battle.dodge && h('span', { class: 'trait-chip chip-good' }, '❂ Dodge'),
        battle.focus && h('span', { class: 'trait-chip chip-good' }, '✦ Weak spot marked'),
      ].filter((n): n is HTMLSpanElement => !!n),
    );
    foeSpeed.replaceChildren(speedChip(foe, foe.spd > battle.party[shown.active].spd));
    if (wardChip) wardChip.classList.toggle('chip-broken', !battle.wardUp);
    if (battle.enraged && !enragedChip.isConnected) foeTags.append(enragedChip);
    foeSpot.classList.toggle('burning', battle.burn > 0);
  };

  const refresh = () => {
    const cd = battle.cooldowns[battle.active];
    const forced = battle.mustSwap;
    battle.moves.forEach((move, slot) => {
      const btn = attacks[slot];
      const wait = cd[slot];
      const edge = battle.edge(move);
      // Fixed lines: the name (its colour edge shows the element), power pips and any trick, and how often it can be used.
      // A ▲ or ▼ in the corner marks it strong or weak against this foe.
      btn.replaceChildren(
        h('span', { class: 'cmd-name' }, move.name),
        h('span', { class: 'cmd-sub cmd-power' }, moveSummary(move)),
        h('span', { class: `cmd-sub cmd-wait${wait > 0 ? ' cmd-resting' : ''}` }, wait > 0 ? readyIn(wait) : cadence(battle.waitFor(move))),
        h('span', { class: `cmd-edge${edge > 1 ? ' edge-strong' : edge < 1 ? ' edge-weak' : ''}`, 'aria-hidden': 'true' }, edge > 1 ? '▲' : edge < 1 ? '▼' : ''),
      );
      btn.title = `${moveBlurb(move)}${edge > 1 ? ' Strong against this foe (×1.5).' : edge < 1 ? ' Weak against this foe (×0.6).' : ''}`;
      btn.disabled = busy || forced || wait > 0;
      btn.classList.toggle('cmd-strong', wait === 0 && edge > 1);
      btn.style.setProperty('--el', move.element ? ELEMENTS[move.element].color : 'var(--leather)');
    });
    const pet = battle.pet;

    const next = battle.intent;
    const threat = next.big ? battle.threat(battle.active) : 1;
    intent.className = `intent${next.big ? ' intent-big' : ''}`;
    intent.replaceChildren(
      next.big ? `⚠ Next: ${next.element ? ELEMENTS[next.element].glyph : ''} ${next.name}` : 'Next: Strike',
      threat > 1 ? h('small', {}, ' strong vs you!') : '',
    );
    intent.hidden = !!battle.winner;
    refreshStatus();

    bench.replaceChildren(
      ...battle.party.map((f, i) => {
        const p = owned[i];
        const edge = battle.bestEdge(f);
        const threatened = battle.threat(i) > 1;
        const btn = h(
          'button',
          {
            class: `bench-pet${i === battle.active ? ' bench-active' : ''}${f.hp <= 0 ? ' bench-down' : ''}`,
            type: 'button',
            'aria-label': `${f.species.name}, ${f.hp} of ${f.maxHp} health${i === battle.active ? ', fighting' : ''}${edge > 1 ? ', strong against this foe' : ''}`,
            onclick: () => act({ kind: 'swap', to: i }),
          },
          createCreatureSvg({ speciesId: p.speciesId, seed: p.seed, size: 44 }),
          h('span', { class: 'bench-hp' }, h('span', { style: { width: `${(100 * f.hp) / f.maxHp}%` } })),
          edge > 1 ? h('span', { class: 'bench-edge edge-strong', title: 'Strong against this foe' }, '▲') : threatened ? h('span', { class: 'bench-edge edge-weak', title: 'Weak to this foe' }, '▼') : null,
        );
        btn.disabled = busy || !battle.canSwapTo(i);
        return btn;
      }),
    );

    const tonics = way?.tonics() ?? 0;
    card(tonicBtn, '⚗ Tonic', tonics ? `Heals ${battle.tonicHeal} · ×${tonics}` : 'None · brew at Hearthstead');
    tonicBtn.disabled = busy || forced || !tonics || pet.hp >= pet.maxHp;
    const mana = way?.mana() ?? 0;
    wayTitle.textContent = battle.cast ? 'Hero · spell cast, now attack' : `Hero · ✦ ${mana} mana · one spell a turn, free`;
    for (const { id, el } of spellBtns) {
      const spell = HERO_SPELLS[id];
      const cost = way?.spellCost(id) ?? spell.cost;
      const sub = spell.kind === 'damage' ? `${battle.spellDamage(id)} damage` : spell.blurb.replace(/\.$/, '');
      card(el, `${spell.glyph} ${spell.name}`, `✦${cost} · ${sub}`);
      el.title = spell.blurb;
      el.disabled = busy || forced || mana < cost || !battle.canCast(id);
    }
    partyTitle.textContent = battle.freeSwap ? 'Party · pick who opens, free' : 'Party · tap to swap';
    fleeBtn.disabled = busy;
    showHp();
    setTurn(battle.winner ? null : 'pet');
  };

  const describe = (e: BattleEvent): string => {
    switch (e.kind) {
      case 'hit': {
        const who = e.attacker === 'pet' ? battle.party[shown.active].species.name : foe.species.name;
        let text = `${who} used ${e.name}`;
        if (e.effectiveness > 1) text += '. Strong hit!';
        else if (e.effectiveness < 1) text += '. Weak hit.';
        else text += '.';
        if (e.warded) text += ' The ward soaks half.';
        if (e.guarded) text += ' Guarded!';
        if (e.crit) text += e.attacker === 'pet' ? ' Critical!' : ' A critical blow!';
        return text;
      }
      case 'miss':
        return `${foe.species.name}'s ${e.name} whiffs past!`;
      case 'status':
        switch (e.status) {
          case 'guard':
            return `${battle.party[shown.active].species.name} raises ${e.name}.`;
          case 'dodge':
            return `${battle.party[shown.active].species.name} rides an ${e.name}, ready to dodge.`;
          case 'focus':
            return `${e.name}! The weak spot glows. Next attack is critical.`;
          case 'burn':
            return `${foe.species.name} catches fire!`;
          case 'hex':
            return `${foe.species.name} is hexed and hits softer.`;
          case 'howl':
            return 'The party howls back, hitting harder!';
          case 'ward-break':
            return 'The ward shatters!';
        }
        return '';
      case 'burn':
        return `${foe.species.name} burns for ${e.damage}.`;
      case 'reflect':
        return `Thorns throw ${e.damage} back!`;
      case 'leech':
        return `${foe.species.name} drinks ${e.amount} health back.`;
      case 'swap':
        return `${battle.party[e.to].species.name}, you're up!`;
      case 'heal':
        return e.source === 'tonic'
          ? `A tonic restores ${e.amount} health.`
          : e.source === 'drain'
            ? `${battle.party[shown.active].species.name} drains ${e.amount} health.`
            : `${battle.party[shown.active].species.name} draws on a Wellspring (+${e.amount}).`;
      case 'spell':
        return e.damage
          ? `${heroName} casts ${HERO_SPELLS[e.spell].name} for ${e.damage}!`
          : e.amount !== undefined
            ? `${heroName} casts ${HERO_SPELLS[e.spell].name} (+${e.amount}).`
            : `${heroName} casts ${HERO_SPELLS[e.spell].name}.`;
      case 'foe-in': {
        const next = battle.foes[e.index];
        const weak = next.species.kind === 'monster' ? ` Weak to ${ELEMENTS[next.species.weakTo].glyph} ${ELEMENTS[next.species.weakTo].name}.` : '';
        return `${rival?.name ?? 'The foe'} sends in ${next.species.name}!${weak}`;
      }
      case 'faint':
        return battle.winner ? `${battle.party[e.index].species.name} is worn out.` : `${battle.party[e.index].species.name} is worn out. Send in another!`;
    }
  };

  /** Events that belong to the foe's half of the turn. */
  const foeSide = (e: BattleEvent) => (e.kind === 'hit' && e.attacker === 'foe') || e.kind === 'miss' || e.kind === 'burn';

  const play = async (e: BattleEvent) => {
    log.textContent = describe(e);
    if (e.kind === 'hit') {
      const fromPet = e.attacker === 'pet';
      const attacker = fromPet ? petSpot : foeSpot;
      const target = fromPet ? foeSpot : petSpot;
      const elemental = e.element !== null;
      attacker.classList.add(elemental ? 'cast' : 'lunge');
      sound.play(elemental ? 'spell' : 'strike');
      // The blow lands as the lunge reaches its target: that is when health drops.
      await wait(IMPACT_MS);
      target.classList.add('hit');
      sound.play(e.crit ? 'crit' : e.effectiveness > 1 ? 'weakHit' : 'hit');
      floatText(target, `-${e.damage}`, e.effectiveness > 1 || e.crit ? 'big' : e.effectiveness < 1 ? 'small' : 'dmg');
      if (e.crit) floatText(target, 'Critical!', 'word');
      else if (e.effectiveness > 1) floatText(target, 'Strong!', 'word');
      applySnap(e);
      await wait(LUNGE_MS - IMPACT_MS);
      attacker.classList.remove('lunge', 'cast');
      await wait(120);
      target.classList.remove('hit');
    } else if (e.kind === 'miss') {
      foeSpot.classList.add('lunge');
      await wait(IMPACT_MS);
      petSpot.classList.add('dodging');
      sound.play('strike');
      floatText(petSpot, 'Miss', 'word');
      await wait(LUNGE_MS - IMPACT_MS);
      foeSpot.classList.remove('lunge');
      petSpot.classList.remove('dodging');
    } else if (e.kind === 'status') {
      const spot = e.target === 'pet' ? petSpot : foeSpot;
      spot.classList.add(e.target === 'pet' ? 'healed' : 'hit');
      sound.play(e.status === 'ward-break' ? 'crit' : 'spell');
      refreshStatus();
      await wait(420);
      spot.classList.remove('healed', 'hit');
    } else if (e.kind === 'burn' || e.kind === 'reflect') {
      foeSpot.classList.add('hit', 'burn');
      sound.play('hit');
      floatText(foeSpot, `-${e.damage}`, 'dmg');
      applySnap(e);
      await wait(420);
      foeSpot.classList.remove('hit', 'burn');
    } else if (e.kind === 'leech') {
      floatText(foeSpot, `+${e.amount}`, 'heal');
      applySnap(e);
      await wait(360);
    } else if (e.kind === 'spell') {
      if (e.damage) {
        foeSpot.classList.add('hit', 'burn');
        sound.play('crit');
        floatText(foeSpot, `-${e.damage}`, 'big');
      } else {
        petSpot.classList.add('healed');
        sound.play(e.amount ? 'reward' : 'spell');
        floatText(petSpot, e.amount ? `+${e.amount}` : HERO_SPELLS[e.spell].name, e.amount ? 'heal' : 'word');
      }
      applySnap(e);
      await wait(550);
      foeSpot.classList.remove('hit', 'burn');
      petSpot.classList.remove('healed');
    } else if (e.kind === 'heal') {
      petSpot.classList.add('healed');
      sound.play('reward');
      floatText(petSpot, `+${e.amount}`, 'heal');
      applySnap(e);
      await wait(480);
      petSpot.classList.remove('healed');
    } else if (e.kind === 'swap') {
      petSpot.classList.add('swap-out');
      sound.play('tap');
      await wait(200);
      shown.active = e.to;
      showPet();
      showHp();
      refreshStatus();
      petSpot.classList.remove('swap-out');
      await wait(240);
    } else if (e.kind === 'faint') {
      petSpot.classList.add('faint');
      await wait(450);
    } else if (e.kind === 'foe-in') {
      // The fallen Taken melts back into a Wildling's shape and slips away; the next steps up.
      log.textContent = `${foe.species.name} is freed from the ink!`;
      foeSpot.classList.add('dissolve');
      sound.play('victory');
      await wait(900);
      foe = battle.foes[e.index];
      foeEnc = line[e.index];
      showFoe();
      log.textContent = describe(e);
      sound.play('tap');
      applySnap(e);
      refreshStatus();
      await wait(500);
    }
  };

  const end = () => {
    intent.hidden = true;
    setTurn(null);
    if (battle.winner === 'pet') {
      foeSpot.classList.add('dissolve');
      sound.play('victory');
      finish(true);
      sheet.setTitle('Victory');
      if (practice) {
        log.textContent = 'The practice blot splatters. Ready for the real thing? Look for the ⚔ Fight button on the map.';
      } else {
        const reward = rival ? { xp: Math.round(victoryRewards(battle.foes).xp * GRADES[rival.grade].xp) } : victoryRewards(battle.foe);
        const shares = shareXp(battle, reward.xp);
        const grew: string[] = [];
        owned.forEach((p, i) => {
          if (grantPetXp(p, shares[i]) > 0) grew.push(`${getSpecies(p.speciesId).name} grew to level ${p.level}!`);
        });
        // A camp drops gear like an Elite, an Archbinder's like a tougher one.
        const loot = way?.findGear?.(rival ? { rank: 'elite', tier: rival.grade === 'arch' ? 2 : 1 } : { rank: battle.foe.rank, tier: battle.foe.tier }) ?? null;
        const freed = rival ? freeOne(ctx, rival) : null;
        if (loot) setTimeout(() => sound.play('equip'), 600);
        ctx.changed();
        log.replaceChildren(
          rival
            ? `${rival.name}'s ink runs dry and the Taken wake up as Wildlings again. ${freed ? `${freed} falls in beside you. ` : ''}`
            : `${foeName(encounter)} dissolves into a puddle of harmless ink. `,
          h('strong', {}, `+${reward.xp} XP`),
          owned.length > 1 ? ' to each Wildling that fought (half to the rest)' : '',
          '.',
          ...grew.map((g) => h('strong', { class: 'level-up' }, ` ${g}`)),
          loot ? h('strong', { class: 'gear-find' }, ` ${loot}`) : '',
        );
      }
    } else {
      sound.play('defeat');
      finish(false);
      sheet.setTitle('Driven back');
      log.textContent = practice
        ? 'Worn out, but it was only practice. Try leading with a Wildling that is strong against it.'
        : rival
          ? `Your party is worn out and retreats. ${rival.name} keeps camp until the day is out: rest, bring counters for each Taken and try again.`
          : 'Your party is worn out and retreats. Their wounds stay until they rest (about an hour to full) or drink a tonic. Bring Wildlings strong against it and try again.';
    }
    // Wounds stay, so this is the moment to patch the party up, picking who gets a tonic.
    const hurt = !practice && owned.some((p) => vigorNow(p) < 1);
    panel.replaceChildren(
      hurt ? healList(ctx, owned) : '',
      h('button', { class: 'btn btn-primary btn-continue', type: 'button', onclick: () => sheet.close() }, 'Continue'),
    );
    panel.classList.remove('cmd-waiting');
    fleeBtn.hidden = true;
  };

  const act = async (action: Action) => {
    if (busy) return;
    if (action.kind === 'tonic' && !way?.useTonic()) return;
    busy = true;
    all().forEach((b) => ((b as HTMLButtonElement).disabled = true));
    fleeBtn.disabled = true;
    // Every move that hits is timed: a second tap on the gold lands a crit.
    if (action.kind === 'attack' && battle.ready(action.slot) && battle.moves[action.slot].power > 0) {
      action = { ...action, quality: await timingSweep(attacks[action.slot], sweepBar, battle.critAt) };
    }
    panel.classList.add('cmd-waiting');
    await playAll(battle.turn(action));
  };

  /** Plays a batch of events, the banner following whoever is acting, then hands control back. */
  const playAll = async (events: BattleEvent[], side: 'pet' | 'foe' = 'pet') => {
    for (const e of events) {
      const next: 'pet' | 'foe' = foeSide(e) ? 'foe' : e.kind === 'faint' || e.kind === 'foe-in' ? side : 'pet';
      if (next !== side) {
        side = next;
        setTurn(side);
        await wait(TURN_PAUSE_MS);
      }
      await play(e);
    }
    busy = false;
    if (battle.winner) end();
    else refresh();
  };

  /** The hero's spell comes before the pet's move and takes no turn. */
  const cast = async (spell: HeroSpellId) => {
    if (busy || !battle.canCast(spell) || !way?.spendMana(spell)) return;
    busy = true;
    all().forEach((b) => ((b as HTMLButtonElement).disabled = true));
    for (const e of battle.castSpell(spell)) await play(e);
    busy = false;
    if (battle.winner) end();
    else refresh();
  };

  for (const { id, el } of spellBtns) el.addEventListener('click', () => cast(id));
  tonicBtn.addEventListener('click', () => act({ kind: 'tonic' }));
  refresh();
  // A foe faster than the lead strikes before the first move is chosen.
  const firstStrike = battle.open();
  if (firstStrike.length) {
    busy = true;
    all().forEach((b) => ((b as HTMLButtonElement).disabled = true));
    panel.classList.add('cmd-waiting');
    setTurn('foe');
    void wait(TURN_PAUSE_MS * 2).then(() => playAll(firstStrike, 'foe'));
  }
}

/**
 * After beating an Inkbinder, the last Taken freed may want to walk with you, if it is a Wildling
 * worth having and nobody is following you already. Returns its name when it falls in.
 */
function freeOne(ctx: GameContext, rival: Rival): string | null {
  const last = rival.line[rival.line.length - 1];
  const species = unbound(last.species.id);
  if (!species || ctx.collection.follower) return null;
  const wildling: Encounter = { species, level: Math.max(1, last.level - 2), seed: last.seed };
  if (!lineWanted(wildling, ctx.collection)) return null;
  if (!startFollowing(ctx.collection, `${rival.id}:freed`, wildling, ctx.wayfarer?.gear().catchBonus ?? 0)) return null;
  ctx.changed();
  return species.name;
}
