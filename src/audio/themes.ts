import { hashString, seededRandom } from '../game/rng';
import type { RealmId } from '../game/realms';

/**
 * The soundtrack is composed on the fly, one bar at a time. Each theme is a small
 * recipe (mode, tempo, chord loop, instruments, rhythm) and `composeBar` turns it into
 * notes. Bars are seeded by theme and bar number, so the music wanders but a given
 * bar always sounds the same. Nothing here touches Web Audio, so it is easy to test.
 */

export type MusicTheme = RealmId | 'battle' | 'wonder';

export type Voice =
  | 'pad'
  | 'choir'
  | 'bass'
  | 'drone'
  | 'harp'
  | 'lute'
  | 'flute'
  | 'bell'
  | 'drum'
  | 'tom'
  | 'shaker'
  | 'bird'
  | 'waves'
  | 'wind';

export interface NoteEvent {
  voice: Voice;
  /** Start, in beats from the start of the bar. */
  beat: number;
  /** Length in beats. */
  beats: number;
  /** MIDI note number; 0 for unpitched voices. */
  midi: number;
  /** Loudness 0..1. */
  velocity: number;
}

export interface Theme {
  id: MusicTheme;
  /** MIDI note of the tonic, around the bass register. */
  root: number;
  /** Semitone steps of the mode from the tonic. */
  scale: number[];
  bpm: number;
  beatsPerBar: number;
  /** Scale degrees (0-based) of the chord roots, one chord per bar. */
  progression: number[];
  /** Instrument carrying the tune. */
  lead: Voice;
  /** Instrument playing broken chords under it, if any. */
  arp?: Voice;
  /** Sustained chord instrument. */
  bed: Voice;
  /** Chance that a melody step sounds instead of resting. */
  density: number;
  /** Rhythm patterns per bar, one character per eighth note: x = hit, o = soft hit. */
  drums?: { voice: Voice; pattern: string }[];
  /** Occasional colour: birdsong, waves, wind, distant bells. */
  ambience?: { voice: Voice; chance: number };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const THEMES: Record<MusicTheme, Theme> = {
  // Green and lilting: harp and wooden flute, birds in the branches.
  wildwood: {
    id: 'wildwood',
    root: 50, // D
    scale: DORIAN,
    bpm: 76,
    beatsPerBar: 4,
    progression: [0, 3, 6, 0, 2, 3, 4, 0],
    lead: 'flute',
    arp: 'harp',
    bed: 'pad',
    density: 0.5,
    ambience: { voice: 'bird', chance: 0.45 },
  },
  // Slow and glassy, like light on water, with waves washing in.
  tidemere: {
    id: 'tidemere',
    root: 45, // A
    scale: AEOLIAN,
    bpm: 58,
    beatsPerBar: 4,
    progression: [0, 5, 2, 6, 0, 3, 5, 4],
    lead: 'bell',
    arp: 'harp',
    bed: 'pad',
    density: 0.35,
    ambience: { voice: 'waves', chance: 0.7 },
  },
  // A busy market town: lute, a frame drum and a cheerful tin whistle.
  stoneward: {
    id: 'stoneward',
    root: 43, // G
    scale: MIXOLYDIAN,
    bpm: 96,
    beatsPerBar: 4,
    progression: [0, 6, 3, 0, 0, 4, 6, 0],
    lead: 'flute',
    arp: 'lute',
    bed: 'pad',
    density: 0.6,
    drums: [
      { voice: 'tom', pattern: 'x..o x.o.' },
      { voice: 'shaker', pattern: '.o.o.o.o' },
    ],
  },
  // Hushed and old: a low drone, a far-off choir and a tolling bell.
  barrows: {
    id: 'barrows',
    root: 40, // E
    scale: PHRYGIAN,
    bpm: 50,
    beatsPerBar: 4,
    progression: [0, 1, 0, 6, 0, 5, 1, 0],
    lead: 'bell',
    bed: 'choir',
    density: 0.22,
    drums: [{ voice: 'drone', pattern: 'x.......' }],
    ambience: { voice: 'wind', chance: 0.5 },
  },
  // Warm hearths and gardens: a gentle folk tune in a bright major.
  hearthfields: {
    id: 'hearthfields',
    root: 48, // C
    scale: MAJOR,
    bpm: 84,
    beatsPerBar: 4,
    progression: [0, 4, 5, 3, 0, 3, 4, 0],
    lead: 'flute',
    arp: 'lute',
    bed: 'pad',
    density: 0.5,
    drums: [{ voice: 'shaker', pattern: '..o...o.' }],
    ambience: { voice: 'bird', chance: 0.2 },
  },
  // Blotspawn fights: a driving ostinato and war drums.
  battle: {
    id: 'battle',
    root: 38, // D
    scale: HARMONIC_MINOR,
    bpm: 128,
    beatsPerBar: 4,
    progression: [0, 0, 5, 4, 0, 0, 3, 4],
    lead: 'lute',
    arp: 'harp',
    bed: 'choir',
    density: 0.7,
    drums: [
      { voice: 'drum', pattern: 'x..x x.x.' },
      { voice: 'tom', pattern: '..o...oo' },
      { voice: 'shaker', pattern: 'oooooooo' },
    ],
  },
  // Meeting a Wildling: suspended and curious, lydian shimmer.
  wonder: {
    id: 'wonder',
    root: 53, // F
    scale: LYDIAN,
    bpm: 66,
    beatsPerBar: 4,
    progression: [0, 1, 0, 4, 0, 1, 2, 4],
    lead: 'bell',
    arp: 'harp',
    bed: 'pad',
    density: 0.4,
  },
};

/** MIDI note for a scale degree (which may run past an octave or below zero). */
export function degreeToMidi(theme: Theme, degree: number): number {
  const n = theme.scale.length;
  const octave = Math.floor(degree / n);
  const step = ((degree % n) + n) % n;
  return theme.root + 12 * octave + theme.scale[step];
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const secondsPerBeat = (theme: Theme) => 60 / theme.bpm;
export const barSeconds = (theme: Theme) => theme.beatsPerBar * secondsPerBeat(theme);

const steps = (pattern: string) => pattern.replace(/\s/g, '');

/** Writes the notes for bar `index` of a theme. */
export function composeBar(theme: Theme, index: number): NoteEvent[] {
  const rand = seededRandom(hashString(`${theme.id}:${index}`));
  const events: NoteEvent[] = [];
  const bar = theme.beatsPerBar;
  const chord = theme.progression[((index % theme.progression.length) + theme.progression.length) % theme.progression.length];
  const tones = [chord, chord + 2, chord + 4];

  // Held chord, voiced an octave above the bass.
  for (const d of tones) events.push({ voice: theme.bed, beat: 0, beats: bar, midi: degreeToMidi(theme, d + 7), velocity: 0.5 });
  // Bass on the downbeat, plus a fifth halfway through in the livelier themes.
  events.push({ voice: 'bass', beat: 0, beats: bar / 2, midi: degreeToMidi(theme, chord), velocity: 0.7 });
  if (theme.bpm >= 80) events.push({ voice: 'bass', beat: bar / 2, beats: bar / 2, midi: degreeToMidi(theme, chord + 4), velocity: 0.55 });

  // Broken chord in eighth notes, up and back down.
  if (theme.arp) {
    const shape = [0, 1, 2, 3, 2, 1, 2, 1];
    const arpTones = [...tones.map((d) => d + 7), chord + 14];
    for (let i = 0; i < bar * 2; i++) {
      if (rand() < 0.2) continue;
      events.push({ voice: theme.arp, beat: i / 2, beats: 1, midi: degreeToMidi(theme, arpTones[shape[i % shape.length]]), velocity: 0.35 + rand() * 0.15 });
    }
  }

  // Melody: a random walk over the scale that leans towards chord tones on strong beats.
  // Each bar picks up where the previous phrase would be, so the line stays connected.
  let degree = chord + 14 + Math.floor(rand() * 3);
  const phraseEnd = index % 4 === 3;
  for (let i = 0; i < bar * 2; ) {
    const length = rand() < 0.3 ? 2 : rand() < 0.15 ? 4 : 1;
    const strong = i % 4 === 0;
    if (rand() < theme.density || (phraseEnd && i === 0)) {
      if (strong) degree = nearestChordTone(degree, tones);
      events.push({ voice: theme.lead, beat: i / 2, beats: Math.min(length, bar * 2 - i) / 2, midi: degreeToMidi(theme, degree), velocity: strong ? 0.7 : 0.55 });
    }
    const step = Math.round((rand() - 0.5) * 4);
    degree = Math.max(chord + 10, Math.min(chord + 21, degree + (step === 0 ? 1 : step)));
    i += length;
    // Phrases end on a long tonic-ish note.
    if (phraseEnd && i >= bar * 2 - 2) {
      if (i < bar * 2) events.push({ voice: theme.lead, beat: i / 2, beats: (bar * 2 - i) / 2, midi: degreeToMidi(theme, nearestChordTone(degree, [0, 2, 4])), velocity: 0.6 });
      break;
    }
  }

  for (const drum of theme.drums ?? []) {
    const hits = steps(drum.pattern);
    for (let i = 0; i < hits.length && i < bar * 2; i++) {
      if (hits[i] === '.') continue;
      events.push({ voice: drum.voice, beat: i / 2, beats: drum.voice === 'drone' ? bar : 0.5, midi: drum.voice === 'drone' ? theme.root - 12 : 0, velocity: hits[i] === 'x' ? 0.8 : 0.45 });
    }
  }

  if (theme.ambience && rand() < theme.ambience.chance) {
    const at = Math.floor(rand() * bar * 2) / 2;
    events.push({ voice: theme.ambience.voice, beat: at, beats: bar, midi: degreeToMidi(theme, chord + 21), velocity: 0.4 + rand() * 0.3 });
  }
  return events;
}

/** Moves a degree to the closest chord tone in any octave. */
function nearestChordTone(degree: number, chordTones: number[]): number {
  let best = degree;
  let bestGap = Infinity;
  for (const tone of chordTones) {
    const base = ((tone % 7) + 7) % 7;
    for (let octave = -1; octave <= 4; octave++) {
      const candidate = base + 7 * octave;
      const gap = Math.abs(candidate - degree);
      if (gap < bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
  }
  return best;
}
