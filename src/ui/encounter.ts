import { addPet, companion, grantPetXp, markSeen, MAX_SEALS } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { catchChance, fleeChance, individualFromSeed, type Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { elementBadge, rarityBadge, SEAL_SVG } from './badges';
import { createBackdrop } from './catch/backdrop';
import {
  creatureOffset,
  dodgeChance,
  flickVelocity,
  flightPose,
  FLIGHT_S,
  isHit,
  landingPoint,
  MIN_THROW_SPEED,
  oddsColor,
  PRESS_AT,
  PRESS_WINDOW,
  pressInWindow,
  ringQuality,
  ringScale,
  speedFor,
  throwGrade,
  WOBBLE_S,
  WOBBLES,
  wobbleOdds,
  type Vec,
} from './catch/physics';
import type { GameContext } from './context';
import { h, toast, wait } from './dom';

const CATCH_XP = 10;
const NEW_SPECIES_SEALS = 2;
const SEAL_PX = 64;

type State = 'aim' | 'drag' | 'flight' | 'capture' | 'done';

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

/**
 * The catch scene: flick a binding seal at a wild Wildling as it wanders and dodges, then
 * hold the seal shut with well-timed taps while it wobbles.
 */
export function openEncounter(ctx: GameContext, encounter: Encounter, onDone: (caught: boolean, fled: boolean) => void): void {
  const { species, level, seed } = encounter;
  const individual = individualFromSeed(seed, species.kind);
  const firstOfKind = !ctx.collection.pets.some((p) => p.speciesId === species.id);
  markSeen(ctx.collection, species.id);
  ctx.changed();

  const backdrop = createBackdrop(species.element, seed);
  const creatureSvg = createCreatureSvg({ speciesId: species.id, seed, size: 240 });
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 200 200');
  ring.setAttribute('class', 'catch-ring');
  ring.innerHTML = '<circle cx="100" cy="108" r="78" class="catch-ring-outer"/><circle cx="100" cy="108" r="78" class="catch-ring-closing"/>';
  const closing = ring.lastElementChild as SVGCircleElement;
  const creatureInner = h('div', { class: 'catch-creature-inner' }, creatureSvg);
  const creatureEl = h('div', { class: 'catch-creature' }, h('div', { class: 'catch-platform' }), creatureInner, ring);

  const sealEl = h('div', { class: 'catch-seal', role: 'presentation' });
  sealEl.innerHTML = SEAL_SVG;
  const pressRing = h('div', { class: 'catch-press', hidden: true });
  const fx = h('div', { class: 'catch-fx' });
  const field = h('div', { class: 'catch-field' }, creatureEl, pressRing, sealEl, fx);

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
  const hint = h('p', { class: 'catch-hint' }, 'Flick the seal up at the creature when the ring is small. Its colour shows your odds.');
  const throwBtn = h('button', { class: 'btn catch-throw', type: 'button' }, 'Throw straight');
  const bottom = h('footer', { class: 'catch-bottom' }, hint, throwBtn);
  const scene = h('div', { class: 'catch-scene', role: 'dialog', 'aria-modal': 'true', 'aria-label': `A wild ${species.name}` }, backdrop.svg, field, top, bottom);
  document.body.appendChild(scene);

  let state: State = 'aim';
  let finished = false;
  let running = true;
  let wariness = 0;
  let size = 200;
  let home: Vec = { x: 0, y: 0 };
  let sealHome: Vec = { x: 0, y: 0 };
  let maxReach = 500;
  let creaturePos: Vec = { x: 0, y: 0 };
  let sealPos: Vec = { x: 0, y: 0 };
  let sealScale = 1;
  let sealSpin = 0;
  let dodge: { at: number; dir: 1 | -1 } | null = null;
  let frozen = false;
  let ringNow = 1;
  let flight: { from: Vec; to: Vec; at: number } | null = null;
  const phase = Math.random() * 6;
  const start = performance.now();
  const clock = () => (performance.now() - start) / 1000;

  const layout = () => {
    const r = field.getBoundingClientRect();
    size = Math.min(240, r.width * 0.6, r.height * 0.32);
    home = { x: r.width / 2, y: r.height * 0.43 };
    sealHome = { x: r.width / 2, y: r.height - 190 };
    maxReach = r.height * 0.55;
    creatureEl.style.width = creatureEl.style.height = `${size}px`;
    creatureSvg.setAttribute('width', String(size));
    creatureSvg.setAttribute('height', String(size));
    if (state === 'aim') sealPos = { ...sealHome };
  };
  layout();
  window.addEventListener('resize', layout);

  const updateSeals = () => {
    sealCount.innerHTML = `${SEAL_SVG}<span>${ctx.collection.seals}</span>`;
    const none = ctx.collection.seals <= 0;
    throwBtn.disabled = none || state !== 'aim';
    sealEl.classList.toggle('catch-seal-empty', none);
    if (none && state === 'aim') hint.textContent = 'Out of seals. Walking earns one every 100 m.';
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

  const close = () => {
    if (!scene.isConnected) return;
    running = false;
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

  // The frame loop: creature wander, the closing ring, the seal's pose, and the backdrop.
  const loop = () => {
    if (!running) return;
    const t = clock();
    backdrop.tick(t);
    if (!frozen) {
      const off = creatureOffset(t, phase, dodge, size / 220);
      creaturePos = { x: home.x + off.x, y: home.y + off.y };
      ringNow = ringScale(t);
    }
    creatureEl.style.transform = `translate(${(creaturePos.x - size / 2).toFixed(1)}px, ${(creaturePos.y - size / 2).toFixed(1)}px)`;
    closing.setAttribute('r', (78 * ringNow).toFixed(1));
    closing.style.stroke = oddsColor(catchChance(species.rarity, level, ringQuality(ringNow)));
    ring.classList.toggle('catch-ring-hidden', frozen);

    if (flight && state === 'flight') {
      const p = Math.min(1, (performance.now() - flight.at) / (FLIGHT_S * 1000));
      const pose = flightPose(flight.from, flight.to, p);
      sealPos = { x: pose.x, y: pose.y };
      sealScale = pose.scale;
      sealSpin = pose.spin;
      if (p >= 1) {
        const landed = flight.to;
        flight = null;
        void resolveThrow(landed);
      }
    }
    sealEl.style.transform = `translate(${(sealPos.x - SEAL_PX / 2).toFixed(1)}px, ${(sealPos.y - SEAL_PX / 2).toFixed(1)}px) scale(${sealScale.toFixed(3)}) rotate(${sealSpin.toFixed(1)}deg)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const backToAim = () => {
    sealPos = { ...sealHome };
    sealScale = 1;
    sealSpin = 0;
    state = 'aim';
    updateSeals();
  };

  const throwSeal = (from: Vec, velocity: Vec) => {
    if (ctx.collection.seals <= 0) return;
    ctx.collection.seals--;
    ctx.changed();
    state = 'flight';
    updateSeals();
    vibrate(15);
    const to = landingPoint(from, velocity, maxReach);
    flight = { from, to, at: performance.now() };
    if (Math.random() < dodgeChance(species.rarity, wariness)) dodge = { at: clock() + 0.12, dir: to.x <= creaturePos.x ? 1 : -1 };
  };

  const resolveThrow = async (landed: Vec) => {
    if (!isHit(landed, creaturePos, size * 0.36)) {
      state = 'capture';
      const word = landed.y < creaturePos.y - size * 0.4 ? 'Too far!' : landed.y > creaturePos.y + size * 0.4 ? 'Too short!' : 'Missed!';
      popup(word, landed, 'catch-popup-miss');
      burst(landed, '#8e2b22', 8, 40);
      sealEl.classList.add('catch-seal-fall');
      await wait(500);
      sealEl.classList.remove('catch-seal-fall');
      backToAim();
      return;
    }

    // Struck: freeze the creature and ring where they were and draw it into the seal.
    frozen = true;
    state = 'capture';
    const quality = ringQuality(ringNow);
    const grade = throwGrade(quality);
    const chance = catchChance(species.rarity, level, quality);
    if (grade) popup(grade, { x: creaturePos.x, y: creaturePos.y - size * 0.5 }, 'catch-popup-grade');
    vibrate(30);
    const target = { ...creaturePos };
    burst(target, '#f3d27a', 12, 70, 'star');
    creatureInner.classList.add('catch-sucked');
    const from = { ...sealPos };
    await tween(380, (p) => {
      sealPos = { x: from.x + (target.x - from.x) * p, y: from.y + (target.y - from.y) * p };
      sealScale = 0.6 + 0.2 * p;
      sealSpin = 0;
    });
    const ground = { x: target.x, y: target.y + size * 0.32 };
    await tween(320, (p) => {
      sealPos = { x: ground.x, y: target.y + (ground.y - target.y) * p * p };
    });
    vibrate(20);

    hint.textContent = 'Tap when the golden ring meets the seal to hold it shut!';
    for (let i = 0; i < WOBBLES; i++) {
      const held = await wobble(ground);
      if (!running) return;
      if (Math.random() >= wobbleOdds(chance, held)) return breakFree(target);
    }
    caught();
  };

  /** One wobble of the seal. Resolves whether the player held it at the right moment. */
  const wobble = (at: Vec): Promise<boolean> =>
    new Promise((resolve) => {
      let pressed: boolean | null = null;
      const began = performance.now();
      pressRing.hidden = false;
      pressRing.style.left = `${at.x}px`;
      pressRing.style.top = `${at.y}px`;
      const onPress = (event: PointerEvent) => {
        if (pressed !== null || (event.target as HTMLElement).closest('.catch-run')) return;
        const s = (performance.now() - began) / 1000;
        pressed = pressInWindow(s);
        if (pressed) {
          popup('Held!', { x: at.x, y: at.y - 56 }, 'catch-popup-grade');
          burst(at, '#f3d27a', 8, 40, 'star');
          vibrate([10, 30, 10]);
        } else popup(s < PRESS_AT ? 'Too soon' : 'Too late', { x: at.x, y: at.y - 56 }, 'catch-popup-miss');
      };
      scene.addEventListener('pointerdown', onPress);
      void tween(WOBBLE_S * 1000, (p) => {
        const s = p * WOBBLE_S;
        // The press ring closes in and meets the seal's edge at PRESS_AT.
        const k = Math.max(0.6, 2.4 - (1.4 * s) / PRESS_AT);
        pressRing.style.transform = `translate(-50%, -50%) scale(${k.toFixed(3)})`;
        pressRing.classList.toggle('catch-press-now', Math.abs(s - PRESS_AT) <= PRESS_WINDOW);
        pressRing.style.opacity = s > PRESS_AT + PRESS_WINDOW ? '0' : '1';
        sealSpin = Math.sin(p * Math.PI * 3) * Math.sin(p * Math.PI) * 24;
      }).then(() => {
        scene.removeEventListener('pointerdown', onPress);
        pressRing.hidden = true;
        sealSpin = 0;
        resolve(pressed === true);
      });
    });

  const breakFree = async (at: Vec) => {
    vibrate([40, 40, 40]);
    burst(sealPos, '#2a1d3a', 14, 80);
    sealEl.classList.add('catch-seal-burst');
    creatureInner.classList.remove('catch-sucked');
    wariness++;
    await wait(450);
    sealEl.classList.remove('catch-seal-burst');
    if (Math.random() < fleeChance(species.rarity) + 0.05 * wariness) {
      creatureInner.classList.add('catch-flee');
      burst(at, '#2a1d3a', 18, 110);
      hint.textContent = `The seal cracked and ${species.name} slipped back into the margins of the map.`;
      finished = true;
      onDone(false, true);
      throwBtn.remove();
      sealEl.hidden = true;
      bottom.appendChild(h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, 'Back to the map'));
      return;
    }
    popup('It broke free!', { x: at.x, y: at.y - size * 0.55 }, 'catch-popup-miss');
    hint.textContent = wariness > 1 ? `${species.name} is getting wary and will dodge more.` : 'So close! Try again.';
    frozen = false;
    backToAim();
  };

  const caught = () => {
    const pet = addPet(ctx.collection, encounter);
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
    burst(sealPos, '#f3d27a', 24, 140, 'star');
    hint.textContent = '';
    throwBtn.remove();

    const rewards = h('ul', { class: 'catch-rewards' });
    if (firstOfKind) rewards.append(h('li', {}, `New bestiary entry! +${NEW_SPECIES_SEALS} seals`));
    if (helping)
      rewards.append(h('li', {}, `${getSpecies(helping.speciesId).name} +${CATCH_XP} XP${helperLevels ? `, now level ${helping.level}!` : ''}`));
    const panel = h(
      'section',
      { class: 'catch-result' },
      h('h2', {}, 'Bound!'),
      createCreatureSvg({ speciesId: species.id, seed, size: 140 }),
      h('p', { class: 'catch-result-name' }, `${individual.gilded ? '✦ Gilded ' : ''}${species.name}`, h('small', {}, ` Lv ${level} · ${individual.trait.name}`)),
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

  // Dragging and flicking the seal.
  let samples: { x: number; y: number; t: number }[] = [];
  const local = (e: PointerEvent): Vec => {
    const r = field.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  sealEl.addEventListener('pointerdown', (e) => {
    if (state !== 'aim' || ctx.collection.seals <= 0) return;
    state = 'drag';
    sealEl.setPointerCapture(e.pointerId);
    samples = [{ ...local(e), t: performance.now() }];
    sealEl.classList.add('catch-seal-held');
  });
  sealEl.addEventListener('pointermove', (e) => {
    if (state !== 'drag') return;
    const p = local(e);
    sealPos = p;
    samples.push({ ...p, t: performance.now() });
    if (samples.length > 12) samples.shift();
  });
  const release = (e: PointerEvent) => {
    if (state !== 'drag') return;
    sealEl.classList.remove('catch-seal-held');
    samples.push({ ...local(e), t: performance.now() });
    const v = flickVelocity(samples);
    if (-v.y >= MIN_THROW_SPEED) {
      throwSeal({ ...sealPos }, v);
      return;
    }
    state = 'capture';
    const from = { ...sealPos };
    void tween(240, (p) => {
      sealPos = { x: from.x + (sealHome.x - from.x) * p, y: from.y + (sealHome.y - from.y) * p };
    }).then(backToAim);
  };
  sealEl.addEventListener('pointerup', release);
  sealEl.addEventListener('pointercancel', release);

  // Keyboard and accessibility: a straight throw aimed where the creature rests.
  throwBtn.addEventListener('click', () => {
    if (state !== 'aim') return;
    throwSeal({ ...sealHome }, { x: 0, y: -speedFor(sealHome.y - home.y, maxReach) });
  });
}
