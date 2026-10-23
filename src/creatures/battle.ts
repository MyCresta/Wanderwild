import { matchup } from './elements';
import { FOE_TRAITS, RANKS, type FoeTrait, type Rank } from './foes';
import type { Rng } from './rng';
import type { Element, Species } from './species';
import { damage, individualFromSeed, statsAt } from './stats';

export interface Fighter {
  species: Species;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  /** The owned pet's uid, for party members. */
  uid?: string;
  rank: Rank;
  traits: FoeTrait[];
}

export function makeFighter(
  species: Species,
  level: number,
  seed: number,
  uid?: string,
  foe: { rank?: Rank; traits?: FoeTrait[] } = {},
): Fighter {
  const stats = statsAt(species.base, level, individualFromSeed(seed, species.kind).trait);
  const rank = foe.rank ?? 'normal';
  const traits = foe.traits ?? [];
  const r = RANKS[rank];
  const maxHp = Math.round(stats.hp * r.hp * (traits.includes('thick') ? 1.35 : 1));
  const atk = Math.round(stats.atk * r.power * (traits.includes('savage') ? 1.2 : 1));
  return { species, level, maxHp, hp: maxHp, atk, def: Math.round(stats.def * r.power), uid, rank, traits };
}

export type Side = 'pet' | 'foe';
/** The three attacks every pet knows: a plain Strike, its element move, and its element's art. */
export type Attack = 'strike' | 'move' | 'art';
export type SpellId = 'fireball' | 'mending';

export type Action =
  | { kind: Attack; /** 0..1 from the timing ring; 1 is a perfect tap. */ quality?: number }
  | { kind: 'swap'; to: number }
  | { kind: 'tonic' }
  | { kind: 'spell'; spell: SpellId };

export type StatusKind = 'guard' | 'dodge' | 'focus' | 'burn' | 'ward-break';

export type BattleEvent =
  | {
      kind: 'hit';
      attacker: Side;
      action: Attack | 'big';
      name: string;
      damage: number;
      effectiveness: number;
      crit: boolean;
      /** The pet's guard soaked part of it. */
      guarded?: boolean;
      /** The foe's ward halved it. */
      warded?: boolean;
    }
  | { kind: 'miss'; name: string }
  | { kind: 'status'; target: Side; status: StatusKind; name: string }
  | { kind: 'burn'; damage: number }
  | { kind: 'reflect'; damage: number }
  | { kind: 'leech'; amount: number }
  | { kind: 'swap'; to: number }
  | { kind: 'heal'; targets: number[]; amount: number; source: 'tonic' | 'mending' | 'art' }
  | { kind: 'fireball'; damage: number }
  | { kind: 'faint'; index: number };

/** Turns between uses: the element move is ready every other turn, the art every third. */
export const MOVE_COOLDOWN = 2;
export const ART_COOLDOWN = 3;
const MOVE_POWER = 1.7;
const BIG_POWER = 1.9;
/** Scales damage so a fight takes a handful of turns, not a dozen. Foes hit a little softer. */
const PACE = 1.6;
const FOE_PACE = 1.25;
/** Timing quality at or above this lands a critical hit. */
export const CRIT_QUALITY = 0.82;
const FOE_CRIT_CHANCE = 0.06;
export const PARTY_SIZE = 3;
export const TONIC_HEAL = 0.5;
export const MENDING_HEAL = 0.35;
const BURN_TURNS = 3;
const BURN_SHARE = 0.07;
const LEECH_SHARE = 0.4;

/** Each element's art: a trick rather than a blow, so there is always a choice to make. */
export const ARTS: Record<Element, { name: string; blurb: string }> = {
  ember: { name: 'Kindle', blurb: 'A light hit that sets the foe burning for 3 turns.' },
  tide: { name: 'Wellspring', blurb: 'Heals a third of its health.' },
  grove: { name: 'Thornguard', blurb: 'Halves the next hit and throws half of it back.' },
  stone: { name: 'Bulwark', blurb: 'Takes 60% less damage for 2 turns.' },
  gale: { name: 'Updraft', blurb: 'A light hit, then dodges the next attack.' },
  lumen: { name: 'Glimmer', blurb: 'Marks the weak spot: the next attack is critical.' },
};

/** Wayfarer spells, charged by walking since the last time they were cast. */
export const SPELLS: Record<SpellId, { name: string; metres: number; blurb: string }> = {
  fireball: { name: 'Fireball', metres: 300, blurb: 'Hurls fire that ignores defence.' },
  mending: { name: 'Mending', metres: 500, blurb: 'Heals the whole party.' },
};

export const fireballDamage = (wayfarerLevel: number) => 18 + 4 * wayfarerLevel;

export interface BattleOptions {
  rng?: Rng;
  wayfarerLevel?: number;
  /** Gear multipliers on the party's attack (and Fireball) and health. */
  petDamage?: number;
  petHealth?: number;
}

/** What the foe will do on its next turn, shown above it so the player can plan. */
export interface Intent {
  big: boolean;
  name: string;
  element: Element | null;
}

interface Guard {
  turns: number;
  /** Share of damage that gets through. */
  through: number;
  /** Share of the blocked hit thrown back. */
  reflect: number;
}

/**
 * A quick turn-based fight between a party of up to three pets and one Blotspawn.
 * Each turn the active pet strikes, uses its element move or art, swaps out, drinks a
 * tonic or the Wayfarer casts a spell; then the foe answers. The foe strikes twice and
 * then unleashes a big element attack, always announced a turn ahead.
 */
export class Battle {
  /** Turns until each party member's element move and art are ready again. */
  readonly cooldowns: { move: number; art: number }[];
  active = 0;
  winner: Side | null = null;
  /** Party members that took part, for sharing experience. */
  readonly fought = new Set<number>([0]);
  guard: Guard | null = null;
  dodge = false;
  focus = false;
  burn = 0;
  /** Warded foes halve damage until hit with their weakness. */
  wardUp: boolean;
  private foeTurns = 0;
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
    this.cooldowns = party.map(() => ({ move: 0, art: 0 }));
    this.wardUp = foe.traits.includes('warded');
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

  ready(attack: Attack): boolean {
    return attack === 'strike' || this.cooldowns[this.active][attack] === 0;
  }

  get moveReady(): boolean {
    return this.ready('move');
  }

  /** True when the active pet has fainted and another must be sent in. */
  get mustSwap(): boolean {
    return !this.winner && this.pet.hp <= 0;
  }

  canSwapTo(index: number): boolean {
    return index !== this.active && (this.party[index]?.hp ?? 0) > 0;
  }

  /** How the active pet's attack would land on the foe: 1.5 strong, 0.6 weak, 1 even. */
  edge(attack: Attack, pet = this.pet): number {
    if (attack === 'strike') return 1;
    if (attack === 'art' && !hurts(pet.species.element)) return 1;
    return matchup(pet.species.element, this.foe.species.element);
  }

  /** How the foe's big attack would land on a party member. */
  threat(index: number): number {
    return matchup(this.foe.species.element, this.party[index].species.element);
  }

  get intent(): Intent {
    const every = this.foe.traits.includes('swift') ? 2 : 3;
    const big = this.foeTurns % every === every - 1;
    return big ? { big, name: this.foe.species.move, element: this.foe.species.element } : { big, name: 'Strike', element: null };
  }

  private petHit(action: Attack, power: number, quality: number): BattleEvent[] {
    const pet = this.pet;
    const elemental = action !== 'strike';
    let eff = elemental ? matchup(pet.species.element, this.foe.species.element) : 1;
    const crit = this.focus || (action === 'move' && quality >= CRIT_QUALITY);
    this.focus = false;
    // A well-timed tap also nudges damage up; a missed one still lands.
    const timing = action === 'move' ? 0.85 + 0.15 * Math.min(1, quality / CRIT_QUALITY) : 1;
    const events: BattleEvent[] = [];
    let warded = false;
    if (this.wardUp) {
      if (eff > 1) {
        this.wardUp = false;
        events.push({ kind: 'status', target: 'foe', status: 'ward-break', name: FOE_TRAITS.warded.name });
      } else {
        warded = true;
        eff *= 0.5;
      }
    }
    const dmg = Math.max(1, Math.round(damage(pet.atk, this.foe.def, power, eff, this.rng(), crit) * timing * PACE));
    this.foe.hp = Math.max(0, this.foe.hp - dmg);
    const name = action === 'move' ? pet.species.move : action === 'art' ? ARTS[pet.species.element].name : 'Strike';
    events.unshift({ kind: 'hit', attacker: 'pet', action, name, damage: dmg, effectiveness: elemental ? matchup(pet.species.element, this.foe.species.element) : 1, crit, warded });
    return events;
  }

  private useArt(): BattleEvent[] {
    const pet = this.pet;
    const element = pet.species.element;
    const name = ARTS[element].name;
    switch (element) {
      case 'ember': {
        const events = this.petHit('art', 0.6, 0);
        this.burn = BURN_TURNS;
        return [...events, { kind: 'status', target: 'foe', status: 'burn', name }];
      }
      case 'gale': {
        const events = this.petHit('art', 0.6, 0);
        this.dodge = true;
        return [...events, { kind: 'status', target: 'pet', status: 'dodge', name }];
      }
      case 'tide': {
        const add = Math.min(pet.maxHp - pet.hp, Math.round(pet.maxHp / 3));
        pet.hp += add;
        return [{ kind: 'heal', targets: [this.active], amount: add, source: 'art' }];
      }
      case 'grove':
        this.guard = { turns: 1, through: 0.5, reflect: 0.5 };
        return [{ kind: 'status', target: 'pet', status: 'guard', name }];
      case 'stone':
        this.guard = { turns: 2, through: 0.4, reflect: 0 };
        return [{ kind: 'status', target: 'pet', status: 'guard', name }];
      case 'lumen':
        this.focus = true;
        return [{ kind: 'status', target: 'pet', status: 'focus', name }];
    }
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

  private swapTo(index: number): BattleEvent {
    this.active = index;
    this.fought.add(index);
    // Guards and dodges belong to the pet that raised them.
    this.guard = null;
    this.dodge = false;
    return { kind: 'swap', to: index };
  }

  private foeDown(): boolean {
    if (this.foe.hp > 0) return false;
    this.winner = 'pet';
    return true;
  }

  private foeAttack(): BattleEvent[] {
    const intent = this.intent;
    this.foeTurns++;
    const pet = this.pet;
    if (this.dodge) {
      this.dodge = false;
      return [{ kind: 'miss', name: intent.name }];
    }
    const eff = intent.element ? matchup(intent.element, pet.species.element) : 1;
    const crit = this.rng() < FOE_CRIT_CHANCE;
    const raw = Math.max(1, Math.round(damage(this.foe.atk, pet.def, intent.big ? BIG_POWER : 1, eff, this.rng(), crit) * FOE_PACE));
    const guard = this.guard;
    const dmg = guard ? Math.max(1, Math.round(raw * guard.through)) : raw;
    pet.hp = Math.max(0, pet.hp - dmg);
    const events: BattleEvent[] = [
      { kind: 'hit', attacker: 'foe', action: intent.big ? 'big' : 'strike', name: intent.name, damage: dmg, effectiveness: eff, crit, guarded: !!guard },
    ];
    if (guard) {
      if (guard.reflect > 0) {
        const back = Math.max(1, Math.round((raw - dmg) * guard.reflect));
        this.foe.hp = Math.max(0, this.foe.hp - back);
        events.push({ kind: 'reflect', damage: back });
      }
      if (--guard.turns <= 0) this.guard = null;
    }
    if (this.foe.traits.includes('leeching') && this.foe.hp > 0) {
      const amount = Math.min(this.foe.maxHp - this.foe.hp, Math.round(dmg * LEECH_SHARE));
      if (amount > 0) {
        this.foe.hp += amount;
        events.push({ kind: 'leech', amount });
      }
    }
    return events;
  }

  /** Resolves one player action and the foe's answer. */
  turn(action: Action): BattleEvent[] {
    if (this.winner) return [];
    const events: BattleEvent[] = [];

    // A fainted pet can only be replaced, and replacing it is free.
    if (this.mustSwap) {
      if (action.kind !== 'swap' || !this.canSwapTo(action.to)) return [];
      return [this.swapTo(action.to)];
    }

    const cd = this.cooldowns[this.active];
    switch (action.kind) {
      case 'strike':
      case 'move':
      case 'art': {
        const kind = this.ready(action.kind) ? action.kind : 'strike';
        if (kind === 'art') events.push(...this.useArt());
        else events.push(...this.petHit(kind, kind === 'move' ? MOVE_POWER : 1, action.quality ?? 0.5));
        this.tick();
        if (kind === 'move') cd.move = MOVE_COOLDOWN;
        if (kind === 'art') cd.art = ART_COOLDOWN;
        break;
      }
      case 'swap':
        if (!this.canSwapTo(action.to)) return [];
        events.push(this.swapTo(action.to));
        this.tick();
        break;
      case 'tonic':
        events.push(this.heal([this.active], TONIC_HEAL, 'tonic'));
        this.tick();
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
        this.tick();
        break;
    }
    if (this.foeDown()) return events;

    if (this.burn > 0) {
      this.burn--;
      const dmg = Math.max(1, Math.round(this.foe.maxHp * BURN_SHARE));
      this.foe.hp = Math.max(0, this.foe.hp - dmg);
      events.push({ kind: 'burn', damage: dmg });
      if (this.foeDown()) return events;
    }

    events.push(...this.foeAttack());
    if (this.foeDown()) return events;
    if (this.pet.hp <= 0) {
      events.push({ kind: 'faint', index: this.active });
      if (!this.party.some((f) => f.hp > 0)) this.winner = 'foe';
    }
    return events;
  }

  /** A turn passes for every pet's cooldowns. */
  private tick(): void {
    for (const cd of this.cooldowns) {
      cd.move = Math.max(0, cd.move - 1);
      cd.art = Math.max(0, cd.art - 1);
    }
  }
}

/** Arts that deal damage, and so care about the wheel. */
const hurts = (e: Element) => e === 'ember' || e === 'gale';

const RANK_REWARD: Record<Rank, { xp: number; seals: number }> = {
  normal: { xp: 1, seals: 1 },
  rare: { xp: 1.6, seals: 2 },
  elite: { xp: 2.6, seals: 4 },
};

/** Experience for each pet and seals found after driving a monster off. */
export function victoryRewards(foe: Fighter): { xp: number; seals: number } {
  const rarityBonus = foe.species.rarity === 'rare' ? 1.6 : foe.species.rarity === 'uncommon' ? 1.25 : 1;
  const rank = RANK_REWARD[foe.rank];
  return {
    xp: Math.round(14 * foe.level * rarityBonus * rank.xp),
    seals: rank.seals + (foe.species.rarity === 'common' ? 0 : 1),
  };
}

/** Pets that fought share full experience; the rest of the party learns by watching, at half. */
export function shareXp(battle: Battle, xp: number): number[] {
  return battle.party.map((_, i) => (battle.fought.has(i) ? xp : Math.round(xp / 2)));
}
