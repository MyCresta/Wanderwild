import type { Collection } from '../creatures/collection';

/** What battles can draw on from the Wayfarer's side of the game. */
export interface WayfarerHooks {
  level(): number;
  tonics(): number;
  /** Spends a Herb Garden tonic. Returns false when there are none. */
  useTonic(): boolean;
  /** Metres walked toward spells since the last cast. */
  spellMetres(): number;
  spendSpell(metres: number): boolean;
  /** Gear bonuses: multipliers on pet damage and health, and extra catch chance (0.06 = +6 points). */
  gear(): { petDamage: number; petHealth: number; catchBonus: number };
}

/** What the creature screens need from the rest of the game. */
export interface GameContext {
  collection: Collection;
  /** Saves the collection and refreshes the HUD and companion. */
  changed(): void;
  wayfarer?: WayfarerHooks;
}
