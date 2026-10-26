import { envelope, filter, noise, osc } from './synth';
import { midiToHz } from './themes';

/**
 * Sound effects, each drawn from oscillators and noise at play time so nothing has
 * to be downloaded. Add a new effect by adding a recipe here; callers use its name.
 */

export type SfxName =
  | 'tap'
  | 'open'
  | 'close'
  | 'error'
  | 'coin'
  | 'reward'
  | 'levelUp'
  | 'shrine'
  | 'realm'
  | 'throw'
  | 'wobble'
  | 'bind'
  | 'breakFree'
  | 'flee'
  | 'strike'
  | 'spell'
  | 'hit'
  | 'weakHit'
  | 'crit'
  | 'victory'
  | 'defeat'
  | 'equip'
  | 'forge'
  | 'discover'
  | 'achievement'
  | 'quest';

type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number) => void;

/** A single soft tone. */
function tone(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, dur: number, peak: number, type: OscillatorType = 'sine'): OscillatorNode {
  const env = envelope(ctx, out, t, peak, 0.008, dur);
  return osc(ctx, type, midiToHz(midi), env, t, t + dur + 0.05);
}

/** Notes one after another, `gap` seconds apart. */
function run(ctx: BaseAudioContext, out: AudioNode, t: number, notes: number[], gap: number, dur: number, peak: number, type: OscillatorType = 'triangle'): void {
  notes.forEach((midi, i) => tone(ctx, out, t + i * gap, midi, dur, peak, type));
}

/** Shimmer of bell partials, for magical moments. */
function sparkle(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, count: number, peak = 0.05): void {
  for (let i = 0; i < count; i++) tone(ctx, out, t + i * 0.045 + Math.random() * 0.02, midi + [0, 7, 12, 16, 19, 24][i % 6], 0.5, peak);
}

/** A burst of filtered noise, e.g. a whoosh or impact. */
function whoosh(ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, from: number, to: number, peak: number, type: BiquadFilterType = 'bandpass'): void {
  const env = envelope(ctx, out, t, peak, dur * 0.3, dur * 0.7);
  const f = filter(ctx, type, from, 1.2, env);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  noise(ctx, f, t, t + dur + 0.05);
}

const RECIPES: Record<SfxName, Recipe> = {
  // A light wooden tick for any button.
  tap(ctx, out, t) {
    const env = envelope(ctx, out, t, 0.08, 0.002, 0.05);
    const o = osc(ctx, 'triangle', 900, env, t, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
  },
  // A page turning open.
  open(ctx, out, t) {
    whoosh(ctx, out, t, 0.22, 1200, 4000, 0.05, 'highpass');
    tone(ctx, out, t + 0.05, 79, 0.25, 0.03);
  },
  close(ctx, out, t) {
    whoosh(ctx, out, t, 0.18, 3500, 900, 0.04, 'highpass');
  },
  error(ctx, out, t) {
    run(ctx, out, t, [52, 49], 0.12, 0.18, 0.08, 'square');
  },
  coin(ctx, out, t) {
    run(ctx, out, t, [88, 95], 0.07, 0.25, 0.05, 'square');
  },
  reward(ctx, out, t) {
    run(ctx, out, t, [72, 76, 79, 84], 0.08, 0.4, 0.06);
    sparkle(ctx, out, t + 0.3, 84, 4, 0.025);
  },
  // Rising fanfare in the major with a bright final chord.
  levelUp(ctx, out, t) {
    run(ctx, out, t, [60, 64, 67, 72, 76], 0.09, 0.3, 0.07);
    for (const m of [72, 76, 79, 84]) tone(ctx, out, t + 0.5, m, 1.3, 0.05, 'triangle');
    sparkle(ctx, out, t + 0.55, 84, 8, 0.03);
  },
  // Deep chime and a halo of overtones.
  shrine(ctx, out, t) {
    for (const m of [48, 55, 60, 64, 67]) tone(ctx, out, t, m, 2.4, 0.045, 'sine');
    sparkle(ctx, out, t + 0.2, 79, 10, 0.03);
  },
  // Soft horn call announcing a new realm.
  realm(ctx, out, t) {
    for (const [i, m] of [55, 62, 67].entries()) {
      const env = envelope(ctx, out, t + i * 0.25, 0.05, 0.12, 0.9, 0.25);
      osc(ctx, 'sawtooth', midiToHz(m), filter(ctx, 'lowpass', 900, 1, env), t + i * 0.25, t + i * 0.25 + 1.4);
    }
  },
  // A quick whoosh.
  throw(ctx, out, t) {
    whoosh(ctx, out, t, 0.45, 400, 2500, 0.12);
    const env = envelope(ctx, out, t, 0.04, 0.05, 0.4);
    const o = osc(ctx, 'sine', 300, env, t, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.45);
  },
  wobble(ctx, out, t) {
    const env = envelope(ctx, out, t, 0.12, 0.004, 0.18);
    const o = osc(ctx, 'triangle', 220, env, t, t + 0.25);
    o.frequency.setValueAtTime(260, t + 0.06);
    o.frequency.setValueAtTime(200, t + 0.12);
  },
  // Caught! A bright sealing chord.
  bind(ctx, out, t) {
    tone(ctx, out, t, 48, 0.3, 0.12, 'triangle');
    run(ctx, out, t + 0.05, [72, 76, 79, 84, 88], 0.06, 0.8, 0.05);
    sparkle(ctx, out, t + 0.35, 88, 10, 0.025);
  },
  breakFree(ctx, out, t) {
    whoosh(ctx, out, t, 0.25, 3000, 600, 0.12);
    run(ctx, out, t, [67, 63], 0.1, 0.2, 0.06, 'square');
  },
  flee(ctx, out, t) {
    whoosh(ctx, out, t, 0.6, 1500, 6000, 0.08, 'highpass');
    const env = envelope(ctx, out, t, 0.04, 0.02, 0.5);
    const o = osc(ctx, 'sine', 900, env, t, t + 0.6);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
  },
  strike(ctx, out, t) {
    whoosh(ctx, out, t, 0.18, 800, 3000, 0.1);
  },
  spell(ctx, out, t) {
    const env = envelope(ctx, out, t, 0.06, 0.08, 0.5);
    const o = osc(ctx, 'sawtooth', 220, filter(ctx, 'lowpass', 1800, 4, env), t, t + 0.65);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.4);
    sparkle(ctx, out, t + 0.1, 79, 5, 0.025);
  },
  hit(ctx, out, t) {
    const env = envelope(ctx, out, t, 0.3, 0.002, 0.16);
    const o = osc(ctx, 'sine', 160, env, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.14);
    whoosh(ctx, out, t, 0.08, 2000, 500, 0.12, 'lowpass');
  },
  weakHit(ctx, out, t) {
    RECIPES.hit(ctx, out, t);
    run(ctx, out, t + 0.05, [76, 83], 0.05, 0.2, 0.05, 'square');
  },
  crit(ctx, out, t) {
    RECIPES.hit(ctx, out, t);
    whoosh(ctx, out, t, 0.3, 6000, 1500, 0.1, 'highpass');
    tone(ctx, out, t, 91, 0.35, 0.05, 'square');
  },
  victory(ctx, out, t) {
    run(ctx, out, t, [67, 67, 67, 72], 0.13, 0.25, 0.07);
    for (const m of [60, 64, 67, 72]) tone(ctx, out, t + 0.55, m, 1.6, 0.05, 'triangle');
    sparkle(ctx, out, t + 0.6, 84, 6, 0.025);
  },
  defeat(ctx, out, t) {
    run(ctx, out, t, [64, 62, 60, 59], 0.28, 0.6, 0.06);
    tone(ctx, out, t + 1.1, 40, 1.5, 0.08, 'triangle');
  },
  equip(ctx, out, t) {
    whoosh(ctx, out, t, 0.12, 600, 1800, 0.08);
    tone(ctx, out, t + 0.08, 69, 0.3, 0.06, 'triangle');
  },
  // Hammer on anvil with a ringing overtone.
  forge(ctx, out, t) {
    whoosh(ctx, out, t, 0.06, 4000, 2000, 0.2, 'bandpass');
    for (const hz of [1870, 2830, 4110]) {
      const env = envelope(ctx, out, t, 0.03, 0.002, 0.9);
      osc(ctx, 'sine', hz, env, t, t + 1);
    }
  },
  discover(ctx, out, t) {
    run(ctx, out, t, [74, 81, 86], 0.1, 0.6, 0.05, 'sine');
  },
  achievement(ctx, out, t) {
    RECIPES.levelUp(ctx, out, t);
    tone(ctx, out, t, 36, 1.5, 0.1, 'triangle');
  },
  quest(ctx, out, t) {
    run(ctx, out, t, [69, 74, 78, 81], 0.1, 0.5, 0.06);
  },
};

export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

export function playSfx(ctx: BaseAudioContext, out: AudioNode, name: SfxName, t: number): void {
  RECIPES[name](ctx, out, t);
}
