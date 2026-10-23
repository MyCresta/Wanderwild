import type { Element } from './species';

/**
 * The Elemental Wheel. Each element overpowers the next one round the wheel and is
 * overpowered by the one before it; every other pairing is even. Six arrows to learn.
 */
export const WHEEL: readonly Element[] = ['ember', 'grove', 'stone', 'gale', 'lumen', 'tide'];

/** How each element overpowers the next, for the battle help and log. */
export const WHEEL_VERBS: Record<Element, string> = {
  ember: 'burns',
  grove: 'cracks',
  stone: 'stops',
  gale: 'snuffs',
  lumen: 'pierces',
  tide: 'douses',
};

export const STRONG = 1.5;
export const WEAK = 0.6;

/** The element this one overpowers. */
export const beats = (e: Element): Element => WHEEL[(WHEEL.indexOf(e) + 1) % WHEEL.length];

/** The element that overpowers this one. */
export const beatenBy = (e: Element): Element => WHEEL[(WHEEL.indexOf(e) + WHEEL.length - 1) % WHEEL.length];

/** Damage multiplier for an attack of element `attack` on a creature of element `defender`. */
export function matchup(attack: Element, defender: Element): number {
  if (beats(attack) === defender) return STRONG;
  if (beats(defender) === attack) return WEAK;
  return 1;
}
