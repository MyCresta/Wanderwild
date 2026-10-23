import { Battle, makeFighter, victoryRewards, type Fighter, type Hit } from '../creatures/battle';
import { companion, grantPetXp, markSeen, MAX_SEALS } from '../creatures/collection';
import { ELEMENTS, getSpecies } from '../creatures/species';
import type { Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from './context';
import { h, openSheet, wait } from './dom';
import { sound } from '../audio/sound';

function hpBar(f: Fighter) {
  const fill = h('span', { class: 'hp-fill' });
  const text = h('span', { class: 'hp-text' });
  const bar = h('div', { class: 'hp' }, h('span', { class: 'hp-name' }, `${f.species.name} · Lv ${f.level}`), h('span', { class: 'hp-track' }, fill), text);
  const update = () => {
    const pct = (f.hp / f.maxHp) * 100;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('hp-low', pct < 30);
    text.textContent = `${f.hp} / ${f.maxHp}`;
  };
  update();
  return { bar, update };
}

function floatText(host: HTMLElement, text: string, kind: string) {
  const node = h('span', { class: `float-text float-${kind}` }, text);
  host.appendChild(node);
  setTimeout(() => node.remove(), 1100);
}

/** A turn-based fight between the companion and a Blotspawn. */
export function openBattle(ctx: GameContext, encounter: Encounter, onDone: (won: boolean) => void): void {
  const owned = companion(ctx.collection);
  if (!owned) return;
  markSeen(ctx.collection, encounter.species.id);
  ctx.changed();

  const petSpecies = getSpecies(owned.speciesId);
  const battle = new Battle(makeFighter(petSpecies, owned.level, owned.seed), makeFighter(encounter.species, encounter.level, encounter.seed));
  const sheet = openSheet(`${encounter.species.name} blocks the way`, { className: 'sheet-battle' });
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

  const foeSvg = createCreatureSvg({ speciesId: encounter.species.id, seed: encounter.seed, size: 170, facing: -1 });
  const petSvg = createCreatureSvg({ speciesId: owned.speciesId, seed: owned.seed, size: 170 });
  const foeSpot = h('div', { class: 'fighter fighter-foe' }, foeSvg);
  const petSpot = h('div', { class: 'fighter fighter-pet' }, petSvg);
  const foeHp = hpBar(battle.foe);
  const petHp = hpBar(battle.pet);
  const arena = h('div', { class: 'arena' }, h('div', { class: 'arena-row' }, foeHp.bar, foeSpot), h('div', { class: 'arena-row arena-row-pet' }, petSpot, petHp.bar));
  const foeSpecies = encounter.species;
  const hint = foeSpecies.kind === 'monster' ? ` Weak to ${ELEMENTS[foeSpecies.weakTo].name}.` : '';
  const log = h('p', { class: 'battle-log' }, `${foeSpecies.epithet}.${hint}`);

  const strikeBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Strike');
  const moveBtn = h('button', { class: 'btn btn-move', type: 'button' });
  const fleeBtn = h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Flee');
  const actions = h('div', { class: 'actions' }, strikeBtn, moveBtn, fleeBtn);
  sheet.body.append(arena, log, actions);

  const updateMove = () => {
    moveBtn.replaceChildren(
      `${ELEMENTS[petSpecies.element].glyph} ${petSpecies.move}`,
      battle.moveReady ? '' : h('small', {}, ` (${battle.charge})`),
    );
    moveBtn.disabled = !battle.moveReady;
  };
  updateMove();

  const describe = (hit: Hit) => {
    const who = hit.attacker === 'pet' ? battle.pet.species.name : battle.foe.species.name;
    let text = `${who} used ${hit.name}`;
    if (hit.effectiveness > 1) text += '. It hits the weak spot!';
    else if (hit.effectiveness < 1) text += '. It barely lands.';
    else text += '.';
    if (hit.crit) text += ' A critical blow!';
    return text;
  };

  const play = async (hit: Hit) => {
    const attacker = hit.attacker === 'pet' ? petSpot : foeSpot;
    const target = hit.attacker === 'pet' ? foeSpot : petSpot;
    log.textContent = describe(hit);
    attacker.classList.add(hit.action === 'move' ? 'cast' : 'lunge');
    sound.play(hit.action === 'move' ? 'spell' : 'strike');
    await wait(260);
    target.classList.add('hit');
    sound.play(hit.crit ? 'crit' : hit.effectiveness > 1 ? 'weakHit' : 'hit');
    floatText(target, `-${hit.damage}`, hit.effectiveness > 1 || hit.crit ? 'big' : 'dmg');
    foeHp.update();
    petHp.update();
    await wait(420);
    attacker.classList.remove('lunge', 'cast');
    target.classList.remove('hit');
    await wait(200);
  };

  const act = async (action: 'strike' | 'move') => {
    strikeBtn.disabled = moveBtn.disabled = fleeBtn.disabled = true;
    for (const hit of battle.turn(action)) await play(hit);
    if (!battle.winner) {
      strikeBtn.disabled = fleeBtn.disabled = false;
      updateMove();
      return;
    }
    if (battle.winner === 'pet') {
      foeSpot.classList.add('dissolve');
      sound.play('victory');
      const reward = victoryRewards(battle.foe);
      const levels = grantPetXp(owned, reward.xp);
      ctx.collection.seals = Math.min(MAX_SEALS, ctx.collection.seals + reward.seals);
      ctx.changed();
      finish(true);
      sheet.setTitle('Victory');
      log.replaceChildren(
        `${encounter.species.name} dissolves into a puddle of harmless ink. `,
        h('strong', {}, `+${reward.xp} XP`),
        `, +${reward.seals} seal${reward.seals > 1 ? 's' : ''}.`,
        levels > 0 ? h('strong', { class: 'level-up' }, ` ${petSpecies.name} grew to level ${owned.level}!`) : '',
      );
    } else {
      petSpot.classList.add('faint');
      sound.play('defeat');
      finish(false);
      sheet.setTitle('Driven back');
      log.textContent = `${petSpecies.name} is worn out and retreats to rest. Level up by walking and catching, then try again.`;
    }
    actions.replaceChildren(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Continue'));
  };

  strikeBtn.addEventListener('click', () => act('strike'));
  moveBtn.addEventListener('click', () => act('move'));
}
