import type { Element } from './species';

/**
 * What a move does beyond its blow. Tricks with no power do only this.
 * burn: the foe burns for 3 turns. dodge: the next attack misses. heal: back a third of health.
 * thorns: the next hit is halved and half of it thrown back. bulwark: 60% less damage for 2 turns.
 * focus: the next attack is critical. drain: heals half the damage dealt.
 */
export type MoveEffect = 'burn' | 'dodge' | 'heal' | 'thorns' | 'bulwark' | 'focus' | 'drain';

export interface Move {
  id: string;
  name: string;
  /** Null for a plain move that ignores the Elemental Wheel. */
  element: Element | null;
  /** Damage multiplier: Strike is 1, a trick is 0. */
  power: number;
  /** Turns to wait after using it: 0 every turn, 2 every other turn, 3 every third. */
  wait: number;
  effect?: MoveEffect;
}

const m = (id: string, name: string, element: Element | null, power: number, wait: number, effect?: MoveEffect): Move => ({
  id,
  name,
  element,
  power,
  wait,
  effect,
});

/** Signature moves: the one a creature is known for, strong but needing a turn's rest. */
const SIG = 1.7;
/** Evolved signatures hit harder; a few slow ones are heavier still and rest longer. */
const SIG2 = 2.1;
const HEAVY = 2.2;
const HEAVY2 = 2.6;
/** Quick element jabs: a little under Strike, but they ride the Wheel. */
const JAB = 0.9;

export const MOVES: Record<string, Move> = Object.fromEntries(
  [
    // Plain moves anyone might know.
    m('strike', 'Strike', null, 1, 0),
    m('nip', 'Nip', null, 0.75, 0, 'drain'),
    m('headbutt', 'Headbutt', null, 1.5, 2),
    m('maul', 'Maul', null, 2, 3),
    // Quick element jabs, shared by every creature that knows them.
    m('vine-lash', 'Vine Lash', 'grove', JAB, 0),
    m('spray', 'Spray', 'tide', JAB, 0),
    m('ember-spit', 'Ember Spit', 'ember', JAB, 0),
    m('pebble-shot', 'Pebble Shot', 'stone', JAB, 0),
    m('gust', 'Gust', 'gale', JAB, 0),
    m('glint', 'Glint', 'lumen', JAB, 0),
    // Element arts: tricks rather than blows.
    m('kindle', 'Kindle', 'ember', 0.7, 3, 'burn'),
    m('wellspring', 'Wellspring', 'tide', 0, 3, 'heal'),
    m('thornguard', 'Thornguard', 'grove', 0, 3, 'thorns'),
    m('bulwark', 'Bulwark', 'stone', 0, 3, 'bulwark'),
    m('updraft', 'Updraft', 'gale', 0.5, 3, 'dodge'),
    m('glimmer', 'Glimmer', 'lumen', 1, 3, 'focus'),
    // Signatures of the wild forms.
    m('thistle-volley', 'Thistle Volley', 'grove', SIG, 2),
    m('undertow', 'Undertow', 'tide', SIG, 2),
    m('cinder-pounce', 'Cinder Pounce', 'ember', SIG, 2),
    m('rockfall', 'Rockfall', 'stone', HEAVY, 3),
    m('gust-spiral', 'Gust Spiral', 'gale', SIG, 2),
    m('gloam-flare', 'Gloam Flare', 'lumen', SIG, 2),
    m('spore-puff', 'Spore Puff', 'grove', 1.4, 2, 'drain'),
    m('tidal-coil', 'Tidal Coil', 'tide', SIG, 2),
    m('spark-lash', 'Spark Lash', 'ember', SIG, 2),
    m('cairn-toss', 'Cairn Toss', 'stone', SIG, 2),
    m('kite-dive', 'Kite Dive', 'gale', HEAVY, 3),
    m('lampflash', 'Lampflash', 'lumen', SIG, 2),
    m('moss-bound', 'Moss Bound', 'grove', SIG, 2),
    m('brook-rush', 'Brook Rush', 'tide', SIG, 2),
    m('seed-scatter', 'Seed Scatter', 'gale', SIG, 2),
    // Signatures of the evolved forms.
    m('briar-bastion', 'Briar Bastion', 'grove', SIG2, 2),
    m('riptide-veil', 'Riptide Veil', 'tide', SIG2, 2),
    m('pyre-pounce', 'Pyre Pounce', 'ember', SIG2, 2),
    m('rampart-slam', 'Rampart Slam', 'stone', HEAVY2, 3),
    m('thunderclap', 'Thunderclap', 'gale', SIG2, 2),
    m('gloaming-lantern', 'Gloaming Lantern', 'lumen', SIG2, 2),
    m('fairy-ring', 'Fairy Ring', 'grove', 1.8, 2, 'drain'),
    m('pearl-tide', 'Pearl Tide', 'tide', SIG2, 2),
    m('forgefire', 'Forgefire', 'ember', SIG2, 2),
    m('standing-stones', 'Standing Stones', 'stone', SIG2, 2),
    m('squall-line', 'Squall Line', 'gale', HEAVY2, 3),
    m('moonbeam', 'Moonbeam', 'lumen', SIG2, 2),
    m('greenwood-charge', 'Greenwood Charge', 'grove', SIG2, 2),
    m('weir-breaker', 'Weir Breaker', 'tide', SIG2, 2),
    m('thistle-gale', 'Thistle Gale', 'gale', SIG2, 2),
  ].map((move) => [move.id, move]),
);

export function getMove(id: string): Move {
  const move = MOVES[id];
  if (!move) throw new Error(`Unknown move ${id}`);
  return move;
}

/** Power as 1-5 pips, so moves compare at a glance. A trick with no power has none. */
export function powerPips(move: Move): number {
  if (move.power <= 0) return 0;
  const steps = [0.8, 1.1, 1.6, 2.15];
  return 1 + steps.filter((s) => move.power > s).length;
}

/** A pip bar for a move: ●●●○○. */
export const pipText = (move: Move) => {
  const n = powerPips(move);
  return n ? '●'.repeat(n) + '○'.repeat(5 - n) : '';
};

/** A few words for what the move does besides hitting. */
export const EFFECT_TEXT: Record<MoveEffect, { short: string; long: string }> = {
  burn: { short: '🔥', long: 'Sets the foe burning for 3 turns.' },
  dodge: { short: '💨', long: 'Then dodges the next attack.' },
  heal: { short: '♥ Heal', long: 'Heals a third of its health.' },
  thorns: { short: '⛨ Thorns', long: 'Takes half damage for 2 turns and throws half of what it blocks back.' },
  bulwark: { short: '⛨ Shield', long: 'Takes 70% less damage for 2 turns.' },
  focus: { short: '✦', long: 'Marks the weak spot: the next attack is critical.' },
  drain: { short: '♥', long: 'Heals half the damage it deals.' },
};

/** How often a move can be used, in a few words. */
export const cadence = (wait: number) => (wait <= 0 ? 'Every turn' : wait === 2 ? 'Every 2nd turn' : wait === 3 ? 'Every 3rd turn' : `Every ${wait}th turn`);

/** How long until a resting move is ready again, short enough for a button. */
export const readyIn = (turns: number) => `Ready in ${turns}`;

/** What a move does at a glance: power pips, then any trick; a pure trick says what it does. */
export function moveSummary(move: Move): string {
  if (move.power <= 0) return move.effect ? EFFECT_TEXT[move.effect].short : '';
  return `${pipText(move)}${move.effect ? ` +${EFFECT_TEXT[move.effect].short}` : ''}`;
}

/** One line describing a move fully, for tooltips and the Bestiary. */
export function moveBlurb(move: Move): string {
  const parts: string[] = [];
  if (move.power > 0) parts.push(`Power ${Math.round(move.power * 50)}${move.element ? '' : ', plain (no element)'}.`);
  if (move.effect) parts.push(EFFECT_TEXT[move.effect].long);
  parts.push(`${cadence(move.wait)}.`);
  return parts.join(' ');
}
