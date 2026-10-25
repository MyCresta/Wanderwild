import { addPet, markSeen, type Collection, type Follower, type OwnedPet } from './collection';
import { getSpecies, type Rarity } from './species';
import type { Encounter } from './stats';

/** Metres a Wildling must walk with you before it joins, by rarity. */
export const WALK_TO_BEFRIEND: Record<Rarity, number> = { common: 400, uncommon: 700, rare: 1000 };
/** Hours a follower needs at your side to trust you with no walking at all, by rarity. Walking is far quicker. */
export const HOURS_TO_BEFRIEND: Record<Rarity, number> = { common: 3, uncommon: 5, rare: 8 };
/** Driving off a Blotspawn while one follows earns this much trust, in metres (half by Farsight). */
export const BLOT_TRUST_M = 150;
const HOUR_MS = 60 * 60 * 1000;
export const BASE_BAND = 6;
export const MAX_BAND = 12;

/** How many companions the Wayfarer can keep: 6, plus one every 5 Wayfarer levels, up to 12. */
export const bandSize = (wayfarerLevel: number) => Math.min(MAX_BAND, BASE_BAND + Math.floor(wayfarerLevel / 5));

export const bandFull = (c: Collection, wayfarerLevel: number) => c.pets.length >= bandSize(wayfarerLevel);

/** Metres a Wildling wants to walk, shortened by a charm (`charm` is 0..1, capped at half). */
export const walkNeeded = (rarity: Rarity, charm = 0) => Math.round(WALK_TO_BEFRIEND[rarity] * (1 - Math.min(0.5, Math.max(0, charm))));

/** Asks a wild Wildling to walk along. Only one can follow at a time. */
export function startFollowing(c: Collection, spawnId: string, encounter: Encounter, charm = 0, now = Date.now()): Follower | null {
  if (encounter.species.kind !== 'pet' || c.follower) return null;
  c.follower = {
    spawnId,
    speciesId: encounter.species.id,
    seed: encounter.seed,
    level: encounter.level,
    needM: walkNeeded(encounter.species.rarity, charm),
    walkedM: 0,
    startedAt: now,
    tickedAt: now,
  };
  markSeen(c, encounter.species.id);
  return c.follower;
}

export type FollowOutcome = { kind: 'joined'; pet: OwnedPet } | null;

/** Trust a follower gains per millisecond just by staying with you, in metres. A charm shortens the wait as it shortens the walk. */
const idleTrustPerMs = (f: Follower) => WALK_TO_BEFRIEND[getSpecies(f.speciesId).rarity] / (HOURS_TO_BEFRIEND[getSpecies(f.speciesId).rarity] * HOUR_MS);

/** Metres still to walk together before a follower joins. */
export const followerWalkLeftM = (f: Follower) => Math.max(0, f.needM - f.walkedM);

/** Time left before a follower joins if you do not walk at all. */
export const followerWaitMs = (f: Follower) => Math.max(0, f.needM - f.walkedM) / idleTrustPerMs(f);

/**
 * Adds trust, counted in metres walked together, and settles the follower once it is won over.
 * Time passing counts too, even with the app closed, so a Wildling can be befriended from home.
 */
export function followerTrust(c: Collection, metres: number, now = Date.now()): FollowOutcome {
  const f = c.follower;
  if (!f) return null;
  const idle = Math.max(0, now - (f.tickedAt ?? f.startedAt)) * idleTrustPerMs(f);
  f.tickedAt = now;
  f.walkedM = Math.min(f.needM, f.walkedM + metres + idle);
  if (f.walkedM < f.needM) return null;
  c.follower = null;
  const pet = addPet(c, { species: getSpecies(f.speciesId), level: f.level, seed: f.seed });
  return { kind: 'joined', pet };
}

/** Lets the follower go back to the wild. */
export function dismissFollower(c: Collection): void {
  c.follower = null;
}

/** Sends a companion back to the wild to make room. The last one always stays. */
export function releasePet(c: Collection, uid: string): boolean {
  if (c.pets.length <= 1 || !c.pets.some((p) => p.uid === uid)) return false;
  c.pets = c.pets.filter((p) => p.uid !== uid);
  c.lineup = c.lineup.filter((u) => u !== uid);
  if (c.companionUid === uid) c.companionUid = c.pets[0].uid;
  return true;
}
