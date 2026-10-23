import { midiToHz, type Voice } from './themes';

/**
 * Hand-built instruments from plain oscillators and noise. Each call schedules one
 * note at time `t` (AudioContext seconds) into `out` and cleans up after itself.
 */

export interface Note {
  t: number;
  /** Length in seconds. */
  dur: number;
  midi: number;
  velocity: number;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, shared by every noisy sound. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** A soft hall: stereo noise with an exponential tail, used as the convolver impulse. */
export function makeReverb(ctx: BaseAudioContext, seconds = 3.2): ConvolverNode {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const node = ctx.createConvolver();
  node.buffer = impulse;
  return node;
}

/** Attack / hold / release envelope on a fresh gain node. */
export function envelope(ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, attack: number, release: number, hold = 0): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(out);
  return g;
}

export function osc(ctx: BaseAudioContext, type: OscillatorType, hz: number, into: AudioNode, t: number, stop: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, t);
  o.detune.value = detune;
  o.connect(into);
  o.start(t);
  o.stop(stop);
  return o;
}

export function noise(ctx: BaseAudioContext, into: AudioNode, t: number, stop: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.connect(into);
  src.start(t, Math.random());
  src.stop(stop);
  return src;
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q: number, into: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  f.connect(into);
  return f;
}

type Instrument = (ctx: BaseAudioContext, out: AudioNode, note: Note) => void;

const INSTRUMENTS: Record<Voice, Instrument> = {
  // Warm string-like bed: detuned saws through a slowly opening low-pass.
  pad(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.05 * velocity, Math.min(1.2, dur / 3), 1.4, Math.max(0, dur - 1.2));
    const lp = filter(ctx, 'lowpass', 500, 0.7, env);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1100, t + dur / 2);
    lp.frequency.linearRampToValueAtTime(500, t + dur + 1);
    const hz = midiToHz(midi);
    osc(ctx, 'sawtooth', hz, lp, t, t + dur + 1.5, -7);
    osc(ctx, 'sawtooth', hz, lp, t, t + dur + 1.5, 7);
  },
  // Distant voices: saws through two vowel-ish band-passes.
  choir(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.07 * velocity, 1, 1.6, Math.max(0, dur - 1));
    const a = filter(ctx, 'bandpass', 700, 6, env);
    const b = filter(ctx, 'bandpass', 1150, 8, env);
    const hz = midiToHz(midi);
    for (const det of [-9, 0, 9]) {
      osc(ctx, 'sawtooth', hz, a, t, t + dur + 1.8, det);
      osc(ctx, 'sawtooth', hz, b, t, t + dur + 1.8, det + 3);
    }
  },
  bass(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.16 * velocity, 0.02, Math.max(0.4, dur * 0.9));
    const lp = filter(ctx, 'lowpass', 600, 1, env);
    osc(ctx, 'triangle', midiToHz(midi), lp, t, t + dur + 0.5);
  },
  // Barrows heartbeat: a very low, slowly swelling hum.
  drone(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.12 * velocity, dur / 2, dur / 2);
    const lp = filter(ctx, 'lowpass', 220, 2, env);
    const hz = midiToHz(midi);
    osc(ctx, 'sawtooth', hz, lp, t, t + dur + 0.1, -4);
    osc(ctx, 'sine', hz / 2, env, t, t + dur + 0.1);
  },
  // Plucked string: bright attack that darkens as it rings.
  harp(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.09 * velocity, 0.005, Math.max(0.8, dur * 2));
    const lp = filter(ctx, 'lowpass', 3000, 0.5, env);
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    const hz = midiToHz(midi);
    osc(ctx, 'triangle', hz, lp, t, t + dur * 2 + 0.9);
    osc(ctx, 'sine', hz * 2, lp, t, t + 0.4);
  },
  lute(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.08 * velocity, 0.004, Math.max(0.35, dur));
    const lp = filter(ctx, 'lowpass', 2400, 3, env);
    lp.frequency.setValueAtTime(2800, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    osc(ctx, 'sawtooth', midiToHz(midi), lp, t, t + dur + 0.4);
  },
  // Breathy wooden flute with a little vibrato that arrives late.
  flute(ctx, out, { t, dur, midi, velocity }) {
    const env = envelope(ctx, out, t, 0.08 * velocity, 0.06, 0.25, Math.max(0, dur - 0.1));
    const hz = midiToHz(midi);
    const o = osc(ctx, 'sine', hz, env, t, t + dur + 0.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(hz * 0.006, t + Math.min(0.5, dur));
    vib.connect(depth).connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.4);
    const breath = envelope(ctx, out, t, 0.012 * velocity, 0.03, 0.15);
    noise(ctx, filter(ctx, 'bandpass', hz * 2, 3, breath), t, t + 0.3);
  },
  // Glassy FM bell with a long tail.
  bell(ctx, out, { t, dur, midi, velocity }) {
    const tail = Math.max(1.5, dur * 2.5);
    const env = envelope(ctx, out, t, 0.07 * velocity, 0.003, tail);
    const hz = midiToHz(midi);
    const carrier = osc(ctx, 'sine', hz, env, t, t + tail + 0.1);
    const mod = ctx.createOscillator();
    mod.frequency.value = hz * 3.5;
    const index = ctx.createGain();
    index.gain.setValueAtTime(hz * 2, t);
    index.gain.exponentialRampToValueAtTime(hz * 0.05, t + tail);
    mod.connect(index).connect(carrier.frequency);
    mod.start(t);
    mod.stop(t + tail + 0.1);
  },
  drum(ctx, out, { t, velocity }) {
    const env = envelope(ctx, out, t, 0.45 * velocity, 0.003, 0.35);
    const o = osc(ctx, 'sine', 110, env, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const thud = envelope(ctx, out, t, 0.08 * velocity, 0.002, 0.06);
    noise(ctx, filter(ctx, 'lowpass', 900, 1, thud), t, t + 0.1);
  },
  // Frame drum: hand slap on a skin.
  tom(ctx, out, { t, velocity }) {
    const env = envelope(ctx, out, t, 0.22 * velocity, 0.003, 0.25);
    const o = osc(ctx, 'triangle', 190, env, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.2);
    const slap = envelope(ctx, out, t, 0.05 * velocity, 0.002, 0.05);
    noise(ctx, filter(ctx, 'bandpass', 1800, 1.5, slap), t, t + 0.08);
  },
  shaker(ctx, out, { t, velocity }) {
    const env = envelope(ctx, out, t, 0.03 * velocity, 0.01, 0.07);
    noise(ctx, filter(ctx, 'highpass', 6000, 0.7, env), t, t + 0.12);
  },
  // A small bird: quick chirps that swoop up and down.
  bird(ctx, out, { t, midi, velocity }) {
    const base = midiToHz(midi) * 2;
    const chirps = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < chirps; i++) {
      const s = t + i * (0.09 + Math.random() * 0.08);
      const env = envelope(ctx, out, s, 0.025 * velocity, 0.01, 0.07);
      const o = osc(ctx, 'sine', base, env, s, s + 0.1);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), s + 0.04);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, s + 0.09);
    }
  },
  // Surf: filtered noise that swells in and drains away.
  waves(ctx, out, { t, dur, velocity }) {
    const length = Math.max(3, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06 * velocity, t + length * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    g.connect(out);
    const lp = filter(ctx, 'lowpass', 500, 0.5, g);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1200, t + length * 0.4);
    lp.frequency.linearRampToValueAtTime(250, t + length);
    noise(ctx, lp, t, t + length + 0.1);
  },
  // Wind through stones: a narrow whistling band that drifts in pitch.
  wind(ctx, out, { t, dur, velocity }) {
    const length = Math.max(3, dur);
    const g = envelope(ctx, out, t, 0.04 * velocity, length / 2, length / 2);
    const bp = filter(ctx, 'bandpass', 500, 12, g);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.linearRampToValueAtTime(700 + Math.random() * 300, t + length / 2);
    bp.frequency.linearRampToValueAtTime(350, t + length);
    noise(ctx, bp, t, t + length + 0.1);
  },
};

export function playNote(ctx: BaseAudioContext, out: AudioNode, voice: Voice, note: Note): void {
  INSTRUMENTS[voice](ctx, out, note);
}

