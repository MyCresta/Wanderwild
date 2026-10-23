import { addXp, individualFromSeed, type Encounter } from './stats';
import { getSpecies } from './species';

/** A Wildling the player has bound. */
export interface OwnedPet {
  uid: string;
  speciesId: string;
  seed: number;
  level: number;
  xp: number;
  caughtAt: number;
  /** Metres walked as companion in its home realm, toward evolving. */
  realmWalkM?: number;
  /** Whether it has walked a Ring in its home realm as companion, the last step to evolving. */
  homeRing?: boolean;
  /** How well it was sketched when it was bound. */
  sketch?: string;
}

export interface Collection {
  version: 1;
  pets: OwnedPet[];
  companionUid: string | null;
  /** Up to two more pets that join the companion in battle, by uid. */
  party: string[];
  /** Binding seals, spent to catch Wildlings and earned by walking and battles. */
  seals: number;
  /** Species met at least once, for the bestiary. */
  seen: string[];
  /** Spawn ids already caught or beaten, with when each may be forgotten. */
  cleared: Record<string, number>;
  /** Metres walked toward the next seal and the companion's next walking experience. */
  sealProgressM: number;
  xpProgressM: number;
}

const KEY = 'wanderwild.bestiary';
export const STARTING_SEALS = 10;
export const MAX_SEALS = 60;
export const METRES_PER_SEAL = 100;
export const METRES_PER_WALK_XP = 25;

export const STARTERS = ['bramblet', 'driftfin', 'emberkit'] as const;

export function emptyCollection(): Collection {
  return {
    version: 1,
    pets: [],
    companionUid: null,
    party: [],
    seals: STARTING_SEALS,
    seen: [],
    cleared: {},
    sealProgressM: 0,
    xpProgressM: 0,
  };
}

export function loadCollection(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Collection {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return emptyCollection();
    const parsed = JSON.parse(raw) as Partial<Collection>;
    if (parsed.version !== 1) return emptyCollection();
    return { ...emptyCollection(), ...parsed };
  } catch {
    return emptyCollection();
  }
}

export function saveCollection(c: Collection, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    const now = Date.now();
    for (const [id, until] of Object.entries(c.cleared)) if (until < now) delete c.cleared[id];
    storage?.setItem(KEY, JSON.stringify(c));
  } catch {
    // Storage can be unavailable (private mode); progress lasts for this visit.
  }
}

let uidCounter = 0;
const newUid = () => `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function companion(c: Collection): OwnedPet | null {
  return c.pets.find((p) => p.uid === c.companionUid) ?? c.pets[0] ?? null;
}

/** The battle party: the companion first, then up to two chosen pets. */
export function partyPets(c: Collection): OwnedPet[] {
  const lead = companion(c);
  if (!lead) return [];
  const rest = c.party
    .filter((uid) => uid !== lead.uid)
    .map((uid) => c.pets.find((p) => p.uid === uid))
    .filter((p): p is OwnedPet => !!p);
  return [lead, ...rest].slice(0, 3);
}

/** Adds a pet to the party, or takes it out. Returns whether it is now in the party. */
export function togglePartyMember(c: Collection, uid: string): boolean {
  const lead = companion(c);
  if (uid === lead?.uid) return true;
  const i = c.party.indexOf(uid);
  if (i >= 0) {
    c.party.splice(i, 1);
    return false;
  }
  c.party = c.party.filter((u) => u !== lead?.uid && c.pets.some((p) => p.uid === u)).slice(-1);
  c.party.push(uid);
  return true;
}

export function markSeen(c: Collection, speciesId: string): void {
  if (!c.seen.includes(speciesId)) c.seen.push(speciesId);
}

export function addPet(c: Collection, encounter: Encounter): OwnedPet {
  const pet: OwnedPet = {
    uid: newUid(),
    speciesId: encounter.species.id,
    seed: encounter.seed,
    level: encounter.level,
    xp: 0,
    caughtAt: Date.now(),
  };
  c.pets.push(pet);
  markSeen(c, pet.speciesId);
  if (!c.companionUid) c.companionUid = pet.uid;
  return pet;
}

/** Gives a pet experience, scaled by its trait. Returns levels gained. */
export function grantPetXp(pet: OwnedPet, amount: number): number {
  const trait = individualFromSeed(pet.seed, getSpecies(pet.speciesId).kind).trait;
  return addXp(pet, amount * trait.xp);
}

/** Turns walked metres into seals and companion experience. */
export function walkRewards(c: Collection, metres: number): { seals: number; levels: number } {
  c.sealProgressM += metres;
  c.xpProgressM += metres;
  let seals = 0;
  while (c.sealProgressM >= METRES_PER_SEAL) {
    c.sealProgressM -= METRES_PER_SEAL;
    if (c.seals < MAX_SEALS) {
      c.seals++;
      seals++;
    }
  }
  const xp = Math.floor(c.xpProgressM / METRES_PER_WALK_XP);
  c.xpProgressM -= xp * METRES_PER_WALK_XP;
  const pet = companion(c);
  const levels = pet && xp > 0 ? grantPetXp(pet, xp) : 0;
  return { seals, levels };
}
