import { beatenBy, matchup } from './elements';
import { HERO_SPELLS, type HeroPower, type HeroSpellId } from '../game/hero';
import { FOE_TRAITS, foeScale, type FoeTrait, type Rank } from './foes';
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
  /** Elite tier 1-3 or boss tier 1-5. */
  tier: number;
  traits: FoeTrait[];
}

export function makeFighter(
  species: Species,
  level: number,
  seed: number,
  uid?: string,
  foe: { rank?: Rank; tier?: number; traits?: FoeTrait[] } = {},
): Fighter {
  const stats = statsAt(species.base, level, individualFromSeed(seed, species.kind).trait);
  const rank = foe.rank ?? 'normal';
  const tier = foe.tier ?? 1;
  const traits = foe.traits ?? [];
  const r = foeScale(rank, tier, level);
  const maxHp = Math.round(stats.hp * r.hp * (traits.includes('thick') ? 1.35 : 1));
  const atk = Math.round(stats.atk * r.power * (traits.includes('savage') ? 1.2 : 1));
  return { species, level, maxHp, hp: maxHp, atk, def: Math.round(stats.def * r.power), uid, rank, tier, traits };
}

export type Side = 'pet' | 'foe';
/** The three attacks every pet knows: a plain Strike, its element move, and its element's art. */
export type Attack = 'strike' | 'move' | 'art';

export type Action =
  | { kind: Attack; /** 0..1 from the timing ring; 1 is a perfect tap. */ quality?: number }
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
  | { kind: 'heal'; targets: number[]; amount: number; source: 'tonic' | 'art' }
  /** The hero's spell: damage to the foe, health back to `targets`, or neither for a blessing or curse. */
  | { kind: 'spell'; spell: HeroSpellId; damage?: number; amount?: number; targets?: number[] }
  | { kind: 'faint'; index: number }
) & { hp?: HpSnap };

/** Turns between uses: the element move is ready every other turn, the art every third. */
export const MOVE_COOLDOWN = 2;
export const ART_COOLDOWN = 3;
const MOVE_POWER = 1.7;
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

/** Each element's art: a trick rather than a blow, so there is always a choice to make. */
export const ARTS: Record<Element, { name: string; blurb: string }> = {
  ember: { name: 'Kindle', blurb: 'A light hit that sets the foe burning for 3 turns.' },
  tide: { name: 'Wellspring', blurb: 'Heals a third of its health.' },
  grove: { name: 'Thornguard', blurb: 'Halves the next hit and throws half of it back.' },
  stone: { name: 'Bulwark', blurb: 'Takes 60% less damage for 2 turns.' },
  gale: { name: 'Updraft', blurb: 'A light hit, then dodges the next attack.' },
  lumen: { name: 'Glimmer', blurb: 'Marks the weak spot: the next attack is critical.' },
};

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
 * A quick turn-based fight between a party of up to three pets and one Blotspawn.
 * Each turn the hero may cast one spell, then the active pet strikes, uses its element
 * move or art, swaps out or drinks a tonic; then the foe answers. The foe strikes twice and
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
  /** Foe turns left under a Hex, and party turns left under a Pack Howl. */
  hex = 0;
  howl = 0;
  /** The hero has cast this turn; one spell per turn. */
  cast = false;
  readonly hero: HeroPower | undefined;
  private foeTurns = 0;
  /** Whether the player has taken a first action yet. */
  private opened = false;
  private readonly rng: Rng;
  readonly tonicHeal: number;

  constructor(
    readonly party: Fighter[],
    readonly foe: Fighter,
    { rng = Math.random, petDamage = 1, petHealth = 1, hero, vigor, tonicPower = 1 }: BattleOptions = {},
  ) {
    this.rng = rng;
    this.hero = hero;
    this.tonicHeal = Math.round(TONIC_HEAL * tonicPower);
    this.cooldowns = party.map(() => ({ move: 0, art: 0 }));
    this.wardUp = foe.traits.includes('warded');
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

  private get artCooldown(): number {
    return Math.max(1, ART_COOLDOWN - (this.hero?.artHaste ?? 0));
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
    if (spell === 'wildcall') return this.cooldowns[this.active].move > 0 || this.cooldowns[this.active].art > 0;
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
        this.foeDown();
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
        this.cooldowns[this.active] = { move: 0, art: 0 };
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

  ready(attack: Attack): boolean {
    return attack === 'strike' || this.cooldowns[this.active][attack] === 0;
  }

  get moveReady(): boolean {
    return this.ready('move');
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
    const every = Math.max(2, (this.foe.traits.includes('swift') ? 2 : 3) - (this.enraged ? 1 : 0));
    const big = this.foeTurns % every === every - 1;
    return big ? { big, name: this.foe.species.move, element: this.foe.species.element } : { big, name: 'Strike', element: null };
  }

  private petHit(action: Attack, power: number, quality: number): BattleEvent[] {
    const pet = this.pet;
    const elemental = action !== 'strike';
    let eff = elemental ? matchup(pet.species.element, this.foe.species.element) : 1;
    const timed = action !== 'art';
    const crit = this.focus || (timed && quality >= this.critAt);
    this.focus = false;
    // A well-timed tap also nudges damage up; a missed one still lands.
    const timing = timed ? 0.85 + 0.15 * Math.min(1, quality / this.critAt) : 1;
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
    const dmg = Math.max(1, Math.round(damage(pet.atk, this.foe.def, power, eff, this.rng(), crit) * timing * howl * PACE));
    this.foe.hp = Math.max(0, this.foe.hp - dmg);
    const name = action === 'move' ? pet.species.move : action === 'art' ? ARTS[pet.species.element].name : 'Strike';
    events.unshift(this.snap({ kind: 'hit', attacker: 'pet', action, name, damage: dmg, effectiveness: elemental ? matchup(pet.species.element, this.foe.species.element) : 1, crit, warded }));
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
        return [this.snap({ kind: 'heal', targets: [this.active], amount: add, source: 'art' })];
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
    const soften = this.hex > 0 ? HEX_SOFTEN : 1;
    if (this.hex > 0) this.hex--;
    const raw = Math.max(1, Math.round(damage(this.foe.atk, pet.def, intent.big ? BIG_POWER : 1, eff, this.rng(), crit) * soften * FOE_PACE));
    const guard = this.guard;
    const dmg = guard ? Math.max(1, Math.round(raw * guard.through)) : raw;
    pet.hp = Math.max(0, pet.hp - dmg);
    const events: BattleEvent[] = [
      this.snap({ kind: 'hit', attacker: 'foe', action: intent.big ? 'big' : 'strike', name: intent.name, damage: dmg, effectiveness: eff, crit, guarded: !!guard }),
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

  /** Resolves one player action and the foe's answer. */
  turn(action: Action): BattleEvent[] {
    if (this.winner) return [];
    const events: BattleEvent[] = [];

    // A fainted pet can only be replaced, and replacing it is free. So is choosing who opens.
    if (this.mustSwap || (this.freeSwap && action.kind === 'swap')) {
      if (action.kind !== 'swap' || !this.canSwapTo(action.to)) return [];
      // Who opens has not fought yet; the one sent back only watches.
      if (this.freeSwap) this.fought.delete(this.active);
      return [this.swapTo(action.to)];
    }
    this.opened = true;

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
        if (kind === 'art') cd.art = this.artCooldown;
        break;
      }
      case 'swap':
        if (!this.canSwapTo(action.to)) return [];
        events.push(this.swapTo(action.to));
        this.tick();
        break;
      case 'tonic':
        events.push(this.heal([this.active], 0, 'tonic', this.tonicHeal));
        this.tick();
        break;
    }
    this.cast = false;
    if (this.foeDown()) return events;

    if (this.burn > 0) {
      this.burn--;
      const dmg = Math.max(1, Math.round(this.foe.maxHp * BURN_SHARE));
      this.foe.hp = Math.max(0, this.foe.hp - dmg);
      events.push(this.snap({ kind: 'burn', damage: dmg }));
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
    this.howl = Math.max(0, this.howl - 1);
    for (const cd of this.cooldowns) {
      cd.move = Math.max(0, cd.move - 1);
      cd.art = Math.max(0, cd.art - 1);
    }
  }
}

/** Arts that deal damage, and so care about the wheel. */
const hurts = (e: Element) => e === 'ember' || e === 'gale';

const RANK_REWARD: Record<Rank, { xp: number }> = {
  normal: { xp: 1 },
  rare: { xp: 1.6 },
  elite: { xp: 2.6 },
  boss: { xp: 6 },
};

/** Experience for each pet after driving a monster off. */
export function victoryRewards(foe: Fighter): { xp: number } {
  const rarityBonus = foe.species.rarity === 'rare' ? 1.6 : foe.species.rarity === 'uncommon' ? 1.25 : 1;
  const rank = RANK_REWARD[foe.rank].xp * (foe.rank === 'normal' || foe.rank === 'rare' ? 1 : 1 + 0.35 * (foe.tier - 1));
  return { xp: Math.round(14 * foe.level * rarityBonus * rank) };
}

/** Pets that fought share full experience; the rest of the party learns by watching, at half. */
export function shareXp(battle: Battle, xp: number): number[] {
  return battle.party.map((_, i) => (battle.fought.has(i) ? xp : Math.round(xp / 2)));
}
