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
  type SpellId,
} from '../creatures/battle';
import { STRONG } from '../creatures/elements';
import { FOE_TRAITS, RANKS } from '../creatures/foes';
import { grantPetXp, markSeen, MAX_SEALS, partyPets } from '../creatures/collection';
import { ELEMENTS, getSpecies } from '../creatures/species';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from './context';
import { h, openSheet, wait } from './dom';
import { elementTag, wheelHelp } from './wheel';
import { sound } from '../audio/sound';

const RING_MS = 900;
const RING_FROM = 2.4;
const RING_TO = 0.55;

function hpBar(f: () => Fighter) {
  const name = h('span', { class: 'hp-name' });
  const fill = h('span', { class: 'hp-fill' });
  const text = h('span', { class: 'hp-text' });
  const bar = h('div', { class: 'hp' }, name, h('span', { class: 'hp-track' }, fill), text);
  const update = () => {
    const fighter = f();
    const pct = (fighter.hp / fighter.maxHp) * 100;
    name.textContent = `${fighter.species.name} · Lv ${fighter.level}`;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('hp-low', pct < 30);
    text.textContent = `${fighter.hp} / ${fighter.maxHp}`;
  };
  update();
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
 * The timing ring: a rune circle closes in on the foe and a tap as it meets the
 * inner ring lands a critical hit. Resolves with a quality from 0 to 1.
 */
function timingRing(host: HTMLElement, over: HTMLElement): Promise<number> {
  const outer = h('span', { class: 'rune-ring' });
  const target = h('span', { class: 'rune-target' });
  const layer = h('div', { class: 'rune-layer', role: 'button', 'aria-label': 'Tap when the rings meet' }, target, outer);
  // The layer covers the whole arena so a tap anywhere counts; the rings sit on the foe.
  const a = host.getBoundingClientRect();
  const b = over.getBoundingClientRect();
  layer.style.setProperty('--cx', `${b.left - a.left + b.width / 2}px`);
  layer.style.setProperty('--cy', `${b.top - a.top + b.height / 2}px`);
  host.appendChild(layer);
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    const scaleAt = (t: number) => RING_FROM + (RING_TO - RING_FROM) * Math.min(1, (t - start) / RING_MS);
    const finish = (quality: number) => {
      if (done) return;
      done = true;
      layer.classList.add(quality >= CRIT_QUALITY ? 'rune-perfect' : quality > 0.4 ? 'rune-good' : 'rune-miss');
      setTimeout(() => layer.remove(), 380);
      resolve(quality);
    };
    const onTap = (e: Event) => {
      e.preventDefault();
      // Distance from the inner ring, as a share of how far the outer ring travels.
      finish(Math.max(0, 1 - Math.abs(scaleAt(performance.now()) - 1) / 0.6));
    };
    layer.addEventListener('pointerdown', onTap);
    const frame = (t: number) => {
      if (done) return;
      outer.style.transform = `scale(${scaleAt(t)})`;
      if (t - start >= RING_MS) finish(0.2);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
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

  const foeSvg = createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 150, facing: -1 });
  const intent = h('div', { class: 'intent', 'aria-live': 'polite' });
  const foeSpot = h('div', { class: `fighter fighter-foe fighter-${foe.rank}` }, foeSvg, intent);
  const petSpot = h('div', { class: 'fighter fighter-pet' });
  const petStatus = h('div', { class: 'status-row' });
  const showPet = () => {
    const p = owned[battle.active];
    petSpot.classList.remove('faint');
    petSpot.replaceChildren(createCreatureSvg({ speciesId: p.speciesId, seed: p.seed, size: 150 }));
  };
  showPet();
  const foeHp = hpBar(() => battle.foe);
  const petHp = hpBar(() => battle.pet);
  const foeTags = h(
    'div',
    { class: 'status-row' },
    foe.rank !== 'normal' && h('span', { class: `rank-chip rank-${foe.rank}` }, foe.rank === 'elite' ? '♛ Elite' : '✦ Rare'),
    elementTag(foe.species.element),
    ...foe.traits.map((t) => h('span', { class: 'trait-chip', title: FOE_TRAITS[t].blurb }, `${FOE_TRAITS[t].glyph} ${FOE_TRAITS[t].name}`)),
  );
  const wardChip = foe.traits.includes('warded') ? foeTags.querySelectorAll('.trait-chip')[foe.traits.indexOf('warded')] : null;
  const arena = h(
    'div',
    { class: 'arena' },
    h('div', { class: 'arena-row' }, h('div', { class: 'arena-info' }, foeHp.bar, foeTags), foeSpot),
    h('div', { class: 'arena-row arena-row-pet' }, petSpot, h('div', { class: 'arena-info' }, petHp.bar, petStatus)),
  );
  const weakness = foe.species.kind === 'monster' ? foe.species.weakTo : null;
  const opening = [
    practice ? 'A training blot made of practice ink. No rewards, nothing lost.' : `${foe.species.epithet}.`,
    weakness ? ` Weak to ${ELEMENTS[weakness].glyph} ${ELEMENTS[weakness].name}.` : '',
    foe.traits.length ? ` ${foe.traits.map((t) => `${FOE_TRAITS[t].name}: ${FOE_TRAITS[t].blurb.toLowerCase()}`).join(' ')}` : '',
  ].join('');
  const log = h('p', { class: 'battle-log' }, opening);

  const attackBtn = (attack: Attack) => {
    const btn = h('button', { class: `btn attack attack-${attack}`, type: 'button' });
    btn.addEventListener('click', () => act({ kind: attack }));
    return btn;
  };
  const attacks: Record<Attack, HTMLButtonElement> = { strike: attackBtn('strike'), move: attackBtn('move'), art: attackBtn('art') };
  const attackRow = h('div', { class: 'attacks' }, attacks.strike, attacks.move, attacks.art);

  const bench = h('div', { class: 'party-bench', role: 'group', 'aria-label': 'Party' });
  const tonicBtn = h('button', { class: 'btn btn-small', type: 'button' });
  const spellBtns = (Object.keys(SPELLS) as SpellId[]).map((id) => ({ id, el: h('button', { class: 'btn btn-small btn-spell', type: 'button' }) }));
  const fleeBtn = h('button', { class: 'btn btn-small', type: 'button', onclick: () => sheet.close() }, practice ? 'Stop' : 'Flee');
  const extras = h('div', { class: 'battle-extras' }, tonicBtn, ...spellBtns.map((s) => s.el), fleeBtn);
  const help = wheelHelp(foe.species.element);
  sheet.body.append(arena, log, attackRow, bench, extras, help);

  let busy = false;
  const all = () => [...Object.values(attacks), fleeBtn, tonicBtn, ...spellBtns.map((s) => s.el), ...bench.querySelectorAll('button')];

  const refresh = () => {
    const pet = battle.pet;
    const element = pet.species.element;
    const cd = battle.cooldowns[battle.active];
    const forced = battle.mustSwap;
    const label = (attack: Attack, name: string, blurb: string, wait: number) => {
      const btn = attacks[attack];
      btn.replaceChildren(
        h('span', { class: 'attack-name' }, name),
        h('span', { class: 'attack-blurb' }, wait > 0 ? `Ready in ${wait}` : blurb),
        (attack !== 'strike' && wait === 0 && edgeTag(battle.edge(attack))) || '',
      );
      btn.disabled = busy || forced || wait > 0;
      btn.classList.toggle('attack-strong', wait === 0 && battle.edge(attack) > 1);
      btn.style.setProperty('--el', attack === 'strike' ? 'var(--leather)' : ELEMENTS[element].color);
    };
    label('strike', '⚔ Strike', 'Always ready', 0);
    label('move', `${ELEMENTS[element].glyph} ${pet.species.move}`, 'Big hit · time the rune', cd.move);
    label('art', `${ELEMENTS[element].glyph} ${ARTS[element].name}`, ARTS[element].blurb, cd.art);

    const next = battle.intent;
    const threat = next.big ? battle.threat(battle.active) : 1;
    intent.className = `intent${next.big ? ' intent-big' : ''}`;
    intent.replaceChildren(
      next.big ? `⚠ ${next.element ? ELEMENTS[next.element].glyph : ''} ${next.name}` : 'Next: Strike',
      threat > 1 ? h('small', {}, ' strong vs you!') : '',
    );
    intent.hidden = !!battle.winner;

    petStatus.replaceChildren(
      ...[
        elementTag(element),
        battle.guard && h('span', { class: 'trait-chip chip-good' }, `⛨ Guard ${battle.guard.turns}`),
        battle.dodge && h('span', { class: 'trait-chip chip-good' }, '❂ Dodge'),
        battle.focus && h('span', { class: 'trait-chip chip-good' }, '✦ Weak spot marked'),
      ].filter((n): n is HTMLSpanElement => !!n),
    );
    if (wardChip) wardChip.classList.toggle('chip-broken', !battle.wardUp);
    foeSpot.classList.toggle('burning', battle.burn > 0);

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
    bench.hidden = battle.party.length < 2;

    const tonics = way?.tonics() ?? 0;
    tonicBtn.replaceChildren(`Tonic ×${tonics}`);
    tonicBtn.disabled = busy || forced || !tonics || pet.hp >= pet.maxHp;
    tonicBtn.hidden = !way;
    const metres = way?.spellMetres() ?? 0;
    for (const { id, el } of spellBtns) {
      const spell = SPELLS[id];
      const ready = metres >= spell.metres;
      el.replaceChildren(
        id === 'fireball' ? `🔥 ${spell.name}` : `✚ ${spell.name}`,
        h('small', {}, ready ? (id === 'fireball' ? ` ${battle.fireball}` : ' ready') : ` ${Math.round(metres)}/${spell.metres} m`),
      );
      el.title = `${spell.blurb} Charged by walking ${spell.metres} m.`;
      el.disabled = busy || forced || !ready;
      el.hidden = !way;
    }
    fleeBtn.disabled = busy;
    foeHp.update();
    petHp.update();
  };

  const describe = (e: BattleEvent): string => {
    switch (e.kind) {
      case 'hit': {
        const who = e.attacker === 'pet' ? battle.pet.species.name : battle.foe.species.name;
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
        return `${battle.foe.species.name}'s ${e.name} whiffs past!`;
      case 'status':
        switch (e.status) {
          case 'guard':
            return `${battle.pet.species.name} raises ${e.name}.`;
          case 'dodge':
            return `${battle.pet.species.name} rides an ${e.name}, ready to dodge.`;
          case 'focus':
            return `${e.name}! The weak spot glows. Next attack is critical.`;
          case 'burn':
            return `${battle.foe.species.name} catches fire!`;
          case 'ward-break':
            return 'The ward shatters!';
        }
        return '';
      case 'burn':
        return `${battle.foe.species.name} burns for ${e.damage}.`;
      case 'reflect':
        return `Thorns throw ${e.damage} back!`;
      case 'leech':
        return `${battle.foe.species.name} drinks ${e.amount} health back.`;
      case 'swap':
        return `${battle.party[e.to].species.name}, you're up!`;
      case 'heal':
        return e.source === 'tonic'
          ? `A tonic restores ${e.amount} health.`
          : e.source === 'art'
            ? `${battle.pet.species.name} draws on a Wellspring (+${e.amount}).`
            : `Mending light washes over the party (+${e.amount}).`;
      case 'fireball':
        return `You hurl a Fireball for ${e.damage}!`;
      case 'faint':
        return battle.winner ? `${battle.party[e.index].species.name} is worn out.` : `${battle.party[e.index].species.name} is worn out. Send in another!`;
    }
  };

  const play = async (e: BattleEvent) => {
    log.textContent = describe(e);
    if (e.kind === 'hit') {
      const attacker = e.attacker === 'pet' ? petSpot : foeSpot;
      const target = e.attacker === 'pet' ? foeSpot : petSpot;
      const elemental = e.action !== 'strike';
      attacker.classList.add(elemental ? 'cast' : 'lunge');
      sound.play(elemental ? 'spell' : 'strike');
      await wait(200);
      target.classList.add('hit');
      sound.play(e.crit ? 'crit' : e.effectiveness > 1 ? 'weakHit' : 'hit');
      floatText(target, `-${e.damage}`, e.effectiveness > 1 || e.crit ? 'big' : e.effectiveness < 1 ? 'small' : 'dmg');
      if (e.effectiveness > 1) floatText(target, 'Strong!', 'word');
      refresh();
      await wait(340);
      attacker.classList.remove('lunge', 'cast');
      target.classList.remove('hit');
      await wait(120);
    } else if (e.kind === 'miss') {
      foeSpot.classList.add('lunge');
      petSpot.classList.add('dodging');
      sound.play('strike');
      floatText(petSpot, 'Miss', 'word');
      await wait(420);
      foeSpot.classList.remove('lunge');
      petSpot.classList.remove('dodging');
    } else if (e.kind === 'status') {
      const spot = e.target === 'pet' ? petSpot : foeSpot;
      spot.classList.add(e.target === 'pet' ? 'healed' : 'hit');
      sound.play(e.status === 'ward-break' ? 'crit' : 'spell');
      refresh();
      await wait(420);
      spot.classList.remove('healed', 'hit');
    } else if (e.kind === 'burn' || e.kind === 'reflect') {
      foeSpot.classList.add('hit', 'burn');
      sound.play('hit');
      floatText(foeSpot, `-${e.damage}`, 'dmg');
      refresh();
      await wait(420);
      foeSpot.classList.remove('hit', 'burn');
    } else if (e.kind === 'leech') {
      floatText(foeSpot, `+${e.amount}`, 'heal');
      refresh();
      await wait(360);
    } else if (e.kind === 'fireball') {
      foeSpot.classList.add('hit', 'burn');
      sound.play('crit');
      floatText(foeSpot, `-${e.damage}`, 'big');
      refresh();
      await wait(550);
      foeSpot.classList.remove('hit', 'burn');
    } else if (e.kind === 'heal') {
      petSpot.classList.add('healed');
      sound.play('reward');
      floatText(petSpot, `+${e.amount}`, 'heal');
      refresh();
      await wait(480);
      petSpot.classList.remove('healed');
    } else if (e.kind === 'swap') {
      petSpot.classList.add('swap-out');
      sound.play('tap');
      await wait(200);
      showPet();
      petSpot.classList.remove('swap-out');
      refresh();
      await wait(240);
    } else if (e.kind === 'faint') {
      petSpot.classList.add('faint');
      refresh();
      await wait(450);
    }
  };

  const end = () => {
    intent.hidden = true;
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
        ctx.collection.seals = Math.min(MAX_SEALS, ctx.collection.seals + reward.seals);
        ctx.changed();
        log.replaceChildren(
          `${encounter.species.name} dissolves into a puddle of harmless ink. `,
          h('strong', {}, `+${reward.xp} XP`),
          owned.length > 1 ? ' to each pet that fought (half to the rest)' : '',
          `, +${reward.seals} seal${reward.seals > 1 ? 's' : ''}.`,
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
    bench.hidden = true;
    extras.hidden = true;
    attackRow.replaceChildren(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Continue'));
  };

  const act = async (action: Action) => {
    if (busy) return;
    if (action.kind === 'tonic' && !way?.useTonic()) return;
    if (action.kind === 'spell' && !way?.spendSpell(SPELLS[action.spell].metres)) return;
    busy = true;
    all().forEach((b) => ((b as HTMLButtonElement).disabled = true));
    if (action.kind === 'move' && battle.ready('move')) action = { ...action, quality: await timingRing(arena, foeSpot) };
    for (const e of battle.turn(action)) await play(e);
    busy = false;
    if (battle.winner) end();
    else refresh();
  };

  for (const { id, el } of spellBtns) el.addEventListener('click', () => act({ kind: 'spell', spell: id }));
  tonicBtn.addEventListener('click', () => act({ kind: 'tonic' }));
  refresh();
}
