import {
  Battle,
  CRIT_QUALITY,
  fireballDamage,
  makeFighter,
  shareXp,
  SPELLS,
  victoryRewards,
  type Action,
  type BattleEvent,
  type Fighter,
  type SpellId,
} from '../creatures/battle';
import { grantPetXp, markSeen, MAX_SEALS, partyPets } from '../creatures/collection';
import { ELEMENTS, getSpecies } from '../creatures/species';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from './context';
import { h, openSheet, wait } from './dom';

const RING_MS = 1100;
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

/** A turn-based fight between the party and a Blotspawn. */
export function openBattle(ctx: GameContext, encounter: Encounter, onDone: (won: boolean) => void): void {
  const owned = partyPets(ctx.collection);
  if (!owned.length) return;
  markSeen(ctx.collection, encounter.species.id);
  ctx.changed();

  const way = ctx.wayfarer;
  const battle = new Battle(
    owned.map((p) => makeFighter(getSpecies(p.speciesId), p.level, p.seed, p.uid)),
    makeFighter(encounter.species, encounter.level, encounter.seed),
    { wayfarerLevel: way?.level() ?? 1 },
  );
  const sheet = openSheet(`${encounter.species.name} blocks the way`, { className: 'sheet-battle' });
  let reported = false;
  const finish = (won: boolean) => {
    if (reported) return;
    reported = true;
    onDone(won);
  };
  sheet.onClose(() => finish(false));

  const foeSvg = createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 170, facing: -1 });
  const foeSpot = h('div', { class: 'fighter fighter-foe' }, foeSvg);
  const petSpot = h('div', { class: 'fighter fighter-pet' });
  const showPet = () => {
    const p = owned[battle.active];
    petSpot.classList.remove('faint');
    petSpot.replaceChildren(createCreatureSvg({ speciesId: p.speciesId, seed: p.seed, size: 170 }));
  };
  showPet();
  const foeHp = hpBar(() => battle.foe);
  const petHp = hpBar(() => battle.pet);
  const arena = h(
    'div',
    { class: 'arena' },
    h('div', { class: 'arena-row' }, foeHp.bar, foeSpot),
    h('div', { class: 'arena-row arena-row-pet' }, petSpot, petHp.bar),
  );
  const foeSpecies = encounter.species;
  const hint = foeSpecies.kind === 'monster' ? ` Weak to ${ELEMENTS[foeSpecies.weakTo].glyph} ${ELEMENTS[foeSpecies.weakTo].name}.` : '';
  const log = h('p', { class: 'battle-log' }, `${foeSpecies.epithet}.${hint} Tap the rune as the rings meet for a critical hit.`);

  const strikeBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Strike');
  const moveBtn = h('button', { class: 'btn btn-move', type: 'button' });
  const fleeBtn = h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Flee');
  const actions = h('div', { class: 'actions' }, strikeBtn, moveBtn, fleeBtn);

  const bench = h('div', { class: 'party-bench', role: 'group', 'aria-label': 'Party' });
  const tonicBtn = h('button', { class: 'btn btn-small', type: 'button' });
  const spellBtns = (Object.keys(SPELLS) as SpellId[]).map((id) => ({ id, el: h('button', { class: 'btn btn-small btn-spell', type: 'button' }) }));
  const extras = h('div', { class: 'battle-extras' }, tonicBtn, ...spellBtns.map((s) => s.el));
  sheet.body.append(arena, log, actions, bench, extras);

  let busy = false;
  const all = () => [strikeBtn, moveBtn, fleeBtn, tonicBtn, ...spellBtns.map((s) => s.el), ...bench.querySelectorAll('button')];

  const refresh = () => {
    const pet = battle.pet;
    const species = pet.species;
    moveBtn.replaceChildren(`${ELEMENTS[species.element].glyph} ${species.move}`, battle.moveReady ? '' : h('small', {}, ` (${battle.charge})`));
    const forced = battle.mustSwap;
    strikeBtn.disabled = busy || forced;
    moveBtn.disabled = busy || forced || !battle.moveReady;
    fleeBtn.disabled = busy;

    bench.replaceChildren(
      ...battle.party.map((f, i) => {
        const p = owned[i];
        const btn = h(
          'button',
          {
            class: `bench-pet${i === battle.active ? ' bench-active' : ''}${f.hp <= 0 ? ' bench-down' : ''}`,
            type: 'button',
            'aria-label': `${f.species.name}, ${f.hp} of ${f.maxHp} health${i === battle.active ? ', fighting' : ''}`,
            onclick: () => act({ kind: 'swap', to: i }),
          },
          createCreatureSvg({ speciesId: p.speciesId, seed: p.seed, size: 44 }),
          h('span', { class: 'bench-hp' }, h('span', { style: { width: `${(100 * f.hp) / f.maxHp}%` } })),
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
        h('small', {}, ready ? (id === 'fireball' ? ` ${fireballDamage(way?.level() ?? 1)}` : ' ready') : ` ${Math.round(metres)}/${spell.metres} m`),
      );
      el.title = `${spell.blurb} Charged by walking ${spell.metres} m.`;
      el.disabled = busy || forced || !ready;
      el.hidden = !way;
    }
    foeHp.update();
    petHp.update();
  };

  const describe = (e: BattleEvent): string => {
    switch (e.kind) {
      case 'hit': {
        const who = e.attacker === 'pet' ? battle.pet.species.name : battle.foe.species.name;
        let text = `${who} used ${e.name}`;
        if (e.effectiveness > 1) text += '. It hits the weak spot!';
        else if (e.effectiveness < 1) text += '. It barely lands.';
        else text += '.';
        if (e.crit) text += e.attacker === 'pet' ? ' Perfect timing, a critical blow!' : ' A critical blow!';
        return text;
      }
      case 'swap':
        return `${battle.party[e.to].species.name}, you're up!`;
      case 'heal':
        return e.source === 'tonic' ? `A tonic restores ${e.amount} health.` : `Mending light washes over the party (+${e.amount}).`;
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
      attacker.classList.add(e.action === 'move' ? 'cast' : 'lunge');
      await wait(260);
      target.classList.add('hit');
      floatText(target, `-${e.damage}`, e.effectiveness > 1 || e.crit ? 'big' : 'dmg');
      refresh();
      await wait(420);
      attacker.classList.remove('lunge', 'cast');
      target.classList.remove('hit');
      await wait(200);
    } else if (e.kind === 'fireball') {
      foeSpot.classList.add('hit', 'burn');
      floatText(foeSpot, `-${e.damage}`, 'big');
      refresh();
      await wait(650);
      foeSpot.classList.remove('hit', 'burn');
    } else if (e.kind === 'heal') {
      petSpot.classList.add('healed');
      floatText(petSpot, `+${e.amount}`, 'heal');
      refresh();
      await wait(600);
      petSpot.classList.remove('healed');
    } else if (e.kind === 'swap') {
      petSpot.classList.add('swap-out');
      await wait(220);
      showPet();
      petSpot.classList.remove('swap-out');
      refresh();
      await wait(300);
    } else if (e.kind === 'faint') {
      petSpot.classList.add('faint');
      refresh();
      await wait(500);
    }
  };

  const end = () => {
    if (battle.winner === 'pet') {
      foeSpot.classList.add('dissolve');
      const reward = victoryRewards(battle.foe);
      const shares = shareXp(battle, reward.xp);
      const grew: string[] = [];
      owned.forEach((p, i) => {
        if (grantPetXp(p, shares[i]) > 0) grew.push(`${getSpecies(p.speciesId).name} grew to level ${p.level}!`);
      });
      ctx.collection.seals = Math.min(MAX_SEALS, ctx.collection.seals + reward.seals);
      ctx.changed();
      finish(true);
      sheet.setTitle('Victory');
      log.replaceChildren(
        `${encounter.species.name} dissolves into a puddle of harmless ink. `,
        h('strong', {}, `+${reward.xp} XP`),
        owned.length > 1 ? ' to each pet that fought (half to the rest)' : '',
        `, +${reward.seals} seal${reward.seals > 1 ? 's' : ''}.`,
        ...grew.map((g) => h('strong', { class: 'level-up' }, ` ${g}`)),
      );
    } else {
      finish(false);
      sheet.setTitle('Driven back');
      log.textContent = 'Your party is worn out and retreats to rest. Level up, brew tonics and charge spells by walking, then try again.';
    }
    bench.hidden = true;
    extras.hidden = true;
    actions.replaceChildren(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Continue'));
  };

  const act = async (action: Action) => {
    if (busy) return;
    if (action.kind === 'tonic' && !way?.useTonic()) return;
    if (action.kind === 'spell' && !way?.spendSpell(SPELLS[action.spell].metres)) return;
    busy = true;
    all().forEach((b) => ((b as HTMLButtonElement).disabled = true));
    if (action.kind === 'strike' || action.kind === 'move') action = { ...action, quality: await timingRing(arena, foeSpot) };
    for (const e of battle.turn(action)) await play(e);
    busy = false;
    if (battle.winner) end();
    else refresh();
  };

  strikeBtn.addEventListener('click', () => act({ kind: 'strike' }));
  moveBtn.addEventListener('click', () => act({ kind: 'move' }));
  tonicBtn.addEventListener('click', () => act({ kind: 'tonic' }));
  for (const { id, el } of spellBtns) el.addEventListener('click', () => act({ kind: 'spell', spell: id }));
  refresh();
}
