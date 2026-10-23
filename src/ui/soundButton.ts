import { sound, type SoundMode } from '../audio/sound';

const LABELS: Record<SoundMode, string> = {
  all: 'Sound on. Tap for effects only',
  effects: 'Effects only. Tap to mute',
  off: 'Muted. Tap for sound',
};

const SPEAKER = '<path d="M8 19h7l10-8v26l-10-8H8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />';
const ICONS: Record<SoundMode, string> = {
  // Speaker with a little note: music and effects.
  all: `${SPEAKER}<path d="M33 12v15" stroke="currentColor" stroke-width="2.6" /><path d="M33 12l8 3v5l-8-3" fill="currentColor" /><ellipse cx="30" cy="28" rx="4" ry="3" fill="currentColor" /><path d="M31 36q4 2 8-1" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" />`,
  // Speaker with sound waves: effects only.
  effects: `${SPEAKER}<path d="M30 18q4 6 0 12M35 14q7 10 0 20" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" />`,
  off: `${SPEAKER}<path d="M31 18l10 12M41 18L31 30" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" />`,
};

/** The round button that cycles all sound → effects only → muted. */
export function setupSoundButton(button: HTMLButtonElement): void {
  const render = (mode: SoundMode) => {
    button.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[mode]}</svg>`;
    button.setAttribute('aria-label', LABELS[mode]);
    button.title = LABELS[mode];
    button.dataset.mode = mode;
  };
  render(sound.mode);
  sound.onModeChange(render);
  button.addEventListener('click', () => sound.cycleMode());
}
