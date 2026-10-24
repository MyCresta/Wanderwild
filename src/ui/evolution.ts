import type { OwnedPet } from '../creatures/collection';
import { evolve, evolutionStatus } from '../creatures/evolution';
import { getSpecies } from '../creatures/species';
import { individualFromSeed, statsAt } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { createBackdrop } from './catch/backdrop';
import type { GameContext } from './context';
import { h, wait } from './dom';
import { sound } from '../audio/sound';

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Optional nicety.
  }
};

/** Light rays fanning out behind the creature. */
function rays(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('class', 'evo-rays');
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = a + Math.PI / 24;
    d += `M0 0L${(Math.cos(a) * 100).toFixed(1)} ${(Math.sin(a) * 100).toFixed(1)}L${(Math.cos(b) * 100).toFixed(1)} ${(Math.sin(b) * 100).toFixed(1)}Z`;
  }
  svg.innerHTML = `<path d="${d}" fill="#fff6d6"/>`;
  return svg;
}

/** Plays the evolution of a ready pet and applies it. */
export function openEvolution(ctx: GameContext, pet: OwnedPet, onDone?: () => void): void {
  const status = evolutionStatus(pet);
  if (!status?.ready) return;
  const from = getSpecies(pet.speciesId);
  const into = status.into;
  const trait = individualFromSeed(pet.seed, 'pet').trait;
  const before = statsAt(from.base, pet.level, trait);
  const after = statsAt(into.base, pet.level, trait);

  const backdrop = createBackdrop(into.element, pet.seed);
  const oldSvg = createCreatureSvg({ speciesId: from.id, seed: pet.seed, size: 240 });
  const newSvg = createCreatureSvg({ speciesId: into.id, seed: pet.seed, size: 240 });
  const oldForm = h('div', { class: 'evo-form evo-old' }, oldSvg);
  const newForm = h('div', { class: 'evo-form evo-new' }, newSvg);
  const stage = h('div', { class: 'evo-stage' }, rays(), oldForm, newForm);
  const caption = h('p', { class: 'evo-caption' }, `The ink around ${from.name} begins to stir…`);
  const flash = h('div', { class: 'evo-flash' });
  const scene = h('div', { class: 'catch-scene evo-scene', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${from.name} is evolving` }, backdrop.svg, stage, caption, flash);
  document.body.appendChild(scene);

  const endMusic = sound.scene('wonder');
  let running = true;
  const start = performance.now();
  const loop = (now: number) => {
    if (!running) return;
    backdrop.tick((now - start) / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const close = () => {
    running = false;
    endMusic();
    scene.classList.add('catch-out');
    setTimeout(() => scene.remove(), 250);
    onDone?.();
  };

  void (async () => {
    scene.classList.add('evo-charging');
    sound.play('discover');
    vibrate(30);
    await wait(1300);
    // Flicker between the two forms, faster and faster, as glowing silhouettes.
    scene.classList.add('evo-morphing');
    let gap = 420;
    let showNew = false;
    while (gap > 50) {
      showNew = !showNew;
      oldForm.classList.toggle('evo-hidden', showNew);
      newForm.classList.toggle('evo-hidden', !showNew);
      vibrate(8);
      sound.play('tap');
      await wait(gap);
      gap *= 0.8;
    }
    flash.classList.add('evo-flash-on');
    vibrate([40, 40, 120]);
    sound.play('achievement');
    await wait(350);
    evolve(ctx.collection, pet);
    ctx.changed();
    scene.classList.remove('evo-charging', 'evo-morphing');
    oldForm.classList.add('evo-hidden');
    newForm.classList.remove('evo-hidden');
    scene.classList.add('evo-done');
    flash.classList.remove('evo-flash-on');
    caption.textContent = `${from.name} evolved into ${into.name}!`;

    const row = (label: string, a: number, b: number) =>
      h('div', {}, h('dt', {}, label), h('dd', {}, `${a} → `, h('strong', {}, String(b)), h('small', {}, ` (+${b - a})`)));
    scene.appendChild(
      h(
        'section',
        { class: 'catch-result' },
        h('h2', {}, into.name),
        h('p', { class: 'epithet' }, into.epithet),
        h('p', { class: 'lore' }, into.lore),
        h('dl', { class: 'stats evo-stats' }, row('Vigour', before.hp, after.hp), row('Might', before.atk, after.atk), row('Guard', before.def, after.def)),
        h('p', {}, `New move: `, h('strong', {}, into.move)),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, 'Wonderful')),
      ),
    );
  })();
}
