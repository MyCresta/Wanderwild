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
}

export function makeFighter(species: Species, level: number, seed: number): Fighter {
  const stats = statsAt(species.base, level, individualFromSeed(seed, species.kind).trait);
  return { species, level, maxHp: stats.hp, hp: stats.hp, atk: stats.atk, def: stats.def };
}

export type Side = 'pet' | 'foe';
export type Action = 'strike' | 'move';

export interface Hit {
  attacker: Side;
  action: Action;
  name: string;
  damage: number;
  effectiveness: number;
  crit: boolean;
}

/** Element moves charge up: usable once every this many turns. */
export const MOVE_COOLDOWN = 3;
const MOVE_POWER = 1.5;
const CRIT_CHANCE = 0.1;

/** Monsters hit a little softer when the pet's element is what they are weak to. */
function foeEffectiveness(foe: Species, pet: Species): number {
  return foe.kind === 'monster' && pet.element === foe.weakTo ? 0.75 : 1;
}

/** A turn-based duel between the companion and a Blotspawn. */
export class Battle {
  /** Turns until the pet's element move is ready. */
  charge = 0;
  private foeCharge = 1;
  winner: Side | null = null;

  constructor(
    readonly pet: Fighter,
    readonly foe: Fighter,
    private readonly rng: Rng = Math.random,
  ) {}

  get moveReady(): boolean {
    return this.charge === 0;
  }

  private attack(from: Fighter, to: Fighter, side: Side, action: Action, moveElement: Element): Hit {
    const eff = action === 'move' ? (side === 'pet' ? effectiveness(moveElement, to.species) : foeEffectiveness(from.species, to.species)) : 1;
    const crit = this.rng() < CRIT_CHANCE;
    const dmg = damage(from.atk, to.def, action === 'move' ? MOVE_POWER : 1, eff, this.rng(), crit);
    to.hp = Math.max(0, to.hp - dmg);
    return { attacker: side, action, name: action === 'move' ? from.species.move : 'Strike', damage: dmg, effectiveness: eff, crit };
  }

  /** The pet acts, then the foe answers if it is still standing. */
  turn(action: Action): Hit[] {
    if (this.winner) return [];
    if (action === 'move' && !this.moveReady) action = 'strike';
    const hits: Hit[] = [this.attack(this.pet, this.foe, 'pet', action, this.pet.species.element)];
    this.charge = action === 'move' ? MOVE_COOLDOWN - 1 : Math.max(0, this.charge - 1);
    if (this.foe.hp <= 0) {
      this.winner = 'pet';
      return hits;
    }
    const foeAction: Action = this.foeCharge === 0 ? 'move' : 'strike';
    this.foeCharge = foeAction === 'move' ? MOVE_COOLDOWN : this.foeCharge - 1;
    hits.push(this.attack(this.foe, this.pet, 'foe', foeAction, this.foe.species.element));
    if (this.pet.hp <= 0) this.winner = 'foe';
    return hits;
  }
}

/** Experience for the companion and seals found after driving a monster off. */
export function victoryRewards(foe: Fighter): { xp: number; seals: number } {
  const rarityBonus = foe.species.rarity === 'rare' ? 1.6 : foe.species.rarity === 'uncommon' ? 1.25 : 1;
  return { xp: Math.round(14 * foe.level * rarityBonus), seals: foe.species.rarity === 'common' ? 1 : 2 };
}
