import type { HeroPower, HeroSpellId } from '../game/hero';
import type { Collection } from '../creatures/collection';

/** What battles can draw on from the Wayfarer's side of the game. */
export interface WayfarerHooks {
  level(): number;
  tonics(): number;
  /** Spends a Herb Garden tonic. Returns false when there are none. */
  useTonic(): boolean;
  /** The hero beside the party: stat boosts, talents and known spells. */
  hero(): HeroPower;
  heroName?(): string;
  /** Mana ready to spend; it fills by walking. */
  mana(): number;
  spellCost(spell: HeroSpellId): number;
  /** Pays for a spell. Returns false when there is not enough mana. */
  spendMana(spell: HeroSpellId): boolean;
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
