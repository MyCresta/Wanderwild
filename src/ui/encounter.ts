import { addPet, grantPetXp, companion, markSeen } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { catchChance, fleeChance, individualFromSeed, type Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { elementBadge, rarityBadge, SEAL_SVG } from './badges';
import type { GameContext } from './context';
import { h, openSheet, toast, wait } from './dom';
import { sound } from '../audio/sound';

const TARGET_R = 34;
const CATCH_XP = 10;

/** How tight the shrinking ring is when the seal is cast: 1 is a perfect cast. */
export function ringQuality(r: number): number {
  return Math.max(0, Math.min(1, 1 - Math.abs(r - TARGET_R) / 60));
}

const ringRadius = (t: number) => 62 + 38 * Math.cos(t * 2.4);

function qualityWord(q: number): string {
  if (q > 0.85) return 'Masterful cast!';
  if (q > 0.6) return 'Good cast.';
  return 'A loose cast…';
}

/** The catch screen for a wild Wildling. Resolves true when it was bound. */
export function openEncounter(ctx: GameContext, encounter: Encounter, onDone: (caught: boolean, fled: boolean) => void): void {
  const { species, level, seed } = encounter;
  const individual = individualFromSeed(seed, species.kind);
  markSeen(ctx.collection, species.id);
  ctx.changed();

  const sheet = openSheet(`A wild ${species.name}`, { className: 'sheet-encounter' });
  let finished = false;
  let caught = false;
  let fled = false;
  const endMusic = sound.scene('wonder');
  sheet.onClose(() => {
    running = false;
    endMusic();
    if (!finished) onDone(caught, fled);
  });

  const creature = createCreatureSvg({ speciesId: species.id, seed, size: 220 });
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 200 200');
  ring.setAttribute('class', 'bind-ring');
  ring.innerHTML = `<circle cx="100" cy="112" r="${TARGET_R}" class="bind-target"/><circle cx="100" cy="112" r="80" class="bind-closing"/>`;
  const closing = ring.lastElementChild as SVGCircleElement;
  const seal = h('div', { class: 'seal-throw' });
  seal.innerHTML = SEAL_SVG;
  const stage = h('div', { class: 'stage' }, creature, ring, seal);

  const info = h(
    'p',
    { class: 'encounter-info' },
    h('strong', {}, `Lv ${level}`),
    ' ',
    elementBadge(species),
    ' ',
    rarityBadge(species),
    individual.gilded && h('span', { class: 'badge badge-gilded' }, '✦ Gilded'),
    ' ',
    h('em', {}, individual.trait.name),
  );
  const message = h('p', { class: 'encounter-message' }, 'Cast a binding seal when the golden ring closes on the inner circle.');
  const castBtn = h('button', { class: 'btn btn-primary', type: 'button' });
  const leaveBtn = h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Walk away');
  const actions = h('div', { class: 'actions' }, castBtn, leaveBtn);
  sheet.body.append(h('p', { class: 'epithet' }, species.epithet), info, stage, message, actions);

  const updateCast = () => {
    castBtn.innerHTML = `${SEAL_SVG}<span>Cast seal (${ctx.collection.seals})</span>`;
    castBtn.disabled = ctx.collection.seals <= 0;
    if (ctx.collection.seals <= 0) message.textContent = 'Out of seals. Walking earns one every 100 m.';
  };
  updateCast();

  let running = true;
  let frozen = false;
  let r = 80;
  const start = performance.now();
  const animate = (now: number) => {
    if (!running) return;
    if (!frozen) {
      r = ringRadius((now - start) / 1000);
      closing.setAttribute('r', r.toFixed(1));
      closing.classList.toggle('bind-good', ringQuality(r) > 0.85);
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  castBtn.addEventListener('click', async () => {
    if (frozen || ctx.collection.seals <= 0) return;
    frozen = true;
    castBtn.disabled = leaveBtn.disabled = true;
    const quality = ringQuality(r);
    ctx.collection.seals--;
    ctx.changed();
    updateCast();
    castBtn.disabled = true;
    message.textContent = qualityWord(quality);

    seal.classList.add('seal-fly');
    sound.play('throw');
    await wait(550);
    creature.classList.add('creature-bound');
    seal.classList.add('seal-landed');
    for (let i = 0; i < 3; i++) {
      seal.classList.remove('seal-wobble');
      void seal.offsetWidth;
      seal.classList.add('seal-wobble');
      sound.play('wobble');
      message.textContent = '.'.repeat(i + 1);
      await wait(650);
    }

    if (Math.random() < catchChance(species.rarity, level, quality)) {
      const pet = addPet(ctx.collection, encounter);
      caught = true;
      const helper = companion(ctx.collection);
      if (helper && helper.uid !== pet.uid && grantPetXp(helper, CATCH_XP) > 0)
        toast(`${getSpecies(helper.speciesId).name} grew to level ${helper.level}!`);
      ctx.changed();
      seal.classList.add('seal-glow');
      sound.play('bind');
      stage.classList.add('stage-success');
      message.textContent = `Bound! ${species.name} joins your bestiary.`;
      finished = true;
      onDone(true, false);
      actions.replaceChildren(
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Wonderful'),
        ctx.collection.companionUid === pet.uid
          ? ''
          : h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                ctx.collection.companionUid = pet.uid;
                ctx.changed();
                sheet.close();
              },
            },
            'Walk together',
          ),
      );
      return;
    }

    seal.classList.remove('seal-fly', 'seal-landed', 'seal-wobble');
    creature.classList.remove('creature-bound');
    if (Math.random() < fleeChance(species.rarity)) {
      fled = true;
      creature.classList.add('creature-flee');
      sound.play('flee');
      message.textContent = `The seal cracked and ${species.name} slipped back into the margins.`;
      finished = true;
      onDone(false, true);
      actions.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Oh well'));
      return;
    }
    sound.play('breakFree');
    message.textContent = `${species.name} broke free! Try again.`;
    frozen = false;
    leaveBtn.disabled = false;
    updateCast();
  });
}
