import { describe, expect, it } from 'vitest';
import { REALMS, type RealmId } from '../src/game/realms';
import { composeBar, degreeToMidi, midiToHz, THEMES, type MusicTheme } from '../src/audio/themes';
import { sound } from '../src/audio/sound';
import { SFX_NAMES } from '../src/audio/sfx';

const PITCHED_DRUMS = new Set(['drone']);
const UNPITCHED = new Set(['drum', 'tom', 'shaker']);

describe('music themes', () => {
  it('has a theme for every realm', () => {
    for (const realm of Object.keys(REALMS) as RealmId[]) expect(THEMES[realm]).toBeDefined();
  });

  it('maps scale degrees across octaves', () => {
    const t = THEMES.hearthfields; // C major from MIDI 48
    expect(degreeToMidi(t, 0)).toBe(48);
    expect(degreeToMidi(t, 2)).toBe(52);
    expect(degreeToMidi(t, 7)).toBe(60);
    expect(degreeToMidi(t, -1)).toBe(47);
    expect(midiToHz(69)).toBeCloseTo(440);
  });

  for (const id of Object.keys(THEMES) as MusicTheme[]) {
    it(`${id}: writes in-key bars that fit and repeat exactly`, () => {
      const theme = THEMES[id];
      const inKey = new Set(theme.scale.map((s) => (theme.root + s) % 12));
      for (let bar = 0; bar < 32; bar++) {
        const events = composeBar(theme, bar);
        expect(events).toEqual(composeBar(theme, bar));
        expect(events.some((e) => e.voice === theme.bed)).toBe(true);
        for (const e of events) {
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(theme.beatsPerBar);
          expect(e.beats).toBeGreaterThan(0);
          expect(e.velocity).toBeGreaterThan(0);
          expect(e.velocity).toBeLessThanOrEqual(1);
          if (UNPITCHED.has(e.voice)) continue;
          if (!PITCHED_DRUMS.has(e.voice)) expect(inKey.has(e.midi % 12)).toBe(true);
          expect(e.midi).toBeGreaterThan(20);
          expect(e.midi).toBeLessThan(108);
        }
      }
    });
  }

  it('gives each theme its own melody', () => {
    const lead = (id: MusicTheme) => composeBar(THEMES[id], 3).filter((e) => e.voice === THEMES[id].lead).map((e) => e.midi);
    expect(lead('wildwood')).not.toEqual(lead('tidemere'));
  });
});

describe('sound system', () => {
  it('stacks scenes over the realm theme and unwinds them in any order', () => {
    sound.setRealm('tidemere');
    expect(sound.theme).toBe('tidemere');
    const endWonder = sound.scene('wonder');
    const endBattle = sound.scene('battle');
    expect(sound.theme).toBe('battle');
    endWonder();
    expect(sound.theme).toBe('battle');
    endBattle();
    endBattle();
    expect(sound.theme).toBe('tidemere');
  });

  it('cycles all sound, effects only and muted', () => {
    const seen: string[] = [];
    const stop = sound.onModeChange((m) => seen.push(m));
    sound.setMode('all');
    sound.cycleMode();
    sound.cycleMode();
    sound.cycleMode();
    stop();
    expect(seen).toEqual(['effects', 'off', 'all']);
  });

  it('ignores effects before audio is unlocked', () => {
    for (const name of SFX_NAMES) expect(() => sound.play(name)).not.toThrow();
  });
});
