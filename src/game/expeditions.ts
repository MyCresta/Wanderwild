import { REALMS, type MaterialId, type RealmId } from './realms';

/**
 * Pets not in the party can go on timed trips to a realm the Wayfarer has visited and
 * bring back its material. Walking speeds them up, like the Hearthstead's timers.
 */

export const EXPEDITION_LEVEL = 8;
export const EXPEDITION_SLOTS = 3;
const HOUR = 3_600_000;
export const EXPEDITION_LENGTHS = [1 * HOUR, 2 * HOUR, 4 * HOUR];

export interface Expedition {
  petUid: string;
  petLevel: number;
  realm: RealmId;
  startedAt: number;
  durationMs: number;
  /** Time skipped by walking since the trip started. */
  boostMs: number;
}

export const expeditionProgress = (e: Expedition, now: number) =>
  Math.min(1, (now - e.startedAt + e.boostMs) / e.durationMs);

export const expeditionDone = (e: Expedition, now: number) => expeditionProgress(e, now) >= 1;

export function msLeft(e: Expedition, now: number): number {
  return Math.max(0, e.durationMs - (now - e.startedAt + e.boostMs));
}

export interface ExpeditionReward {
  materials: Partial<Record<MaterialId, number>>;
  coin: number;
  petXp: number;
}

/** Longer trips and stronger pets bring back more. */
export function expeditionReward(e: Expedition): ExpeditionReward {
  const hours = e.durationMs / HOUR;
  const amount = Math.round(hours * (3 + e.petLevel / 4));
  return {
    materials: { [REALMS[e.realm].material]: amount },
    coin: Math.round(hours * 15),
    petXp: Math.round(hours * (10 + e.petLevel * 2)),
  };
}

/**
 * Where a Wildling stands on its trail, from 0 (the Hearthstead) to 1 (the realm): it walks
 * out for the first half of the trip and home for the second.
 */
export function trailSpot(progress: number): { at: number; back: boolean } {
  const p = Math.max(0, Math.min(1, progress));
  return p < 0.5 ? { at: p * 2, back: false } : { at: 2 - p * 2, back: true };
}
