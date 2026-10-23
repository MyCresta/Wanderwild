import type { RealmId } from '../game/realms';
import { playSfx, type SfxName } from './sfx';
import { makeReverb, playNote } from './synth';
import { barSeconds, composeBar, secondsPerBeat, THEMES, type MusicTheme } from './themes';

/**
 * Music and sound effects for the whole game, all generated with Web Audio.
 *
 * Usage from any feature:
 *   import { sound } from '../audio/sound';
 *   sound.play('levelUp');                   // one-shot effect
 *   const done = sound.scene('battle');      // switch music while a screen is open
 *   done();                                  // ...and back to the realm when it closes
 *
 * Nothing sounds until the player first touches the page (browsers require it),
 * and the player can choose all sound, effects only, or silence.
 */

export type SoundMode = 'all' | 'effects' | 'off';
export type { SfxName } from './sfx';
export type { MusicTheme } from './themes';

const MODE_KEY = 'wanderwild.sound';
const MODES: SoundMode[] = ['all', 'effects', 'off'];
const MUSIC_LEVEL = 0.8;
const SFX_LEVEL = 1.1;
const CROSSFADE_S = 2.5;
/** How far ahead notes are scheduled. A bar is written once its start is this close. */
const LOOKAHEAD_S = 0.6;
const TICK_MS = 200;
/** The same effect is not repeated more often than this (e.g. a tap per click). */
const SFX_GAP_S = 0.04;
/** Gestures that browsers accept for starting audio (iOS wants touchend or click). */
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

interface Track {
  theme: MusicTheme;
  bus: GainNode;
  bar: number;
  nextBarAt: number;
}

function readMode(): SoundMode {
  try {
    const stored = localStorage.getItem(MODE_KEY) as SoundMode | null;
    if (stored && MODES.includes(stored)) return stored;
  } catch {
    // Storage may be blocked; fall back to the default.
  }
  return 'all';
}

class SoundSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicOut!: GainNode;
  private sfxOut!: GainNode;
  private track: Track | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private realm: RealmId = 'hearthfields';
  private readonly scenes: { id: number; theme: MusicTheme }[] = [];
  private sceneSeq = 0;
  private readonly lastPlayed = new Map<SfxName, number>();
  private readonly listeners = new Set<(mode: SoundMode) => void>();
  private _mode: SoundMode = readMode();

  get mode(): SoundMode {
    return this._mode;
  }

  /** True once the browser has let audio start. */
  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  /** The theme that should be playing right now: the newest scene, else the realm. */
  get theme(): MusicTheme {
    return this.scenes.at(-1)?.theme ?? this.realm;
  }

  setMode(mode: SoundMode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Not remembered, but still applied for this visit.
    }
    this.applyLevels();
    this.updateMusic();
    this.listeners.forEach((fn) => fn(mode));
  }

  /** All sound → effects only → off → all sound. */
  cycleMode(): SoundMode {
    this.setMode(MODES[(MODES.indexOf(this._mode) + 1) % MODES.length]);
    return this._mode;
  }

  onModeChange(fn: (mode: SoundMode) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The realm under the player; its theme plays when no scene is open. */
  setRealm(realm: RealmId): void {
    if (realm === this.realm) return;
    this.realm = realm;
    this.updateMusic();
  }

  /**
   * Plays a scene's music (e.g. 'battle' or 'wonder') on top of the realm until the
   * returned function is called. Scenes stack, so nested screens restore correctly.
   */
  scene(theme: MusicTheme): () => void {
    const id = ++this.sceneSeq;
    this.scenes.push({ id, theme });
    this.updateMusic();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const i = this.scenes.findIndex((s) => s.id === id);
      if (i >= 0) this.scenes.splice(i, 1);
      this.updateMusic();
    };
  }

  /** Plays a one-shot effect. `delay` is in seconds. Silent before audio is unlocked. */
  play(name: SfxName, delay = 0): void {
    if (this._mode === 'off' || !this.ctx || !this.ready) return;
    const t = this.ctx.currentTime + delay;
    if (t - (this.lastPlayed.get(name) ?? -1) < SFX_GAP_S) return;
    this.lastPlayed.set(name, t);
    playSfx(this.ctx, this.sfxOut, name, t);
  }

  /**
   * Starts audio on the first touch, key press or click, and pauses it while the app
   * is in the background. Also gives every button a soft tap. Call once at start-up.
   */
  install(): void {
    const unlock = () => {
      this.unlock();
      if (this.ready) for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
    };
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') void this.ctx.suspend();
      else void this.ctx.resume().then(() => this.updateMusic());
    });
    document.addEventListener('click', (e) => {
      const button = (e.target as Element | null)?.closest?.('button, [role="button"]');
      if (button && !(button as HTMLButtonElement).disabled) this.play('tap');
    });
  }

  private unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor({ latencyHint: 'playback' });
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 6;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      // The instruments are mixed quietly; lift them here and let the limiter catch peaks.
      this.master.gain.value = 2;
      this.master.connect(limiter);
      const reverb = makeReverb(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      reverb.connect(wet).connect(this.master);
      this.musicOut = ctx.createGain();
      this.musicOut.connect(this.master);
      this.musicOut.connect(reverb);
      this.sfxOut = ctx.createGain();
      this.sfxOut.connect(this.master);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.4;
      this.sfxOut.connect(sfxSend).connect(reverb);
      this.applyLevels(true);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.updateMusic());
    else this.updateMusic();
  }

  private applyLevels(now = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(t);
      if (now) param.setValueAtTime(value, t);
      else param.setTargetAtTime(value, t, 0.15);
    };
    ramp(this.musicOut.gain, this._mode === 'all' ? MUSIC_LEVEL : 0);
    ramp(this.sfxOut.gain, this._mode === 'off' ? 0 : SFX_LEVEL);
  }

  /** Brings the playing music in line with the mode, realm and scenes. */
  private updateMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const wanted = this._mode === 'all' ? this.theme : null;
    if (this.track?.theme === wanted) return;
    if (this.track) this.fadeOut(this.track);
    this.track = null;
    clearInterval(this.timer);
    if (!wanted) return;

    const bus = ctx.createGain();
    const t = ctx.currentTime;
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(1, t + CROSSFADE_S);
    bus.connect(this.musicOut);
    // Start the new theme partway through its loop so returning to a realm does not
    // always replay the same opening bar.
    this.track = { theme: wanted, bus, bar: Math.floor(Math.random() * 64), nextBarAt: t + 0.1 };
    this.schedule();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  private fadeOut(track: Track): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    track.bus.gain.cancelScheduledValues(t);
    track.bus.gain.setValueAtTime(Math.max(0.0001, track.bus.gain.value), t);
    track.bus.gain.exponentialRampToValueAtTime(0.0001, t + CROSSFADE_S);
    setTimeout(() => track.bus.disconnect(), (CROSSFADE_S + barSeconds(THEMES[track.theme]) + 2) * 1000);
  }

  /** Writes any bars that start within the lookahead window. */
  private schedule(): void {
    const ctx = this.ctx;
    const track = this.track;
    if (!ctx || !track || ctx.state !== 'running') return;
    const theme = THEMES[track.theme];
    // After a long pause, skip ahead instead of playing a pile of late notes at once.
    if (track.nextBarAt < ctx.currentTime) track.nextBarAt = ctx.currentTime + 0.05;
    const beat = secondsPerBeat(theme);
    while (track.nextBarAt < ctx.currentTime + LOOKAHEAD_S) {
      const start = track.nextBarAt;
      for (const e of composeBar(theme, track.bar))
        playNote(ctx, track.bus, e.voice, { t: start + e.beat * beat, dur: e.beats * beat, midi: e.midi, velocity: e.velocity });
      track.bar++;
      track.nextBarAt = start + barSeconds(theme);
    }
  }
}

/** The one sound system for the game. */
export const sound = new SoundSystem();
