import {
  ARTS,
  Battle,
  CRIT_QUALITY,
  makeFighter,
  shareXp,
  SPELLS,
  victoryRewards,
  type Action,
  type Attack,
  type BattleEvent,
  type Fighter,
  type HpSnap,
  type SpellId,
} from '../creatures/battle';
import { STRONG } from '../creatures/elements';
import { FOE_TRAITS, RANKS } from '../creatures/foes';
import { grantPetXp, markSeen, partyPets } from '../creatures/collection';
import { ELEMENTS, getSpecies } from '../creatures/species';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from './context';
import { h, openSheet, wait } from './dom';
import { elementTag, wheelHelp } from './wheel';
import { sound } from '../audio/sound';

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

/** "Strong ×1.5", "Weak ×0.6" or nothing, for a button or a bench pet. */
function edgeTag(edge: number): HTMLElement | null {
  if (edge > 1) return h('span', { class: 'edge edge-strong' }, `Strong ×${STRONG}`);
  if (edge < 1) return h('span', { class: 'edge edge-weak' }, 'Weak ×0.6');
  return null;
}

/**
 * The timing tap, on the same button that was pressed: a needle sweeps across it and a
 * second tap as it crosses the gold mark lands a critical hit. Resolves with 0..1.
 */
function timingSweep(btn: HTMLButtonElement): Promise<number> {
  const needle = h('span', { class: 'sweep-needle' });
  const runner = h('span', { class: 'sweep-runner' }, needle);
  const track = h('span', { class: 'sweep-track', style: `--sweet: ${SWEET * 100}%` }, h('span', { class: 'sweep-zone' }), runner);
  const hint = h('span', { class: 'sweep-hint' }, 'Tap again on the gold!');
  btn.append(track, hint);
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
      btn.classList.add(quality >= CRIT_QUALITY ? 'sweep-perfect' : quality > 0.4 ? 'sweep-good' : 'sweep-miss');
      hint.textContent = quality >= CRIT_QUALITY ? 'Perfect!' : quality > 0.4 ? 'Good' : 'Missed the mark';
      setTimeout(() => {
        btn.classList.remove('sweeping', 'sweep-perfect', 'sweep-good', 'sweep-miss');
        track.remove();
        hint.remove();
      }, 420);
      resolve(quality);
    };
    const onTap = (e: Event) => {
      e.preventDefault();
      finish(Math.max(0, 1 - Math.abs(at(e.timeStamp) - SWEET) / SWEET_SPREAD));
    };
    btn.addEventListener('pointerdown', onTap);
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
}

/** A quick turn-based fight between the party and a Blotspawn. */
export function openBattle(ctx: GameContext, encounter: Encounter, onDone: (won: boolean) => void, opts: BattleOpts = {}): void {
  const owned = partyPets(ctx.collection);
  if (!owned.length) return;
  const practice = !!opts.practice;
  if (!practice) {
    markSeen(ctx.collection, encounter.species.id);
    ctx.changed();
  }

  const way = ctx.wayfarer;
  const battle = new Battle(
    owned.map((p) => makeFighter(getSpecies(p.speciesId), p.level, p.seed, p.uid)),
    makeFighter(encounter.species, encounter.level, encounter.seed, undefined, encounter),
    { wayfarerLevel: way?.level() ?? 1, petDamage: way?.gear().petDamage, petHealth: way?.gear().petHealth },
  );
  const foe = battle.foe;
  const rankName = foe.rank === 'normal' ? '' : `${RANKS[foe.rank].name} `;
  const sheet = openSheet(practice ? 'Practice bout' : `${rankName}${encounter.species.name} blocks the way`, {
    className: `sheet-battle battle-rank-${foe.rank}`,
  });
  let reported = false;
  const finish = (won: boolean) => {
    if (reported) return;
    reported = true;
    onDone(won);
  };
  const endMusic = sound.scene('battle');
  sheet.onClose(() => {
    endMusic();
    finish(false);
  });

  // What the screen shows, which trails the battle's own state until each blow is played out.
  const shown: HpSnap & { active: number } = { foe: foe.hp, party: battle.party.map((f) => f.hp), active: 0 };

  const foeSvg = createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 150, facing: -1 });
  const intent = h('div', { class: 'intent', 'aria-live': 'polite' });
  const foeSpot = h('div', { class: `fighter fighter-foe fighter-${foe.rank}` }, foeSvg, intent);
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
  const foeTags = h(
    'div',
    { class: 'status-row' },
    foe.rank !== 'normal' && h('span', { class: `rank-chip rank-${foe.rank}` }, foe.rank === 'elite' ? '♛ Elite' : '✦ Rare'),
    elementTag(foe.species.element),
    ...foe.traits.map((t) => h('span', { class: 'trait-chip', title: FOE_TRAITS[t].blurb }, `${FOE_TRAITS[t].glyph} ${FOE_TRAITS[t].name}`)),
  );
  const wardChip = foe.traits.includes('warded') ? foeTags.querySelectorAll('.trait-chip')[foe.traits.indexOf('warded')] : null;
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
    practice ? 'A training blot made of practice ink. No rewards, nothing lost.' : `${foe.species.epithet}.`,
    weakness ? ` Weak to ${ELEMENTS[weakness].glyph} ${ELEMENTS[weakness].name}.` : '',
    foe.traits.length ? ` ${foe.traits.map((t) => `${FOE_TRAITS[t].name}: ${FOE_TRAITS[t].blurb.toLowerCase()}`).join(' ')}` : '',
  ].join('');
  const log = h('p', { class: 'battle-log' }, opening);

  const cmd = (extra = '') => h('button', { class: `cmd ${extra}`, type: 'button' });
  const attacks: Record<Attack, HTMLButtonElement> = { strike: cmd('cmd-strike'), move: cmd('cmd-move'), art: cmd('cmd-art') };
  for (const attack of Object.keys(attacks) as Attack[]) attacks[attack].addEventListener('click', () => act({ kind: attack }));
  const tonicBtn = cmd('cmd-way');
  const spellBtns = (Object.keys(SPELLS) as SpellId[]).map((id) => ({ id, el: cmd('cmd-way') }));
  const fleeBtn = h('button', { class: 'btn btn-small btn-flee', type: 'button', onclick: () => sheet.close() }, practice ? 'Stop' : 'Flee');
  const bench = h('div', { class: 'party-bench', role: 'group', 'aria-label': 'Party' });

  const section = (title: string, ...children: HTMLElement[]) =>
    h('section', { class: 'cmd-section' }, h('h3', { class: 'cmd-title' }, title), ...children);
  const attackSection = section('Attacks', h('div', { class: 'cmd-grid' }, attacks.strike, attacks.move, attacks.art));
  const waySection = section('Wayfarer', h('div', { class: 'cmd-grid' }, tonicBtn, ...spellBtns.map((s) => s.el)));
  const partySection = section('Party · tap to swap', bench);
  waySection.hidden = !way;
  partySection.hidden = battle.party.length < 2;
  const panel = h('div', { class: 'cmd-panel' }, attackSection, waySection, partySection);
  const footer = h('div', { class: 'battle-footer' }, wheelHelp(foe.species.element), fleeBtn);
  sheet.body.append(arena, log, panel, footer);

  let busy = false;
  const all = () => [...Object.values(attacks), tonicBtn, ...spellBtns.map((s) => s.el), ...bench.querySelectorAll('button')];

  const setTurn = (side: 'pet' | 'foe' | null) => {
    arena.classList.toggle('turn-pet', side === 'pet');
    arena.classList.toggle('turn-foe', side === 'foe');
    panel.classList.toggle('cmd-waiting', side !== 'pet');
    turnBanner.hidden = !side;
    turnBanner.className = `turn-banner${side === 'foe' ? ' turn-banner-foe' : ''}`;
    turnBanner.textContent = side === 'foe' ? `${foe.species.name}'s turn` : battle.mustSwap ? 'Send in a pet' : 'Your turn';
  };

  const refreshStatus = () => {
    petStatus.replaceChildren(
      ...[
        elementTag(battle.party[shown.active].species.element),
        battle.guard && h('span', { class: 'trait-chip chip-good' }, `⛨ Guard ${battle.guard.turns}`),
        battle.dodge && h('span', { class: 'trait-chip chip-good' }, '❂ Dodge'),
        battle.focus && h('span', { class: 'trait-chip chip-good' }, '✦ Weak spot marked'),
      ].filter((n): n is HTMLSpanElement => !!n),
    );
    if (wardChip) wardChip.classList.toggle('chip-broken', !battle.wardUp);
    foeSpot.classList.toggle('burning', battle.burn > 0);
  };

  const refresh = () => {
    const pet = battle.pet;
    const element = pet.species.element;
    const cd = battle.cooldowns[battle.active];
    const forced = battle.mustSwap;
    const label = (attack: Attack, name: string, blurb: string, wait: number) => {
      const btn = attacks[attack];
      const edge = battle.edge(attack);
      card(btn, name, wait > 0 ? `Ready in ${wait}` : blurb, attack !== 'strike' && wait === 0 ? edgeTag(edge) : null);
      btn.disabled = busy || forced || wait > 0;
      btn.classList.toggle('cmd-strong', wait === 0 && edge > 1);
      btn.style.setProperty('--el', attack === 'strike' ? 'var(--leather)' : ELEMENTS[element].color);
    };
    label('strike', '⚔ Strike', 'Tap twice: time it for a crit', 0);
    label('move', `${ELEMENTS[element].glyph} ${pet.species.move}`, 'Big hit · tap twice to time it', cd.move);
    label('art', `${ELEMENTS[element].glyph} ${ARTS[element].name}`, ARTS[element].blurb, cd.art);

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
        const edge = battle.edge('move', f);
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
    card(tonicBtn, '⚗ Tonic', tonics ? `Heals half · ×${tonics}` : 'None · brew at Hearthstead');
    tonicBtn.disabled = busy || forced || !tonics || pet.hp >= pet.maxHp;
    const metres = way?.spellMetres() ?? 0;
    for (const { id, el } of spellBtns) {
      const spell = SPELLS[id];
      const ready = metres >= spell.metres;
      card(
        el,
        id === 'fireball' ? `🔥 ${spell.name}` : `✚ ${spell.name}`,
        ready ? (id === 'fireball' ? `${battle.fireball} damage · ready` : 'Heals party · ready') : `Walk ${Math.max(0, Math.round(spell.metres - metres))} m more`,
      );
      el.title = `${spell.blurb} Charged by walking ${spell.metres} m.`;
      el.disabled = busy || forced || !ready;
    }
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
          : e.source === 'art'
            ? `${battle.party[shown.active].species.name} draws on a Wellspring (+${e.amount}).`
            : `Mending light washes over the party (+${e.amount}).`;
      case 'fireball':
        return `You hurl a Fireball for ${e.damage}!`;
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
      const elemental = e.action !== 'strike';
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
    } else if (e.kind === 'fireball') {
      foeSpot.classList.add('hit', 'burn');
      sound.play('crit');
      floatText(foeSpot, `-${e.damage}`, 'big');
      applySnap(e);
      await wait(550);
      foeSpot.classList.remove('hit', 'burn');
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
        const reward = victoryRewards(battle.foe);
        const shares = shareXp(battle, reward.xp);
        const grew: string[] = [];
        owned.forEach((p, i) => {
          if (grantPetXp(p, shares[i]) > 0) grew.push(`${getSpecies(p.speciesId).name} grew to level ${p.level}!`);
        });
        ctx.changed();
        log.replaceChildren(
          `${encounter.species.name} dissolves into a puddle of harmless ink. `,
          h('strong', {}, `+${reward.xp} XP`),
          owned.length > 1 ? ' to each pet that fought (half to the rest)' : '',
          '.',
          ...grew.map((g) => h('strong', { class: 'level-up' }, ` ${g}`)),
        );
      }
    } else {
      sound.play('defeat');
      finish(false);
      sheet.setTitle('Driven back');
      log.textContent = practice
        ? 'Worn out, but it was only practice. Try leading with a pet that is strong against it.'
        : 'Your party is worn out and retreats to rest. Bring a pet strong against it, brew tonics and charge spells by walking, then try again.';
    }
    panel.replaceChildren(h('button', { class: 'btn btn-primary btn-continue', type: 'button', onclick: () => sheet.close() }, 'Continue'));
    panel.classList.remove('cmd-waiting');
    fleeBtn.hidden = true;
  };

  const act = async (action: Action) => {
    if (busy) return;
    if (action.kind === 'tonic' && !way?.useTonic()) return;
    if (action.kind === 'spell' && !way?.spendSpell(SPELLS[action.spell].metres)) return;
    busy = true;
    all().forEach((b) => ((b as HTMLButtonElement).disabled = true));
    fleeBtn.disabled = true;
    if ((action.kind === 'strike' || action.kind === 'move') && battle.ready(action.kind)) {
      action = { ...action, quality: await timingSweep(attacks[action.kind]) };
    }
    panel.classList.add('cmd-waiting');
    let foeTurn = false;
    for (const e of battle.turn(action)) {
      if (!foeTurn && foeSide(e)) {
        foeTurn = true;
        setTurn('foe');
        await wait(TURN_PAUSE_MS);
      }
      await play(e);
    }
    busy = false;
    if (battle.winner) end();
    else refresh();
  };

  for (const { id, el } of spellBtns) el.addEventListener('click', () => act({ kind: 'spell', spell: id }));
  tonicBtn.addEventListener('click', () => act({ kind: 'tonic' }));
  refresh();
}
