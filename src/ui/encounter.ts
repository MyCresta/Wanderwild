import { addPet, companion, grantPetXp, markSeen, MAX_SEALS } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { fleeChance, individualFromSeed, MAX_LEVEL, type Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { elementBadge, rarityBadge, SEAL_SVG } from './badges';
import { createBackdrop } from './catch/backdrop';
import { creatureOutline } from './catch/outline';
import {
  bindQuality,
  coveredPoints,
  creatureOffset,
  GILDED_QUALITY,
  gradeLevels,
  MIN_QUALITY,
  oddsColor,
  patienceSeconds,
  scoreSketch,
  sketchGrade,
  type Grade,
  type Vec,
} from './catch/sketch';
import type { GameContext } from './context';
import { h, toast, wait } from './dom';
import { sound } from '../audio/sound';

const CATCH_XP = 10;
const NEW_SPECIES_SEALS = 2;
const SEAL_PX = 64;
/** Lift your finger with this much of the outline traced and the sketch finishes itself. */
const AUTO_FINISH = 0.97;
const SVG = 'http://www.w3.org/2000/svg';

type State = 'watch' | 'sketch' | 'bind' | 'done';

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser allows it; it is only a nicety.
  }
};

/** Runs `fn(p)` for p from 0 to 1 over `ms`, one call per frame. */
function tween(ms: number, fn: (p: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      fn(p);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const pathOf = (points: readonly Vec[], closed: boolean) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + (closed ? 'Z' : '');

/**
 * The Sketching scene. A wild Wildling wanders until you ask it to pose; then you trace its
 * outline with a finger before its patience runs out. The truer the line, the better the odds,
 * and the finer the creature that steps off the page into your folio. No luck involved: a true
 * enough likeness always takes.
 */
export function openEncounter(ctx: GameContext, encounter: Encounter, onDone: (caught: boolean, fled: boolean) => void): void {
  const { species, level, seed } = encounter;
  const individual = individualFromSeed(seed, species.kind);
  const firstOfKind = !ctx.collection.pets.some((p) => p.speciesId === species.id);
  markSeen(ctx.collection, species.id);
  ctx.changed();

  const backdrop = createBackdrop(species.element, seed);
  const liveSvg = createCreatureSvg({ speciesId: species.id, seed, size: 240 });
  const poseSvg = createCreatureSvg({ speciesId: species.id, seed, size: 240, still: true });
  const creatureInner = h('div', { class: 'catch-creature-inner' }, liveSvg);
  const creatureEl = h('div', { class: 'catch-creature' }, h('div', { class: 'catch-platform' }), creatureInner);

  // The sketching layer sits over the creature, in its drawing units, with room to stray past the edges.
  const layer = document.createElementNS(SVG, 'svg');
  layer.setAttribute('viewBox', '-40 -40 280 280');
  layer.setAttribute('class', 'sketch-layer');
  const guide = document.createElementNS(SVG, 'path');
  guide.setAttribute('class', 'sketch-guide');
  const marks = document.createElementNS(SVG, 'g');
  marks.setAttribute('class', 'sketch-marks');
  const ink = document.createElementNS(SVG, 'g');
  ink.setAttribute('class', 'sketch-ink');
  layer.append(guide, marks, ink);

  const sealEl = h('div', { class: 'catch-seal', role: 'presentation', hidden: true });
  sealEl.innerHTML = SEAL_SVG;
  const fx = h('div', { class: 'catch-fx' });
  const field = h('div', { class: 'catch-field' }, creatureEl, layer, sealEl, fx);

  const sealCount = h('span', { class: 'catch-seals' });
  const runBtn = h('button', { class: 'catch-run', type: 'button', 'aria-label': 'Run away' }, 'Run');
  const top = h(
    'header',
    { class: 'catch-top' },
    h(
      'div',
      { class: 'catch-title' },
      h('strong', {}, `${individual.gilded ? '✦ Gilded ' : ''}${species.name}`),
      h('span', {}, `Lv ${level} `, elementBadge(species), ' ', rarityBadge(species), ' ', h('em', {}, individual.trait.name)),
    ),
    sealCount,
    runBtn,
  );
  const patienceFill = h('span', { class: 'sketch-patience-fill' });
  const patience = h('div', { class: 'sketch-patience', hidden: true, 'aria-hidden': 'true' }, patienceFill);
  const odds = h('span', { class: 'sketch-odds', hidden: true });
  const hint = h(
    'p',
    { class: 'catch-hint' },
    individual.gilded
      ? 'A Gilded Wildling! The gold only takes to a near-perfect line.'
      : 'Ask it to pose, then trace its outline with your finger. A truer line binds a finer creature.',
  );
  const actBtn = h('button', { class: 'btn btn-primary catch-throw', type: 'button' }, 'Sketch it');
  const bottom = h('footer', { class: 'catch-bottom' }, patience, h('div', { class: 'sketch-row' }, hint, odds), actBtn);
  const endMusic = sound.scene('wonder');
  const scene = h('div', { class: 'catch-scene', role: 'dialog', 'aria-modal': 'true', 'aria-label': `A wild ${species.name}` }, backdrop.svg, field, top, bottom);
  document.body.appendChild(scene);

  let state: State = 'watch';
  let finished = false;
  let running = true;
  let wariness = 0;
  let size = 200;
  let home: Vec = { x: 0, y: 0 };
  let creaturePos: Vec = { x: 0, y: 0 };
  let sealPos: Vec = { x: 0, y: 0 };
  let sealSpin = 0;
  let sealScale = 1;
  let posed = false;
  let poseEnds = 0;
  let poseLength = 1;
  let outline: Vec[] = [];
  let strokes: Vec[][] = [];
  let covered: boolean[] = [];
  let segments: SVGLineElement[] = [];
  const outlineReady = creatureOutline(poseSvg).then((points) => (outline = points));
  const phase = Math.random() * 6;
  const start = performance.now();
  const clock = () => (performance.now() - start) / 1000;

  const layout = () => {
    const r = field.getBoundingClientRect();
    size = Math.min(260, r.width * 0.72, r.height * 0.4);
    home = { x: r.width / 2, y: r.height * 0.44 };
    creatureEl.style.width = creatureEl.style.height = `${size}px`;
    for (const svg of [liveSvg, poseSvg]) {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
    }
    const layerSize = (size * 280) / 200;
    layer.style.width = layer.style.height = `${layerSize}px`;
    layer.style.left = `${home.x - layerSize / 2}px`;
    layer.style.top = `${home.y - layerSize / 2}px`;
  };
  layout();
  window.addEventListener('resize', layout);

  const updateSeals = () => {
    sealCount.innerHTML = `${SEAL_SVG}<span>${ctx.collection.seals}</span>`;
    const none = ctx.collection.seals <= 0;
    if (state === 'watch') {
      actBtn.disabled = none;
      if (none) hint.textContent = 'Out of seals. Walking earns one every 100 m.';
    }
  };
  updateSeals();

  const popup = (text: string, at: Vec, kind = '') => {
    const node = h('span', { class: `catch-popup ${kind}`, style: { left: `${at.x}px`, top: `${at.y}px` } }, text);
    fx.appendChild(node);
    setTimeout(() => node.remove(), 1200);
  };

  const burst = (at: Vec, color: string, count: number, spread: number, shape: 'dot' | 'star' = 'dot') => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const d = spread * (0.5 + Math.random() * 0.6);
      const node = h('span', { class: `catch-particle catch-particle-${shape}` });
      node.style.left = `${at.x}px`;
      node.style.top = `${at.y}px`;
      node.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`);
      node.style.setProperty('--dy', `${(Math.sin(a) * d).toFixed(1)}px`);
      if (shape === 'star') {
        node.textContent = '✦';
        node.style.color = color;
      } else node.style.background = color;
      fx.appendChild(node);
      setTimeout(() => node.remove(), 900);
    }
  };

  /** Pointer position in the creature's drawing units. */
  const toDrawing = (e: PointerEvent): Vec => {
    const r = layer.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 280 - 40, y: ((e.clientY - r.top) / r.height) * 280 - 40 };
  };

  const close = () => {
    if (!scene.isConnected) return;
    running = false;
    endMusic();
    state = 'done';
    window.removeEventListener('resize', layout);
    scene.classList.add('catch-out');
    setTimeout(() => scene.remove(), 250);
    if (!finished) {
      finished = true;
      onDone(false, false);
    }
  };
  runBtn.addEventListener('click', close);

  const coverage = () => (covered.length ? covered.filter(Boolean).length / covered.length : 0);

  // The frame loop: the creature's wander, the patience bar, the seal, and the backdrop.
  const loop = () => {
    if (!running) return;
    const t = clock();
    backdrop.tick(t);
    if (!posed) {
      const off = creatureOffset(t, phase, size / 220);
      creaturePos = { x: home.x + off.x, y: home.y + off.y };
    }
    creatureEl.style.transform = `translate(${(creaturePos.x - size / 2).toFixed(1)}px, ${(creaturePos.y - size / 2).toFixed(1)}px)`;
    if (state === 'sketch') {
      const left = Math.max(0, poseEnds - performance.now()) / poseLength;
      patienceFill.style.transform = `scaleX(${left.toFixed(3)})`;
      patience.classList.toggle('sketch-patience-low', left < 0.3);
      if (left <= 0) void finishSketch(true);
    }
    sealEl.style.transform = `translate(${(sealPos.x - SEAL_PX / 2).toFixed(1)}px, ${(sealPos.y - SEAL_PX / 2).toFixed(1)}px) scale(${sealScale.toFixed(3)}) rotate(${sealSpin.toFixed(1)}deg)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const setPosed = (on: boolean) => {
    posed = on;
    creatureInner.replaceChildren(on ? poseSvg : liveSvg);
    creatureInner.classList.toggle('catch-posed', on);
  };

  const clearSketch = () => {
    strokes = [];
    ink.replaceChildren();
    marks.replaceChildren();
    segments = [];
    covered = [];
    guide.classList.remove('sketch-guide-show', 'sketch-guide-faded');
    layer.classList.remove('sketch-active');
  };

  const backToWatch = () => {
    clearSketch();
    setPosed(false);
    sealEl.hidden = true;
    patience.hidden = true;
    odds.hidden = true;
    actBtn.textContent = 'Sketch it';
    state = 'watch';
    updateSeals();
  };

  const beginSketch = async () => {
    if (state !== 'watch' || ctx.collection.seals <= 0) return;
    ctx.collection.seals--;
    ctx.changed();
    state = 'bind';
    updateSeals();
    actBtn.disabled = true;
    sound.play('throw');
    vibrate(15);
    await outlineReady;
    if (!running) return;
    // It trots back to the middle of the page and holds still.
    const from = { ...creaturePos };
    posed = true;
    await tween(260, (p) => (creaturePos = { x: from.x + (home.x - from.x) * p, y: from.y + (home.y - from.y) * p }));
    setPosed(true);

    covered = outline.map(() => false);
    segments = outline.map((p, i) => {
      const q = outline[(i + 1) % outline.length];
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', p.x.toFixed(1));
      line.setAttribute('y1', p.y.toFixed(1));
      line.setAttribute('x2', q.x.toFixed(1));
      line.setAttribute('y2', q.y.toFixed(1));
      return line;
    });
    marks.replaceChildren(...segments);
    guide.setAttribute('d', pathOf(outline, true));
    guide.classList.add('sketch-guide-show');
    setTimeout(() => state === 'sketch' && guide.classList.add('sketch-guide-faded'), 1600);
    layer.classList.add('sketch-active');

    poseLength = patienceSeconds(species.rarity, wariness) * 1000;
    poseEnds = performance.now() + poseLength;
    patience.hidden = false;
    odds.hidden = false;
    updateOdds();
    hint.textContent = 'Trace around the outline. Lift and carry on if you need to.';
    actBtn.textContent = 'Finish sketch';
    actBtn.disabled = false;
    state = 'sketch';
  };

  const updateOdds = () => {
    const { quality } = scoreSketch(outline, strokes);
    const ready = quality >= bindQuality(species.rarity) && (!individual.gilded || quality >= GILDED_QUALITY);
    const traced = coverage();
    odds.textContent = !strokes.length ? 'Trace it' : traced < 0.9 ? `${Math.round(traced * 100)}% traced` : sketchGrade(quality);
    odds.style.background = strokes.length ? oddsColor(ready ? 0.4 + quality * 0.4 : quality * 0.3) : '';
  };

  // Drawing: each touch starts a stroke; the outline inks in where the line passes close.
  let drawing: { stroke: Vec[]; path: SVGPathElement; id: number } | null = null;
  let oddsFrame = 0;
  layer.addEventListener('pointerdown', (e) => {
    if (state !== 'sketch' || drawing) return;
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    const path = document.createElementNS(SVG, 'path');
    ink.appendChild(path);
    const p = toDrawing(e);
    drawing = { stroke: [p], path, id: e.pointerId };
    strokes.push(drawing.stroke);
    mark(p);
  });
  const mark = (p: Vec) => {
    if (!drawing) return;
    const last = drawing.stroke[drawing.stroke.length - 1];
    if (drawing.stroke.length > 1 && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
    if (p !== last) drawing.stroke.push(p);
    drawing.path.setAttribute('d', pathOf(drawing.stroke, false));
    const recent = drawing.stroke.slice(-2);
    coveredPoints(outline, [recent]).forEach((hit, i) => {
      if (hit && !covered[i]) {
        covered[i] = true;
        segments[i]?.classList.add('sketch-inked');
      }
    });
    if (!oddsFrame)
      oddsFrame = requestAnimationFrame(() => {
        oddsFrame = 0;
        updateOdds();
      });
  };
  layer.addEventListener('pointermove', (e) => {
    if (state !== 'sketch' || !drawing || e.pointerId !== drawing.id) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) mark(toDrawing(ev));
  });
  const lift = (e: PointerEvent) => {
    if (!drawing || e.pointerId !== drawing.id) return;
    drawing = null;
    if (state === 'sketch' && coverage() >= AUTO_FINISH) void finishSketch(false);
  };
  layer.addEventListener('pointerup', lift);
  layer.addEventListener('pointercancel', lift);

  const failSketch = async (message: string, center: Vec) => {
    popup(message, { x: center.x, y: center.y - size * 0.55 }, 'catch-popup-miss');
    sound.play('error');
    vibrate([40, 40, 40]);
    wariness++;
    layer.classList.add('sketch-smudge');
    await wait(700);
    layer.classList.remove('sketch-smudge');
    if (!running) return;
    if (Math.random() < fleeChance(species.rarity) + 0.05 * wariness) return flee(center);
    hint.textContent = wariness > 1 ? `${species.name} is getting restless and won't hold a pose as long.` : 'Try again with a steadier line.';
    backToWatch();
  };

  const finishSketch = async (outOfTime: boolean) => {
    if (state !== 'sketch') return;
    state = 'bind';
    drawing = null;
    actBtn.disabled = true;
    patience.hidden = true;
    guide.classList.add('sketch-guide-faded');
    const center = { ...creaturePos };
    if (!strokes.length) {
      setPosed(false);
      return failSketch('It wandered off its pose', center);
    }
    const { quality } = scoreSketch(outline, strokes);
    const grade = sketchGrade(quality);
    odds.hidden = true;
    if (outOfTime) popup('Time!', { x: center.x, y: center.y - size * 0.75 });
    if (quality < bindQuality(species.rarity)) return failSketch(quality < MIN_QUALITY ? 'Too rough to keep' : "The likeness didn't take", center);
    if (individual.gilded && quality < GILDED_QUALITY) return failSketch("The gold won't take", center);
    popup(`${grade}!`, { x: center.x, y: center.y - size * 0.55 }, 'catch-popup-grade');
    sound.play('discover');
    vibrate(30);
    // The traced line glows and the outline fills in.
    layer.classList.add('sketch-done');
    for (const s of segments) s.classList.add('sketch-inked');
    burst(center, '#f3d27a', 12, 70, 'star');
    await wait(650);
    if (!running) return;
    return bind(grade, center);
  };

  /** A wax seal is pressed onto the finished page, and the creature steps into your folio. */
  const bind = async (grade: Grade, center: Vec) => {
    sealEl.hidden = false;
    const to = { x: center.x + size * 0.38, y: center.y + size * 0.36 };
    await tween(320, (p) => {
      sealPos = to;
      sealScale = 2.2 - 1.2 * p * p;
      sealSpin = (1 - p) * -40;
    });
    vibrate([20, 40, 60]);
    sound.play('bind');
    burst(to, '#8e2b22', 10, 50);
    await wait(250);
    creatureInner.classList.add('catch-sucked');
    clearSketch();
    await wait(450);
    if (running) caught(grade);
  };

  const flee = (at: Vec) => {
    setPosed(false);
    creatureInner.classList.add('catch-flee');
    sound.play('flee');
    burst(at, '#2a1d3a', 18, 110);
    hint.textContent = `${species.name} shook off the ink and slipped back into the margins of the map.`;
    finished = true;
    onDone(false, true);
    actBtn.remove();
    patience.hidden = true;
    odds.hidden = true;
    sealEl.hidden = true;
    clearSketch();
    bottom.appendChild(h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, 'Back to the map'));
  };

  const caught = (grade: Grade) => {
    const bonus = gradeLevels(grade);
    const pet = addPet(ctx.collection, { ...encounter, level: Math.min(MAX_LEVEL, level + bonus) });
    pet.sketch = grade;
    finished = true;
    const helper = companion(ctx.collection);
    const helping = helper && helper.uid !== pet.uid ? helper : null;
    const helperLevels = helping ? grantPetXp(helping, CATCH_XP) : 0;
    if (firstOfKind) ctx.collection.seals = Math.min(MAX_SEALS, ctx.collection.seals + NEW_SPECIES_SEALS);
    ctx.changed();
    updateSeals();
    onDone(true, false);
    vibrate([20, 60, 20, 60, 80]);
    sealEl.classList.add('catch-seal-glow');
    sound.play('achievement');
    burst(sealPos, '#f3d27a', 24, 140, 'star');
    hint.textContent = '';
    actBtn.remove();

    const rewards = h('ul', { class: 'catch-rewards' });
    rewards.append(h('li', {}, `${grade} sketch${bonus ? `: steps off the page ${bonus} level${bonus > 1 ? 's' : ''} stronger` : ''}`));
    if (firstOfKind) rewards.append(h('li', {}, `New bestiary entry! +${NEW_SPECIES_SEALS} seals`));
    if (helping)
      rewards.append(h('li', {}, `${getSpecies(helping.speciesId).name} +${CATCH_XP} XP${helperLevels ? `, now level ${helping.level}!` : ''}`));
    const panel = h(
      'section',
      { class: 'catch-result' },
      h('h2', {}, 'Into the folio!'),
      createCreatureSvg({ speciesId: species.id, seed, size: 140 }),
      h('p', { class: 'catch-result-name' }, `${individual.gilded ? '✦ Gilded ' : ''}${species.name}`, h('small', {}, ` Lv ${pet.level} · ${individual.trait.name}`)),
      rewards,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, 'Wonderful'),
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
                  toast(`${species.name} now walks with you.`);
                  close();
                },
              },
              'Walk together',
            ),
      ),
    );
    setTimeout(() => scene.isConnected && scene.appendChild(panel), 700);
  };

  actBtn.addEventListener('click', () => {
    if (state === 'watch') void beginSketch();
    else if (state === 'sketch') void finishSketch(false);
  });
  creatureEl.addEventListener('click', () => state === 'watch' && void beginSketch());
}
