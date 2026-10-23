import type { Collection } from '../creatures/collection';

/** What the creature screens need from the rest of the game. */
export interface GameContext {
  collection: Collection;
  /** Saves the collection and refreshes the HUD and companion. */
  changed(): void;
}
