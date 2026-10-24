import { FARSIGHT_SHARE } from '../game/farsight';
import { h } from './dom';
import { railButtons } from './layout';

const EYE =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 24q20-22 40 0-20 22-40 0z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="8" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="#e8d9b5"/><path d="M24 4v5M10 9l3 4M38 9l-3 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

const LABEL = `Farsight: explore the map from here (${Math.round(FARSIGHT_SHARE * 100)}% rewards)`;

export interface FarsightHooks {
  enter(): void;
  exit(): void;
}

/**
 * The 👁 button, the one Farsight toggle: switches between walking play (the camera orbits the Wayfarer) and
 * Farsight (drag the map anywhere and play where the lantern-eye in the middle looks).
 */
export class Farsight {
  readonly button: HTMLButtonElement;
  private on = false;

  constructor(private readonly hooks: FarsightHooks) {
    this.button = h('button', { class: 'farsight-button', id: 'farsight', type: 'button', 'aria-label': LABEL, 'aria-pressed': 'false' });
    this.button.innerHTML = EYE;
    this.button.addEventListener('click', () => this.set(!this.on));
    // Bottom right, under the thumb; the compass sits below it when shown.
    railButtons('right').append(this.button);

    document.body.append(h('div', { class: 'farsight-lens', 'aria-hidden': 'true' }));
  }

  get active(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('farsight-on', on);
    this.button.setAttribute('aria-pressed', String(on));
    this.button.setAttribute('aria-label', on ? 'Leave Farsight and return to the Wayfarer' : LABEL);
    if (on) this.hooks.enter();
    else this.hooks.exit();
  }
}
