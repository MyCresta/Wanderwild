import { addPet, markSeen, type Collection, type Follower, type OwnedPet } from './collection';
import { getSpecies, type Rarity } from './species';
import type { Encounter } from './stats';

/** Metres a Wildling must walk with you before it joins, by rarity. */
export const WALK_TO_BEFRIEND: Record<Rarity, number> = { common: 400, uncommon: 700, rare: 1000 };
/** Driving off a Blotspawn while one follows earns this much trust, in metres. */
export const BLOT_TRUST_M = 150;
/** A follower that has not been won over in this long wanders back to the wild. */
export const FOLLOW_MS = 60 * 60 * 1000;
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
  };
  markSeen(c, encounter.species.id);
  return c.follower;
}

export type FollowOutcome = { kind: 'joined'; pet: OwnedPet } | { kind: 'left'; name: string } | null;

/** Adds trust, as metres walked together, and settles the follower if it is won over or has given up. */
export function followerTrust(c: Collection, metres: number, now = Date.now()): FollowOutcome {
  const f = c.follower;
  if (!f) return null;
  if (now - f.startedAt > FOLLOW_MS) {
    c.follower = null;
    return { kind: 'left', name: getSpecies(f.speciesId).name };
  }
  f.walkedM = Math.min(f.needM, f.walkedM + metres);
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
  c.party = c.party.filter((u) => u !== uid);
  if (c.companionUid === uid) c.companionUid = c.pets[0].uid;
  return true;
}
