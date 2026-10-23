import type { Rng } from './rng';
import type { Element, Species } from './species';
import { damage, effectiveness, individualFromSeed, statsAt } from './stats';

export interface Fighter {
  species: Species;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  /** The owned pet's uid, for party members. */
  uid?: string;
}

export function makeFighter(species: Species, level: number, seed: number, uid?: string): Fighter {
  const stats = statsAt(species.base, level, individualFromSeed(seed, species.kind).trait);
  return { species, level, maxHp: stats.hp, hp: stats.hp, atk: stats.atk, def: stats.def, uid };
}

export type Side = 'pet' | 'foe';
export type Attack = 'strike' | 'move';
export type SpellId = 'fireball' | 'mending';

export type Action =
  | { kind: Attack; /** 0..1 from the timing ring; 1 is a perfect tap. */ quality?: number }
  | { kind: 'swap'; to: number }
  | { kind: 'tonic' }
  | { kind: 'spell'; spell: SpellId };

export type BattleEvent =
  | { kind: 'hit'; attacker: Side; action: Attack; name: string; damage: number; effectiveness: number; crit: boolean }
  | { kind: 'swap'; to: number }
  | { kind: 'heal'; targets: number[]; amount: number; source: 'tonic' | 'mending' }
  | { kind: 'fireball'; damage: number }
  | { kind: 'faint'; index: number };

/** Element moves charge up: usable once every this many turns. */
export const MOVE_COOLDOWN = 3;
const MOVE_POWER = 1.5;
/** Timing quality at or above this lands a critical hit. */
export const CRIT_QUALITY = 0.82;
const FOE_CRIT_CHANCE = 0.08;
export const PARTY_SIZE = 3;
export const TONIC_HEAL = 0.5;
export const MENDING_HEAL = 0.35;

/** Wayfarer spells, charged by walking since the last time they were cast. */
export const SPELLS: Record<SpellId, { name: string; metres: number; blurb: string }> = {
  fireball: { name: 'Fireball', metres: 300, blurb: 'Hurls fire that ignores defence.' },
  mending: { name: 'Mending', metres: 500, blurb: 'Heals the whole party.' },
};

export const fireballDamage = (wayfarerLevel: number) => 18 + 4 * wayfarerLevel;

/** Monsters hit a little softer when the pet's element is what they are weak to. */
function foeEffectiveness(foe: Species, pet: Species): number {
  return foe.kind === 'monster' && pet.element === foe.weakTo ? 0.75 : 1;
}

export interface BattleOptions {
  rng?: Rng;
  wayfarerLevel?: number;
  /** Gear multipliers on the party's attack (and Fireball) and health. */
  petDamage?: number;
  petHealth?: number;
}

/**
 * A turn-based fight between a party of up to three pets and one Blotspawn. Each turn
 * the active pet attacks, swaps out, drinks a tonic or the Wayfarer casts a spell, and
 * the foe answers. A fainted pet must be swapped for a standing one.
 */
export class Battle {
  /** Turns until the active pet's element move is ready. */
  charge = 0;
  private foeCharge = 1;
  active = 0;
  winner: Side | null = null;
  /** Party members that took part, for sharing experience. */
  readonly fought = new Set<number>([0]);
  private readonly rng: Rng;
  private readonly wayfarerLevel: number;
  private readonly petDamage: number;

  constructor(
    readonly party: Fighter[],
    readonly foe: Fighter,
    { rng = Math.random, wayfarerLevel = 1, petDamage = 1, petHealth = 1 }: BattleOptions = {},
  ) {
    this.rng = rng;
    this.wayfarerLevel = wayfarerLevel;
    this.petDamage = petDamage;
    for (const f of party) {
      f.atk = Math.round(f.atk * petDamage);
      const full = f.hp === f.maxHp;
      f.maxHp = Math.round(f.maxHp * petHealth);
      if (full) f.hp = f.maxHp;
    }
  }

  get fireball(): number {
    return Math.round(fireballDamage(this.wayfarerLevel) * this.petDamage);
  }

  get pet(): Fighter {
    return this.party[this.active];
  }

  get moveReady(): boolean {
    return this.charge === 0;
  }

  /** True when the active pet has fainted and another must be sent in. */
  get mustSwap(): boolean {
    return !this.winner && this.pet.hp <= 0;
  }

  canSwapTo(index: number): boolean {
    return index !== this.active && (this.party[index]?.hp ?? 0) > 0;
  }

  private attack(from: Fighter, to: Fighter, side: Side, action: Attack, quality: number, moveElement: Element): BattleEvent {
    const eff = action === 'move' ? (side === 'pet' ? effectiveness(moveElement, to.species) : foeEffectiveness(from.species, to.species)) : 1;
    const crit = side === 'pet' ? quality >= CRIT_QUALITY : this.rng() < FOE_CRIT_CHANCE;
    // A well-timed tap also nudges damage up; a missed one still lands.
    const timing = side === 'pet' ? 0.85 + 0.15 * Math.min(1, quality / CRIT_QUALITY) : 1;
    const dmg = Math.max(1, Math.round(damage(from.atk, to.def, action === 'move' ? MOVE_POWER : 1, eff, this.rng(), crit) * timing));
    to.hp = Math.max(0, to.hp - dmg);
    return { kind: 'hit', attacker: side, action, name: action === 'move' ? from.species.move : 'Strike', damage: dmg, effectiveness: eff, crit };
  }

  private heal(targets: number[], fraction: number, source: 'tonic' | 'mending'): BattleEvent {
    let amount = 0;
    for (const i of targets) {
      const f = this.party[i];
      const add = Math.min(f.maxHp - f.hp, Math.round(f.maxHp * fraction));
      f.hp += add;
      amount += add;
    }
    return { kind: 'heal', targets, amount, source };
  }

  private checkFoeDown(events: BattleEvent[]): boolean {
    if (this.foe.hp > 0) return false;
    this.winner = 'pet';
    return events.length > 0;
  }

  /** Resolves one player action and the foe's answer. */
  turn(action: Action): BattleEvent[] {
    if (this.winner) return [];
    const events: BattleEvent[] = [];

    // A fainted pet can only be replaced, and replacing it is free.
    if (this.mustSwap) {
      if (action.kind !== 'swap' || !this.canSwapTo(action.to)) return [];
      this.active = action.to;
      this.fought.add(action.to);
      this.charge = 0;
      return [{ kind: 'swap', to: action.to }];
    }

    switch (action.kind) {
      case 'strike':
      case 'move': {
        const kind = action.kind === 'move' && !this.moveReady ? 'strike' : action.kind;
        events.push(this.attack(this.pet, this.foe, 'pet', kind, action.quality ?? 0.5, this.pet.species.element));
        this.charge = kind === 'move' ? MOVE_COOLDOWN - 1 : Math.max(0, this.charge - 1);
        break;
      }
      case 'swap':
        if (!this.canSwapTo(action.to)) return [];
        this.active = action.to;
        this.fought.add(action.to);
        this.charge = 0;
        events.push({ kind: 'swap', to: action.to });
        break;
      case 'tonic':
        events.push(this.heal([this.active], TONIC_HEAL, 'tonic'));
        break;
      case 'spell':
        if (action.spell === 'fireball') {
          const dmg = this.fireball;
          this.foe.hp = Math.max(0, this.foe.hp - dmg);
          events.push({ kind: 'fireball', damage: dmg });
        } else {
          const standing = this.party.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
          events.push(this.heal(standing, MENDING_HEAL, 'mending'));
        }
        break;
    }
    if (this.checkFoeDown(events)) return events;

    const foeAction: Attack = this.foeCharge === 0 ? 'move' : 'strike';
    this.foeCharge = foeAction === 'move' ? MOVE_COOLDOWN : this.foeCharge - 1;
    events.push(this.attack(this.foe, this.pet, 'foe', foeAction, 0, this.foe.species.element));
    if (this.pet.hp <= 0) {
      events.push({ kind: 'faint', index: this.active });
      if (!this.party.some((f) => f.hp > 0)) this.winner = 'foe';
    }
    return events;
  }
}

/** Experience for each pet and seals found after driving a monster off. */
export function victoryRewards(foe: Fighter): { xp: number; seals: number } {
  const rarityBonus = foe.species.rarity === 'rare' ? 1.6 : foe.species.rarity === 'uncommon' ? 1.25 : 1;
  return { xp: Math.round(14 * foe.level * rarityBonus), seals: foe.species.rarity === 'common' ? 1 : 2 };
}

/** Pets that fought share full experience; the rest of the party learns by watching, at half. */
export function shareXp(battle: Battle, xp: number): number[] {
  return battle.party.map((_, i) => (battle.fought.has(i) ? xp : Math.round(xp / 2)));
}
