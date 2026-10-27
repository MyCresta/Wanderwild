import { haversine } from '../geo/distance';
import { capRarity, isBetter, RARITY_ORDER, RUNE_IDS, RUNE_LEVEL, SLOTS, type GearItem, type GearRarity, type RuneId, type Slot } from './gear';
import { dayKey } from './hearthstead';
import { hashString, seededRandom } from './rng';
import { offset } from './trail';

/**
 * The wandering peddler: once a day a merchant camps somewhere within a kilometre of where
 * the Wayfarer first stands, selling one rare piece of gear or a rune for coin. The ware is
 * always worth having: gear is rarer than what that slot wears. Trading needs the Wayfarer
 * there on foot.
 */

const MIN_M = 400;
const MAX_M = 1000;
/** Travelling this far from a peddler you never traded with sets up a new one where you are. */
const REDRAW_M = 5000;

export const GEAR_PRICE: Partial<Record<GearRarity, number>> = { rare: 150, mythic: 400, relic: 900 };
export const RUNE_PRICE = 250;
/** Of the days runes are on offer, how often the peddler brings one instead of gear. */
const RUNE_CHANCE = 0.35;

export interface Peddler {
  /** The local day the peddler camps for. */
  day: string;
  origin: { lat: number; lng: number };
  lat: number;
  lng: number;
  sold: boolean;
}

export type PeddlerWare =
  | { kind: 'gear'; slot: Slot; rarity: GearRarity; price: number }
  | { kind: 'rune'; rune: RuneId; price: number };

export function placePeddler(origin: { lat: number; lng: number }, now = Date.now()): Peddler {
  const day = dayKey(now);
  const rand = seededRandom(hashString(`peddler:${day}:${origin.lat.toFixed(3)}:${origin.lng.toFixed(3)}`));
  const spot = offset(origin, rand() * 360, MIN_M + rand() * (MAX_M - MIN_M));
  return { day, origin: { lat: origin.lat, lng: origin.lng }, ...spot, sold: false };
}

/** Today's peddler: the saved one while it is still today's, or a new one placed here. */
export function peddlerToday(peddler: Peddler | null, at: { lat: number; lng: number }, now = Date.now()): Peddler {
  if (peddler && peddler.day === dayKey(now) && (peddler.sold || haversine(peddler.origin, at) < REDRAW_M)) return peddler;
  return placePeddler(at, now);
}

/** The rarity a peddler would bring for a slot: one step above what it wears, never below Rare. */
function offerFor(current: GearItem | undefined, level: number): GearRarity | null {
  const step = current ? RARITY_ORDER.indexOf(current.rarity) + 1 : 0;
  const rarity = capRarity(RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, Math.max(RARITY_ORDER.indexOf('rare'), step))], level);
  return isBetter(rarity, current) ? rarity : null;
}

/**
 * What the peddler sells today, chosen by the day so it stays put. Gear is picked from
 * slots it would improve, so buying it always puts it on; runes come once they are unlocked.
 * Null when there is nothing worth selling.
 */
export function peddlerWare(peddler: Peddler, level: number, gear: Partial<Record<Slot, GearItem>>): PeddlerWare | null {
  if (peddler.sold) return null;
  const rand = seededRandom(hashString(`peddler-ware:${peddler.day}`));
  const runes = level >= RUNE_LEVEL;
  const slots = SLOTS.filter((slot) => offerFor(gear[slot], level));
  const runeRoll = rand();
  const pick = rand();
  if (runes && (runeRoll < RUNE_CHANCE || !slots.length)) return { kind: 'rune', rune: RUNE_IDS[Math.floor(pick * RUNE_IDS.length)], price: RUNE_PRICE };
  if (!slots.length) return null;
  const slot = slots[Math.floor(pick * slots.length)];
  const rarity = offerFor(gear[slot], level)!;
  return { kind: 'gear', slot, rarity, price: GEAR_PRICE[rarity]! };
}
