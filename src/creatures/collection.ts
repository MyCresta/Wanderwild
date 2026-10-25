import { addXp, individualFromSeed, statsAt, type Encounter } from './stats';
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
  /** How well it was sketched when it was bound (from before Wildlings were befriended). */
  sketch?: string;
  /** Share of its health left after a fight (0..1) and when; it rests back to full over time. Absent means full. */
  vigor?: number;
  vigorAt?: number;
}

/** A wild Wildling walking along with the Wayfarer, deciding whether to stay. */
export interface Follower {
  spawnId: string;
  speciesId: string;
  seed: number;
  level: number;
  /** Trust needed before it joins, in metres walked together; waiting earns it too, slowly. */
  needM: number;
  walkedM: number;
  startedAt: number;
  /** When waiting last added trust. */
  tickedAt?: number;
}

export interface Collection {
  version: 1;
  pets: OwnedPet[];
  companionUid: string | null;
  /** Up to two more pets that join the companion in battle, by uid. */
  party: string[];
  /** Species met at least once, for the bestiary. */
  seen: string[];
  /** Spawn ids already caught or beaten, with when each may be forgotten. */
  cleared: Record<string, number>;
  /** Metres walked toward the companion's next walking experience. */
  xpProgressM: number;
  /** The Wildling currently walking along to see if it likes you. */
  follower?: Follower | null;
}

const KEY = 'wanderwild.bestiary';
export const METRES_PER_WALK_XP = 25;

export const STARTERS = ['bramblet', 'driftfin', 'emberkit'] as const;

export function emptyCollection(): Collection {
  return {
    version: 1,
    pets: [],
    companionUid: null,
    party: [],
    seen: [],
    cleared: {},
    xpProgressM: 0,
  };
}

export function loadCollection(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Collection {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return emptyCollection();
    const parsed = JSON.parse(raw) as Partial<Collection>;
    if (parsed.version !== 1) return emptyCollection();
    // Binding seals were retired when Wildlings started joining by walking together.
    const { seals: _seals, sealProgressM: _progress, ...rest } = parsed as Partial<Collection> & { seals?: number; sealProgressM?: number };
    return { ...emptyCollection(), ...rest };
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

/** Turns walked metres into companion experience. */
export function walkRewards(c: Collection, metres: number): { levels: number } {
  c.xpProgressM += metres;
  const xp = Math.floor(c.xpProgressM / METRES_PER_WALK_XP);
  c.xpProgressM -= xp * METRES_PER_WALK_XP;
  const pet = companion(c);
  const levels = pet && xp > 0 ? grantPetXp(pet, xp) : 0;
  return { levels };
}

/** A pet worn out to nothing is fully rested again after this long; part-hurt pets sooner. */
export const REST_FULL_MS = 60 * 60 * 1000;
/** Pets below this share of health are too worn out to fight until they rest a little. */
export const FIT_TO_FIGHT = 0.1;

/** Share of health a pet has now (0..1), counting the rest it has had since it was hurt. */
export function vigorNow(pet: OwnedPet, now = Date.now()): number {
  if (pet.vigor === undefined) return 1;
  return Math.min(1, Math.max(0, pet.vigor + (now - (pet.vigorAt ?? now)) / REST_FULL_MS));
}

export function setVigor(pet: OwnedPet, vigor: number, now = Date.now()): void {
  if (vigor >= 1) {
    delete pet.vigor;
    delete pet.vigorAt;
  } else {
    pet.vigor = Math.max(0, vigor);
    pet.vigorAt = now;
  }
}

/** Minutes until a pet is back to full health by resting. */
export function minutesToRested(pet: OwnedPet, now = Date.now()): number {
  return Math.ceil(((1 - vigorNow(pet, now)) * REST_FULL_MS) / 60_000);
}

export const fitToFight = (pet: OwnedPet, now = Date.now()) => vigorNow(pet, now) >= FIT_TO_FIGHT;

/** Health at full, before gear. */
export function petMaxHp(pet: OwnedPet): number {
  const species = getSpecies(pet.speciesId);
  return statsAt(species.base, pet.level, individualFromSeed(pet.seed, species.kind).trait).hp;
}

/** Heals a pet by a flat amount of health outside battle, e.g. with a tonic. */
export function healPet(pet: OwnedPet, amount: number, now = Date.now()): void {
  setVigor(pet, vigorNow(pet, now) + amount / petMaxHp(pet), now);
}
