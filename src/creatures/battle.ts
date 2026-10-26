import { beatenBy, matchup } from './elements';
import { HERO_SPELLS, type HeroPower, type HeroSpellId } from '../game/hero';
import { FOE_TRAITS, foeScale, type FoeTrait, type Rank } from './foes';
import { getMove, type Move } from './moves';
import type { Rng } from './rng';
import { signature, type Element, type Species } from './species';
import { damage, statsAt } from './stats';

export interface Fighter {
  species: Species;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  /** Speed: the faster side attacks first each turn. */
  spd: number;
  /** The owned pet's uid, for party members. */
  uid?: string;
  rank: Rank;
  /** Elite tier 1-3 or boss tier 1-5. */
  tier: number;
  traits: FoeTrait[];
}

export function makeFighter(
  species: Species,
  level: number,
  // Every Wildling of a kind fights the same now; the seed only sets its look.
  _seed: number,
  uid?: string,
  foe: { rank?: Rank; tier?: number; traits?: FoeTrait[] } = {},
): Fighter {
  const stats = statsAt(species.base, level);
  const rank = foe.rank ?? 'normal';
  const tier = foe.tier ?? 1;
  const traits = foe.traits ?? [];
  const r = foeScale(rank, tier, level);
  const maxHp = Math.round(stats.hp * r.hp * (traits.includes('thick') ? 1.35 : 1));
  const atk = Math.round(stats.atk * r.power * (traits.includes('savage') ? 1.2 : 1));
  const spd = Math.round(stats.spd * (traits.includes('swift') ? SWIFT_SPEED : 1));
  return { species, level, maxHp, hp: maxHp, atk, def: Math.round(stats.def * r.power), spd, uid, rank, tier, traits };
}

/** The name of a foe's telegraphed big attack. */
const bigMoveName = (s: Species) => (s.kind === 'monster' ? s.move : signature(s).name);

/** A Swift foe is quicker on its feet as well as with its big attack. */
const SWIFT_SPEED = 1.25;

/** The moves a fighter knows. Foes only Strike and telegraph a big attack, so they have none. */
export const movesOf = (f: Fighter): Move[] => (f.species.kind === 'pet' ? f.species.moves.map(getMove) : []);

export type Side = 'pet' | 'foe';

export type Action =
  /** One of the active Wildling's three moves, by slot. */
  | { kind: 'attack'; slot: number; /** 0..1 from the timing sweep; 1 is a perfect tap. */ quality?: number }
  | { kind: 'swap'; to: number }
  | { kind: 'tonic' };

export type StatusKind = 'guard' | 'dodge' | 'focus' | 'burn' | 'ward-break' | 'hex' | 'howl';

/** Everyone's health right after an event, so the screen can show each blow as it lands. */
export interface HpSnap {
  foe: number;
  party: number[];
}

export type BattleEvent = (
  | {
      kind: 'hit';
      attacker: Side;
      name: string;
      /** The move's element, or null for a plain blow. */
      element: Element | null;
      /** The foe's telegraphed big attack. */
      big?: boolean;
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
  | { kind: 'heal'; targets: number[]; amount: number; source: 'tonic' | 'art' | 'drain' }
  /** The hero's spell: damage to the foe, health back to `targets`, or neither for a blessing or curse. */
  | { kind: 'spell'; spell: HeroSpellId; damage?: number; amount?: number; targets?: number[] }
  | { kind: 'faint'; index: number }
  /** A rival's next Wildling steps in after the last one fell. */
  | { kind: 'foe-in'; index: number }
) & { hp?: HpSnap };

const BIG_POWER = 1.9;
/** Scales damage so a fight takes a handful of turns, not a dozen. Foes hit a little softer. */
const PACE = 1.6;
const FOE_PACE = 1;
/** Timing quality at or above this lands a critical hit. */
export const CRIT_QUALITY = 0.82;
const FOE_CRIT_CHANCE = 0.06;
export const PARTY_SIZE = 3;
/** A tonic heals a set amount of health; upgrades raise it through `tonicPower`. */
export const TONIC_HEAL = 35;
export const MENDING_HEAL = 0.2;
const HEX_TURNS = 3;
const HEX_SOFTEN = 0.7;
const HOWL_TURNS = 3;
const HOWL_POWER = 1.3;
const WHEELBOLT_POWER = 1.1;
const STARFALL_POWER = 2.2;
const BURN_TURNS = 3;
const BURN_SHARE = 0.07;
const LEECH_SHARE = 0.4;
const DRAIN_SHARE = 0.5;
const HEAL_SHARE = 1 / 3;

export interface BattleOptions {
  rng?: Rng;
  /** Gear multipliers on the party's attack and health. */
  petDamage?: number;
  petHealth?: number;
  /** The hero fighting beside the party: stat boosts, talents and spells. */
  hero?: HeroPower;
  /** Share of health each party member starts with (0..1), from lasting damage. Full when absent. */
  vigor?: number[];
  /** Multiplier on what a tonic heals, for upgrades. */
  tonicPower?: number;
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
 * A quick turn-based fight between a party of up to three pets and one Blotspawn, or a
 * rival's line of foes who step in one after another.
 * Each turn the hero may cast one spell, then the active pet strikes, uses its element
 * move or art, swaps out or drinks a tonic; then the foe answers. The foe strikes twice and
 * then unleashes a big element attack, always announced a turn ahead.
 */
export class Battle {
  /** Turns until each of each party member's moves is ready again, by slot. */
  readonly cooldowns: number[][];
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
  /** Foe turns left under a Hex, and party turns left under a Pack Howl. */
  hex = 0;
  howl = 0;
  /** The hero has cast this turn; one spell per turn. */
  cast = false;
  readonly hero: HeroPower | undefined;
  private foeTurns = 0;
  /** Whether the opening has been played: a faster foe's first strike. */
  private started = false;
  /** Whether the player has taken a first action yet. */
  private opened = false;
  private readonly rng: Rng;
  readonly tonicHeal: number;
  /** Every foe in the fight, in the order they step in. */
  readonly foes: Fighter[];
  /** The foe facing the party now. */
  foe: Fighter;
  foeIndex = 0;

  constructor(
    readonly party: Fighter[],
    foes: Fighter | Fighter[],
    { rng = Math.random, petDamage = 1, petHealth = 1, hero, vigor, tonicPower = 1 }: BattleOptions = {},
  ) {
    this.rng = rng;
    this.hero = hero;
    this.foes = Array.isArray(foes) ? foes : [foes];
    this.foe = this.foes[0];
    this.tonicHeal = Math.round(TONIC_HEAL * tonicPower);
    this.cooldowns = party.map(() => [0, 0, 0]);
    this.wardUp = this.foe.traits.includes('warded');
    const damage = petDamage * (hero?.damage ?? 1);
    const health = petHealth * (hero?.health ?? 1);
    for (const f of party) {
      f.atk = Math.round(f.atk * damage);
      const full = f.hp === f.maxHp;
      f.maxHp = Math.round(f.maxHp * health);
      if (full) f.hp = f.maxHp;
    }
    if (hero?.openingGuard) this.guard = { turns: 1, through: 0.5, reflect: 0 };
    vigor?.forEach((v, i) => {
      const f = party[i];
      if (f) f.hp = Math.max(0, Math.min(f.maxHp, Math.round(f.maxHp * v)));
    });
    // Lead with the first pet still standing.
    const first = party.findIndex((f) => f.hp > 0);
    if (first > 0) {
      this.active = first;
      this.fought.clear();
      this.fought.add(first);
    }
  }

  /** Share of health each party member has left (0..1), to carry over to the next fight. */
  vigorLeft(): number[] {
    return this.party.map((f) => f.hp / f.maxHp);
  }

  /** A boss below half health is enraged: its big attack comes a turn sooner. */
  get enraged(): boolean {
    return this.foe.rank === 'boss' && this.foe.hp * 2 < this.foe.maxHp;
  }

  /** The timing quality a crit needs; Beastcaller talents widen the mark. */
  get critAt(): number {
    return CRIT_QUALITY - (this.hero?.critEase ?? 0);
  }

  /** Turns a move rests after use; Quick Arts talents shorten the slow ones. */
  waitFor(move: Move): number {
    return move.wait >= 3 ? Math.max(2, move.wait - (this.hero?.artHaste ?? 0)) : move.wait;
  }

  /** Whether the party's Wildling in front attacks before the foe this turn. Ties go to the party. */
  get petFirst(): boolean {
    return this.pet.spd >= this.foe.spd;
  }

  /**
   * What a damage spell deals now. It is drawn from the pet in front's strength, so the
   * hero's magic grows with the party instead of outpacing every foe.
   */
  spellDamage(spell: HeroSpellId): number {
    const eff = spell === 'starfall' ? 1 : matchup(beatenBy(this.foe.species.element), this.foe.species.element);
    const power = spell === 'starfall' ? STARFALL_POWER : WHEELBOLT_POWER;
    return Math.round(damage(this.pet.atk, this.foe.def, power, eff, 0.5, false) * PACE * (this.hero?.spellPower ?? 1));
  }

  /** True when the hero could cast this spell right now (mana aside). */
  canCast(spell: HeroSpellId): boolean {
    if (this.winner || this.cast || this.mustSwap || !this.hero?.spells.includes(spell)) return false;
    const pet = this.pet;
    if (spell === 'secondWind') return pet.hp < pet.maxHp;
    if (spell === 'mending') return this.party.some((f) => f.hp > 0 && f.hp < f.maxHp);
    if (spell === 'wildcall') return this.cooldowns[this.active].some((w) => w > 0);
    return true;
  }

  /**
   * The hero's spell for this turn. It costs no turn: the pet still acts after it, and the
   * foe does not answer the spell itself.
   */
  castSpell(spell: HeroSpellId): BattleEvent[] {
    if (!this.canCast(spell)) return [];
    this.cast = true;
    const power = (this.hero?.spellPower ?? 1) * (this.hero?.healing ?? 1);
    const name = HERO_SPELLS[spell].name;
    const events: BattleEvent[] = [];
    switch (spell) {
      case 'mending': {
        const targets = this.party.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
        const amount = this.restore(targets, (f) => f.maxHp * MENDING_HEAL * power);
        events.push(this.snap({ kind: 'spell', spell, amount, targets }));
        break;
      }
      case 'secondWind': {
        const amount = this.restore([this.active], (f) => f.maxHp);
        events.push(this.snap({ kind: 'spell', spell, amount, targets: [this.active] }));
        break;
      }
      case 'aegis':
        this.guard = { turns: 2, through: 0.5, reflect: 0 };
        events.push({ kind: 'spell', spell }, { kind: 'status', target: 'pet', status: 'guard', name });
        break;
      case 'wheelbolt':
      case 'starfall': {
        const dmg = this.spellDamage(spell);
        this.foe.hp = Math.max(0, this.foe.hp - dmg);
        events.push(this.snap({ kind: 'spell', spell, damage: dmg }));
        // Wheelbolt always strikes the weakness, so it shatters a ward.
        if (spell === 'wheelbolt' && this.wardUp) {
          this.wardUp = false;
          events.push({ kind: 'status', target: 'foe', status: 'ward-break', name: FOE_TRAITS.warded.name });
        }
        this.foeDown(events);
        break;
      }
      case 'hex':
        this.hex = HEX_TURNS;
        events.push({ kind: 'spell', spell }, { kind: 'status', target: 'foe', status: 'hex', name });
        break;
      case 'frenzy':
        this.focus = true;
        events.push({ kind: 'spell', spell }, { kind: 'status', target: 'pet', status: 'focus', name });
        break;
      case 'wildcall':
        this.cooldowns[this.active] = [0, 0, 0];
        events.push({ kind: 'spell', spell });
        break;
      case 'packHowl':
        this.howl = HOWL_TURNS;
        events.push({ kind: 'spell', spell }, { kind: 'status', target: 'pet', status: 'howl', name });
        break;
    }
    return events;
  }

  /** Gives health back to party members, capped at full. Returns the total restored. */
  private restore(targets: number[], amount: (f: Fighter) => number): number {
    let total = 0;
    for (const i of targets) {
      const f = this.party[i];
      const add = Math.min(f.maxHp - f.hp, Math.round(amount(f)));
      f.hp += add;
      total += add;
    }
    return total;
  }

  /** Stamps an event with everyone's health as it stands now. */
  private snap<E extends BattleEvent>(e: E): E {
    return { ...e, hp: { foe: this.foe.hp, party: this.party.map((f) => f.hp) } };
  }

  get pet(): Fighter {
    return this.party[this.active];
  }

  /** The active Wildling's moves, by slot. */
  get moves(): Move[] {
    return movesOf(this.pet);
  }

  ready(slot: number): boolean {
    return slot >= 0 && slot < this.moves.length && this.cooldowns[this.active][slot] === 0;
  }

  /** True when the active pet has fainted and another must be sent in. */
  /** Before the first action, sending in someone else costs no turn: see the foe, then pick who opens. */
  get freeSwap(): boolean {
    return !this.opened && !this.winner;
  }

  get mustSwap(): boolean {
    return !this.winner && this.pet.hp <= 0;
  }

  canSwapTo(index: number): boolean {
    return index !== this.active && (this.party[index]?.hp ?? 0) > 0;
  }

  /** How a move would land on the foe: 1.5 strong, 0.6 weak, 1 even or no damage. */
  edge(move: Move): number {
    return move.element && move.power > 0 ? matchup(move.element, this.foe.species.element) : 1;
  }

  /** The best edge any of a fighter's damaging moves has on the foe, for the party bench. */
  bestEdge(f: Fighter): number {
    return Math.max(1, ...movesOf(f).map((m) => this.edge(m)));
  }

  /** How the foe's big attack would land on a party member. */
  threat(index: number): number {
    return matchup(this.foe.species.element, this.party[index].species.element);
  }

  get intent(): Intent {
    const every = Math.max(2, (this.foe.traits.includes('swift') ? 2 : 3) - (this.enraged ? 1 : 0));
    const big = this.foeTurns % every === every - 1;
    return big ? { big, name: bigMoveName(this.foe.species), element: this.foe.species.element } : { big, name: 'Strike', element: null };
  }

  private petHit(move: Move, quality: number): BattleEvent[] {
    const pet = this.pet;
    const fullEff = move.element ? matchup(move.element, this.foe.species.element) : 1;
    let eff = fullEff;
    const crit = this.focus || quality >= this.critAt;
    this.focus = false;
    // A well-timed tap also nudges damage up; a missed one still lands.
    const timing = 0.85 + 0.15 * Math.min(1, quality / this.critAt);
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
    const howl = this.howl > 0 ? HOWL_POWER : 1;
    const dmg = Math.max(1, Math.round(damage(pet.atk, this.foe.def, move.power, eff, this.rng(), crit) * timing * howl * PACE));
    this.foe.hp = Math.max(0, this.foe.hp - dmg);
    events.unshift(this.snap({ kind: 'hit', attacker: 'pet', name: move.name, element: move.element, damage: dmg, effectiveness: fullEff, crit, warded }));
    if (move.effect === 'drain') {
      const amount = Math.min(pet.maxHp - pet.hp, Math.round(dmg * DRAIN_SHARE));
      if (amount > 0) {
        pet.hp += amount;
        events.push(this.snap({ kind: 'heal', targets: [this.active], amount, source: 'drain' }));
      }
    }
    return events;
  }

  /** The active Wildling uses a move: its blow, if it has one, then its trick. */
  private useMove(move: Move, quality: number): BattleEvent[] {
    const events = move.power > 0 ? this.petHit(move, quality) : [];
    const pet = this.pet;
    const name = move.name;
    switch (move.effect) {
      case 'burn':
        this.burn = BURN_TURNS;
        events.push({ kind: 'status', target: 'foe', status: 'burn', name });
        break;
      case 'dodge':
        this.dodge = true;
        events.push({ kind: 'status', target: 'pet', status: 'dodge', name });
        break;
      case 'heal': {
        const add = Math.min(pet.maxHp - pet.hp, Math.round(pet.maxHp * HEAL_SHARE));
        pet.hp += add;
        events.push(this.snap({ kind: 'heal', targets: [this.active], amount: add, source: 'art' }));
        break;
      }
      case 'thorns':
        this.guard = { turns: 2, through: 0.5, reflect: 0.5 };
        events.push({ kind: 'status', target: 'pet', status: 'guard', name });
        break;
      case 'bulwark':
        this.guard = { turns: 2, through: 0.3, reflect: 0 };
        events.push({ kind: 'status', target: 'pet', status: 'guard', name });
        break;
      case 'focus':
        this.focus = true;
        events.push({ kind: 'status', target: 'pet', status: 'focus', name });
        break;
    }
    return events;
  }

  /** Heals each target by a share of its health, or by a flat amount when `flat` is given. */
  private heal(targets: number[], fraction: number, source: 'tonic', flat?: number): BattleEvent {
    let amount = 0;
    for (const i of targets) {
      const f = this.party[i];
      const add = Math.min(f.maxHp - f.hp, flat ?? Math.round(f.maxHp * fraction));
      f.hp += add;
      amount += add;
    }
    return this.snap({ kind: 'heal', targets, amount, source });
  }

  private swapTo(index: number): BattleEvent {
    this.active = index;
    this.fought.add(index);
    // Guards and dodges belong to the pet that raised them.
    this.guard = null;
    this.dodge = false;
    return { kind: 'swap', to: index };
  }

  /** True when the foe has fallen, which ends the turn; a rival's next foe steps in if there is one. */
  private foeDown(events: BattleEvent[]): boolean {
    if (this.foe.hp > 0) return false;
    if (this.foeIndex + 1 >= this.foes.length) {
      this.winner = 'pet';
      return true;
    }
    this.foeIndex++;
    this.foe = this.foes[this.foeIndex];
    // Burns, hexes and the big-attack rhythm belong to the foe that fell.
    this.burn = 0;
    this.hex = 0;
    this.foeTurns = 0;
    this.wardUp = this.foe.traits.includes('warded');
    events.push(this.snap({ kind: 'foe-in', index: this.foeIndex }));
    return true;
  }

  /** Foes still to step in after the current one. */
  get foesLeft(): number {
    return this.foes.length - this.foeIndex - 1;
  }

  private foeAttack(): BattleEvent[] {
    if (this.foe.hp <= 0) return [];
    const intent = this.intent;
    this.foeTurns++;
    const pet = this.pet;
    if (this.dodge) {
      this.dodge = false;
      return [{ kind: 'miss', name: intent.name }];
    }
    const eff = intent.element ? matchup(intent.element, pet.species.element) : 1;
    const crit = this.rng() < FOE_CRIT_CHANCE;
    const soften = this.hex > 0 ? HEX_SOFTEN : 1;
    if (this.hex > 0) this.hex--;
    const raw = Math.max(1, Math.round(damage(this.foe.atk, pet.def, intent.big ? BIG_POWER : 1, eff, this.rng(), crit) * soften * FOE_PACE));
    const guard = this.guard;
    const dmg = guard ? Math.max(1, Math.round(raw * guard.through)) : raw;
    pet.hp = Math.max(0, pet.hp - dmg);
    const events: BattleEvent[] = [
      this.snap({ kind: 'hit', attacker: 'foe', name: intent.name, element: intent.element, big: intent.big, damage: dmg, effectiveness: eff, crit, guarded: !!guard }),
    ];
    if (guard) {
      if (guard.reflect > 0) {
        const back = Math.max(1, Math.round((raw - dmg) * guard.reflect));
        this.foe.hp = Math.max(0, this.foe.hp - back);
        events.push(this.snap({ kind: 'reflect', damage: back }));
      }
      if (--guard.turns <= 0) this.guard = null;
    }
    if (this.foe.traits.includes('leeching') && this.foe.hp > 0) {
      const amount = Math.min(this.foe.maxHp - this.foe.hp, Math.round(dmg * LEECH_SHARE));
      if (amount > 0) {
        this.foe.hp += amount;
        events.push(this.snap({ kind: 'leech', amount }));
      }
    }
    return events;
  }

  /**
   * Resolves one player action and the foe's answer. Speed decides who attacks first; swaps
   * and tonics always come before the foe. Burns tick at the end of the turn.
   */
  turn(action: Action): BattleEvent[] {
    if (this.winner) return [];
    const events: BattleEvent[] = [];

    // A fainted pet can only be replaced, and replacing it is free. So is choosing who opens.
    if (this.mustSwap || (this.freeSwap && action.kind === 'swap')) {
      if (action.kind !== 'swap' || !this.canSwapTo(action.to)) return [];
      // Who opens has not fought yet; the one sent back only watches.
      const fresh = this.mustSwap;
      if (this.freeSwap) this.fought.delete(this.active);
      events.push(this.swapTo(action.to));
      // A Wildling sent in after a faint starts a new round: a faster foe strikes it at once.
      if (fresh) this.roundStart(events);
      return events;
    }
    if (action.kind === 'attack' && !this.ready(action.slot)) return [];
    if (action.kind === 'swap' && !this.canSwapTo(action.to)) return [];
    this.opened = true;

    switch (action.kind) {
      case 'attack': {
        const move = this.moves[action.slot];
        events.push(...this.useMove(move, action.quality ?? 0.5));
        this.tick();
        this.cooldowns[this.active][action.slot] = this.waitFor(move);
        break;
      }
      case 'swap':
        events.push(this.swapTo(action.to));
        this.tick();
        break;
      case 'tonic':
        events.push(this.heal([this.active], 0, 'tonic', this.tonicHeal));
        this.tick();
        break;
    }
    this.cast = false;
    if (this.foeDown(events)) return this.newFoe(events);

    events.push(...this.foeAttack());
    if (this.foeDown(events)) return this.newFoe(this.endTurn(events));
    this.fainted(events);
    return this.newFoe(this.endTurn(events));
  }

  /**
   * The start of the fight. A foe faster than the Wildling in front strikes before the first
   * move is chosen, so the player always sees the faster side's blow before deciding.
   */
  open(): BattleEvent[] {
    if (this.started) return [];
    this.started = true;
    const events: BattleEvent[] = [];
    this.roundStart(events);
    return events;
  }

  /**
   * A new round with a new pairing (the fight opening, a Wildling sent in after a faint, a
   * rival's next foe): a faster foe strikes at once. Otherwise the party's Wildling acts first,
   * and each turn after that is the party's move and then the foe's answer.
   */
  private roundStart(events: BattleEvent[]): void {
    if (this.winner || this.petFirst || this.pet.hp <= 0 || this.foe.hp <= 0) return;
    events.push(...this.foeAttack());
    if (this.foeDown(events)) return;
    this.fainted(events);
  }

  /** After a rival's next foe steps in, a faster one strikes straight away. */
  private newFoe(events: BattleEvent[]): BattleEvent[] {
    if (events.some((e) => e.kind === 'foe-in')) this.roundStart(events);
    return events;
  }

  /** True when the Wildling in front has just fallen; ends the fight if nobody is left. */
  private fainted(events: BattleEvent[]): boolean {
    if (this.pet.hp > 0) return false;
    events.push({ kind: 'faint', index: this.active });
    if (!this.party.some((f) => f.hp > 0)) this.winner = 'foe';
    return true;
  }

  /** The end of a turn: a burning foe smoulders, and a turn the pet lost still passes. */
  private endTurn(events: BattleEvent[]): BattleEvent[] {
    this.cast = false;
    if (this.winner) return events;
    if (this.burn > 0 && this.foe.hp > 0) {
      this.burn--;
      const dmg = Math.max(1, Math.round(this.foe.maxHp * BURN_SHARE));
      this.foe.hp = Math.max(0, this.foe.hp - dmg);
      events.push(this.snap({ kind: 'burn', damage: dmg }));
      this.foeDown(events);
    }
    return events;
  }

  /** A turn passes for every pet's cooldowns. */
  private tick(): void {
    this.howl = Math.max(0, this.howl - 1);
    for (const cd of this.cooldowns) {
      for (let i = 0; i < cd.length; i++) cd[i] = Math.max(0, cd[i] - 1);
    }
  }
}

const RANK_REWARD: Record<Rank, { xp: number }> = {
  normal: { xp: 1 },
  rare: { xp: 1.6 },
  elite: { xp: 2.6 },
  boss: { xp: 6 },
};

/** Experience for each pet after driving a monster off, or a rival's whole line. */
export function victoryRewards(foe: Fighter | Fighter[]): { xp: number } {
  if (Array.isArray(foe)) return { xp: foe.reduce((sum, f) => sum + victoryRewards(f).xp, 0) };
  const rarityBonus = foe.species.rarity === 'rare' ? 1.6 : foe.species.rarity === 'uncommon' ? 1.25 : 1;
  const rank = RANK_REWARD[foe.rank].xp * (foe.rank === 'normal' || foe.rank === 'rare' ? 1 : 1 + 0.35 * (foe.tier - 1));
  return { xp: Math.round(14 * foe.level * rarityBonus * rank) };
}

/** Pets that fought share full experience; the rest of the party learns by watching, at half. */
export function shareXp(battle: Battle, xp: number): number[] {
  return battle.party.map((_, i) => (battle.fought.has(i) ? xp : Math.round(xp / 2)));
}
